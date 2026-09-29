import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { tutorConversations, tutorMessages } from "../db/schema";
import { refundUsage } from "../usage";
import { respondToMessage } from "./respond";

/**
 * Genera la respuesta pendiente `messageId`. Se llama desde `after()` en las rutas del tutor: en Vercel no
 * hay worker en segundo plano, así que la respuesta se procesa tras enviar el 202 y el cliente consulta
 * la conversación hasta que pasa a "listo". El UPDATE condicional reclama el mensaje (evita procesarlo dos veces).
 */
export async function processTutorMessage(messageId: string): Promise<void> {
  const claimed = await db.execute<{ id: string; conversation_id: string; usage_event_id: string | null }>(sql`
    update tutor_messages
    set status = 'procesando', error_message = null, updated_at = now()
    where id = ${messageId} and status = 'pendiente' and role = 'assistant'
    returning id, conversation_id, usage_event_id
  `);
  const message = claimed.rows[0];
  if (!message) return;
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
      .where(eq(tutorConversations.id, message.conversation_id));
  } catch (err) {
    console.error(`[tutor] falló la respuesta ${message.id}:`, err);
    // Si el modelo falla, el usuario no pierde el mensaje de su cuota diaria.
    if (message.usage_event_id) await refundUsage(message.usage_event_id).catch(() => {});
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
