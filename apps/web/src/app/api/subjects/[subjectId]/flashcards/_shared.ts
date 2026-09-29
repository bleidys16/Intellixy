import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { flashcards } from "@/server/db/schema";
import { MAX_BOX } from "@/server/flashcards/leitner";

export async function loadCards(options: {
  where: ReturnType<typeof and>;
  limit?: number;
  oldestDueFirst?: boolean;
}) {
  return db.query.flashcards.findMany({
    where: options.where,
    orderBy: (c, { asc }) => (options.oldestDueFirst ? [asc(c.dueAt), asc(c.createdAt)] : [asc(c.createdAt)]),
    limit: options.limit,
    with: { topic: true, chunk: { with: { material: true } } },
  });
}

type CardRow = Awaited<ReturnType<typeof loadCards>>[number];

export function toCard(c: CardRow) {
  return {
    id: c.id,
    front: c.front,
    back: c.back,
    box: c.box,
    dueAt: c.dueAt,
    createdAt: c.createdAt,
    topic: { id: c.topic.id, name: c.topic.name },
    source: {
      quote: c.sourceQuote,
      page: c.chunk.page,
      materialId: c.chunk.material.id,
      materialName: c.chunk.material.name,
      materialType: c.chunk.material.type,
    },
  };
}

/**
 * Totales de la materia. Se calcula en JavaScript con la misma hora que se usa al repasar,
 * así "pendientes" nunca depende de la zona horaria de la base de datos.
 */
export async function getStats(subjectId: string) {
  const rows = await db
    .select({ box: flashcards.box, dueAt: flashcards.dueAt })
    .from(flashcards)
    .where(eq(flashcards.subjectId, subjectId));
  const now = Date.now();
  const byBox = Array.from({ length: MAX_BOX }, () => 0);
  let due = 0;
  let nextDueAt: Date | null = null;
  for (const r of rows) {
    byBox[r.box - 1]++;
    if (r.dueAt.getTime() <= now) due++;
    else if (!nextDueAt || r.dueAt < nextDueAt) nextDueAt = r.dueAt;
  }
  return { total: rows.length, due, byBox, nextDueAt };
}
