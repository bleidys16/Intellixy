import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { materials, tutorConversations, tutorMessages } from "@/server/db/schema";
import { isUuid } from "@/server/http/access";
import { getLimits, limitReachedBody } from "@/server/limits";
import { countUsageLastDay, recordUsage, refundUsage } from "@/server/usage";

export const ACTIVE_STATUSES = ["pendiente", "procesando"];

export const messageSchema = z.object({
  message: z.string().trim().min(1, "Escribe una pregunta").max(1000, "La pregunta es muy larga (máximo 1000 caracteres)"),
});

export type Conversation = typeof tutorConversations.$inferSelect;
type Message = typeof tutorMessages.$inferSelect;

export function publicConversation(c: Conversation) {
  return { id: c.id, subjectId: c.subjectId, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt };
}

export function publicMessage(m: Message) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    status: m.status,
    outcome: m.outcome,
    general: m.general,
    web: m.web,
    citations: m.citations,
    errorMessage: m.errorMessage,
    createdAt: m.createdAt,
  };
}

export async function getOwnedConversation(subjectId: string, conversationId: string, userId: string) {
  if (!isUuid(conversationId)) return undefined;
  return db.query.tutorConversations.findFirst({
    where: and(
      eq(tutorConversations.id, conversationId),
      eq(tutorConversations.subjectId, subjectId),
      eq(tutorConversations.userId, userId),
    ),
  });
}

export interface Reply {
  status: number;
  body: unknown;
  /** Id de la respuesta pendiente que hay que procesar tras responder. */
  processId?: string;
}

/** Comprueba la cuota diaria del tutor. Devuelve la respuesta de error, o null si aún hay margen. */
export async function checkQuota(userId: string): Promise<Reply | null> {
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
export async function startTurn(input: {
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
      processId: created.answer.id,
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
