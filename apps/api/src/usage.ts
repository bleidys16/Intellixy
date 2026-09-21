import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { materials, subjects, usageEvents } from "./db/schema.js";

export type UsageKind = "ai_generation" | "ai_ocr" | "upload";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Devuelve el id del evento por si hay que reembolsarlo con `refundUsage`. */
export async function recordUsage(userId: string, kind: UsageKind): Promise<string> {
  const [event] = await db.insert(usageEvents).values({ userId, kind }).returning({ id: usageEvents.id });
  return event.id;
}

/** Anula un evento de uso (p. ej. si la IA falló y el usuario no debe perder la cuota). */
export async function refundUsage(eventId: string): Promise<void> {
  await db.delete(usageEvents).where(eq(usageEvents.id, eventId));
}

/** Cuenta los eventos de las últimas 24 h (ventana móvil, no día calendario). */
export async function countUsageLastDay(userId: string, kind: UsageKind): Promise<number> {
  const since = new Date(Date.now() - DAY_MS);
  const [row] = await db
    .select({ total: sql<string>`count(*)` })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), eq(usageEvents.kind, kind), gte(usageEvents.createdAt, since)));
  return Number(row.total);
}

export async function countMaterialsInSubject(subjectId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`count(*)` })
    .from(materials)
    .where(eq(materials.subjectId, subjectId));
  return Number(row.total);
}

export async function getStorageUsedBytes(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${materials.sizeBytes}), 0)` })
    .from(materials)
    .innerJoin(subjects, eq(materials.subjectId, subjects.id))
    .where(eq(subjects.userId, userId));
  return Number(row.total);
}
