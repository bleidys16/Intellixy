import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { topics } from "../db/schema.js";

type Topic = typeof topics.$inferSelect;

/**
 * Crea los temas que falten en la materia (el nombre es único por materia) y devuelve
 * todos indexados por nombre. Preguntas y tarjetas comparten temas, así que la analítica
 * de dominio por tema las trata como una sola cosa.
 */
export async function upsertTopics(subjectId: string, names: string[]): Promise<Map<string, Topic>> {
  const unique = [...new Set(names)];
  if (unique.length === 0) return new Map();
  await db
    .insert(topics)
    .values(unique.map((name) => ({ subjectId, name })))
    .onConflictDoNothing({ target: [topics.subjectId, topics.name] });
  const rows = await db.query.topics.findMany({
    where: and(eq(topics.subjectId, subjectId), inArray(topics.name, unique)),
  });
  return new Map(rows.map((t) => [t.name, t]));
}
