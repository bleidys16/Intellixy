import { and, eq, inArray, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { materials, tutorConversations, tutorMessages } from "../db/schema.js";
import { getLimits, limitReachedBody } from "../limits.js";
import { countUsageLastDay, recordUsage, refundUsage } from "../usage.js";
import { getOwnedSubject, isUuid } from "./access.js";
import { safe } from "./safe.js";

/**
 * Tutor con historial. Cada pregunta crea dos mensajes: la del estudiante y una respuesta "pendiente" que un
 * worker completa (ver worker/tutorWorker.ts); la petición responde 202 y el cliente consulta la conversación
 * hasta que la respuesta pasa a "listo". Las respuestas solo se apoyan en el material de la materia y sus citas
 * están verificadas (ver tutor/respond.ts).
 */
export const tutorRouter = Router({ mergeParams: true });
tutorRouter.use(requireAuth);

const ACTIVE_STATUSES = ["pendiente", "procesando"];

const messageSchema = z.object({
  message: z.string().trim().min(1, "Escribe una pregunta").max(1000, "La pregunta es muy larga (máximo 1000 caracteres)"),
});

type Conversation = typeof tutorConversations.$inferSelect;
type Message = typeof tutorMessages.$inferSelect;
type SubjectParams = { subjectId: string };
type ConversationParams = SubjectParams & { conversationId: string };
type MessageParams = ConversationParams & { messageId: string };

function publicConversation(c: Conversation) {
  return { id: c.id, subjectId: c.subjectId, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt };
}

function publicMessage(m: Message) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    status: m.status,
    outcome: m.outcome,
    general: m.general,
    citations: m.citations,
    errorMessage: m.errorMessage,
    createdAt: m.createdAt,
  };
}

async function getOwnedConversation(subjectId: string, conversationId: string, userId: string) {
  if (!isUuid(conversationId)) return undefined;
  return db.query.tutorConversations.findFirst({
    where: and(
      eq(tutorConversations.id, conversationId),
      eq(tutorConversations.subjectId, subjectId),
      eq(tutorConversations.userId, userId),
    ),
  });
}

interface Reply {
  status: number;
  body: unknown;
}

/** Comprueba la cuota diaria del tutor. Devuelve la respuesta de error, o null si aún hay margen. */
async function checkQuota(userId: string): Promise<Reply | null> {
  const user = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, userId) });
  const limits = getLimits(user?.plan ?? "free");
  const used = await countUsageLastDay(userId, "ai_tutor");
  if (used >= limits.tutorMessagesPerDay) {
    return limitReachedBody(
      "tutorMessagesPerDay",
      `Ya usaste tus ${limits.tutorMessagesPerDay} preguntas al tutor de hoy`,
      limits.tutorMessagesPerDay,
    );
  }
  return null;
}

class Conflict extends Error {}

/** Empieza un turno: guarda la pregunta y deja la respuesta en cola. `conversation` es null si es la primera. */
async function startTurn(input: {
  userId: string;
  subjectId: string;
  conversation: Conversation | null;
  message: string;
}): Promise<Reply> {
  const ready = await db.query.materials.findFirst({
    where: and(eq(materials.subjectId, input.subjectId), eq(materials.status, "listo")),
  });
  if (!ready) {
    return { status: 422, body: { error: "Sube un material y espera a que esté listo antes de preguntarle al tutor" } };
  }
  const quota = await checkQuota(input.userId);
  if (quota) return quota;

  const user = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, input.userId) });
  const maxMessages = getLimits(user?.plan ?? "free").maxMessagesPerConversation;

  // La cuota se reserva antes para que peticiones simultáneas no se cuelen; si algo falla se devuelve.
  const usageEventId = await recordUsage(input.userId, "ai_tutor");
  try {
    const created = await db.transaction(async (tx) => {
      const now = new Date();
      let conversation = input.conversation;
      if (conversation) {
        // Se bloquea la conversación para que dos preguntas a la vez no se crucen.
        await tx.execute(sql`select id from tutor_conversations where id = ${conversation.id} for update`);
        const existing = await tx
          .select({ status: tutorMessages.status })
          .from(tutorMessages)
          .where(eq(tutorMessages.conversationId, conversation.id));
        if (existing.some((m) => ACTIVE_STATUSES.includes(m.status))) {
          throw new Conflict("El tutor todavía está respondiendo tu pregunta anterior");
        }
        if (existing.length + 2 > maxMessages) {
          throw new Conflict("Esta conversación ya es muy larga. Empieza una nueva");
        }
      } else {
        [conversation] = await tx
          .insert(tutorConversations)
          .values({
            userId: input.userId,
            subjectId: input.subjectId,
            title: input.message.replace(/\s+/g, " ").slice(0, 60),
            createdAt: now,
            updatedAt: now,
          })
          .returning();
      }
      const [question] = await tx
        .insert(tutorMessages)
        .values({ conversationId: conversation.id, role: "user", content: input.message, createdAt: now, updatedAt: now })
        .returning();
      // 1 ms después, para que la respuesta siempre quede detrás de la pregunta al ordenar.
      const later = new Date(now.getTime() + 1);
      const [answer] = await tx
        .insert(tutorMessages)
        .values({
          conversationId: conversation.id,
          role: "assistant",
          status: "pendiente",
          usageEventId,
          createdAt: later,
          updatedAt: later,
        })
        .returning();
      await tx.update(tutorConversations).set({ updatedAt: now }).where(eq(tutorConversations.id, conversation.id));
      return { conversation, question, answer };
    });
    return {
      status: 202,
      body: {
        conversation: publicConversation(created.conversation),
        messages: [publicMessage(created.question), publicMessage(created.answer)],
      },
    };
  } catch (err) {
    await refundUsage(usageEventId).catch(() => {});
    if (err instanceof Conflict) return { status: 409, body: { error: err.message } };
    throw err;
  }
}

/** Empieza una conversación nueva con su primera pregunta. */
tutorRouter.post<SubjectParams>(
  "/conversations",
  safe(async (req, res) => {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
    }
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Pregunta no válida" });
      return;
    }
    const reply = await startTurn({
      userId: req.userId!,
      subjectId: subject.id,
      conversation: null,
      message: parsed.data.message,
    });
    res.status(reply.status).json(reply.body);
  }),
);

/** Conversaciones de la materia, la más reciente primero. */
tutorRouter.get<SubjectParams>(
  "/conversations",
  safe(async (req, res) => {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
    }
    const rows = await db
      .select({
        conversation: tutorConversations,
        // "tutor_conversations"."id" va calificado a mano: con una sola tabla Drizzle omite el prefijo.
        messageCount: sql<number>`(
          select count(*)::int from ${tutorMessages}
          where ${tutorMessages.conversationId} = "tutor_conversations"."id"
        )`,
      })
      .from(tutorConversations)
      .where(and(eq(tutorConversations.subjectId, subject.id), eq(tutorConversations.userId, req.userId!)))
      .orderBy(sql`${tutorConversations.updatedAt} desc`)
      .limit(50);
    res.json({
      conversations: rows.map((r) => ({ ...publicConversation(r.conversation), messageCount: r.messageCount })),
    });
  }),
);

/** Una conversación con todos sus mensajes; el cliente la consulta mientras hay una respuesta pendiente. */
tutorRouter.get<ConversationParams>(
  "/conversations/:conversationId",
  safe(async (req, res) => {
    const conversation = await getOwnedConversation(req.params.subjectId, req.params.conversationId, req.userId!);
    if (!conversation) {
      res.status(404).json({ error: "Conversación no encontrada" });
      return;
    }
    const messages = await db.query.tutorMessages.findMany({
      where: eq(tutorMessages.conversationId, conversation.id),
      orderBy: (m, { asc }) => [asc(m.createdAt)],
    });
    res.json({
      conversation: publicConversation(conversation),
      messages: messages.map(publicMessage),
      pending: messages.some((m) => ACTIVE_STATUSES.includes(m.status)),
    });
  }),
);

/** Una pregunta más en la conversación. */
tutorRouter.post<ConversationParams>(
  "/conversations/:conversationId/messages",
  safe(async (req, res) => {
    const conversation = await getOwnedConversation(req.params.subjectId, req.params.conversationId, req.userId!);
    if (!conversation) {
      res.status(404).json({ error: "Conversación no encontrada" });
      return;
    }
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Pregunta no válida" });
      return;
    }
    const reply = await startTurn({
      userId: req.userId!,
      subjectId: conversation.subjectId,
      conversation,
      message: parsed.data.message,
    });
    res.status(reply.status).json(reply.body);
  }),
);

/** Vuelve a pedir una respuesta que falló (sin tener que reescribir la pregunta). Gasta cuota otra vez. */
tutorRouter.post<MessageParams>(
  "/conversations/:conversationId/messages/:messageId/retry",
  safe(async (req, res) => {
    const conversation = await getOwnedConversation(req.params.subjectId, req.params.conversationId, req.userId!);
    if (!conversation || !isUuid(req.params.messageId)) {
      res.status(404).json({ error: "Mensaje no encontrado" });
      return;
    }
    const messages = await db.query.tutorMessages.findMany({
      where: eq(tutorMessages.conversationId, conversation.id),
      orderBy: (m, { asc }) => [asc(m.createdAt)],
    });
    const target = messages.at(-1);
    if (!target || target.id !== req.params.messageId || target.role !== "assistant" || target.status !== "error") {
      res.status(409).json({ error: "Solo se puede reintentar la última respuesta si falló" });
      return;
    }
    const quota = await checkQuota(req.userId!);
    if (quota) {
      res.status(quota.status).json(quota.body);
      return;
    }
    const usageEventId = await recordUsage(req.userId!, "ai_tutor");
    try {
      const [retried] = await db
        .update(tutorMessages)
        .set({ status: "pendiente", errorMessage: null, usageEventId, updatedAt: new Date() })
        .where(and(eq(tutorMessages.id, target.id), inArray(tutorMessages.status, ["error"])))
        .returning();
      if (!retried) {
        await refundUsage(usageEventId).catch(() => {});
        res.status(409).json({ error: "Esta respuesta ya se está reintentando" });
        return;
      }
      res.status(202).json({ message: publicMessage(retried) });
    } catch (err) {
      await refundUsage(usageEventId).catch(() => {});
      throw err;
    }
  }),
);

tutorRouter.delete<ConversationParams>(
  "/conversations/:conversationId",
  safe(async (req, res) => {
    const conversation = await getOwnedConversation(req.params.subjectId, req.params.conversationId, req.userId!);
    if (!conversation) {
      res.status(404).json({ error: "Conversación no encontrada" });
      return;
    }
    await db.delete(tutorConversations).where(eq(tutorConversations.id, conversation.id));
    res.json({ deleted: true });
  }),
);
