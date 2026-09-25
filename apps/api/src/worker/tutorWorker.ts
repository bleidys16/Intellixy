import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { tutorConversations, tutorMessages } from "../db/schema.js";
import { respondToMessage } from "../tutor/respond.js";
import { refundUsage } from "../usage.js";

const POLL_INTERVAL_MS = 1500;
/** Respuestas simultáneas. Cada una es una llamada larga a la IA. */
const CONCURRENCY = Number(process.env.TUTOR_CONCURRENCY ?? 2);

type Message = typeof tutorMessages.$inferSelect;

/**
 * Worker del tutor. La cola son las respuestas "pendiente" de `tutor_messages`; cada una se reclama con
 * FOR UPDATE SKIP LOCKED, igual que en los otros workers, así el cliente (web o Android) no depende de una
 * petición larga: pregunta, recibe 202 y consulta la conversación hasta que la respuesta está lista.
 */
export function startTutorWorker(): () => void {
  let stopped = false;
  const timers = new Set<NodeJS.Timeout>();

  function loop() {
    async function tick() {
      if (stopped) return;
      let idle = true;
      try {
        const message = await claimNext();
        if (message) {
          idle = false;
          await processMessage(message);
        }
      } catch (err) {
        console.error("[tutor] error en el ciclo:", err);
      }
      if (!stopped) {
        const t = setTimeout(() => {
          timers.delete(t);
          void tick();
        }, idle ? POLL_INTERVAL_MS : 0);
        timers.add(t);
      }
    }
    void tick();
  }

  void recoverInterrupted()
    .catch((err) => console.error("[tutor] no se pudo recuperar respuestas interrumpidas:", err))
    .finally(() => {
      if (stopped) return;
      for (let i = 0; i < CONCURRENCY; i++) loop();
    });

  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
  };
}

/** Una respuesta en "procesando" al arrancar se cortó porque el API se reinició: vuelve a la cola. */
async function recoverInterrupted() {
  const recovered = await db
    .update(tutorMessages)
    .set({ status: "pendiente", updatedAt: new Date() })
    .where(eq(tutorMessages.status, "procesando"))
    .returning({ id: tutorMessages.id });
  if (recovered.length > 0) console.log(`[tutor] ${recovered.length} respuesta(s) interrumpida(s) vuelven a la cola`);
}

async function claimNext(): Promise<Message | null> {
  const claimed = await db.execute<{ id: string }>(sql`
    update tutor_messages
    set status = 'procesando', error_message = null, updated_at = now()
    where id = (
      select id from tutor_messages
      where status = 'pendiente' and role = 'assistant'
      order by created_at
      limit 1
      for update skip locked
    )
    returning id
  `);
  const id = claimed.rows[0]?.id;
  if (!id) return null;
  return (await db.query.tutorMessages.findFirst({ where: eq(tutorMessages.id, id) })) ?? null;
}

async function processMessage(message: Message) {
  try {
    const reply = await respondToMessage(message.id);
    await db
      .update(tutorMessages)
      .set({
        status: "listo",
        content: reply.content,
        outcome: reply.outcome,
        general: reply.general,
        web: reply.web,
        citations: reply.citations,
        updatedAt: new Date(),
      })
      .where(eq(tutorMessages.id, message.id));
    await db
      .update(tutorConversations)
      .set({ updatedAt: new Date() })
      .where(eq(tutorConversations.id, message.conversationId));
  } catch (err) {
    console.error(`[tutor] falló la respuesta ${message.id}:`, err);
    // Si el modelo falla, el usuario no pierde el mensaje de su cuota diaria.
    if (message.usageEventId) await refundUsage(message.usageEventId).catch(() => {});
    await db
      .update(tutorMessages)
      .set({
        status: "error",
        errorMessage: "No se pudo generar la respuesta. Inténtalo de nuevo",
        usageEventId: null,
        updatedAt: new Date(),
      })
      .where(eq(tutorMessages.id, message.id));
  }
}
