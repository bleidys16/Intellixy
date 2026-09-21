import { eq } from "drizzle-orm";
import { generateFlashcards, type GeneratedFlashcard } from "../ai/generateFlashcards.js";
import type { MaterialBlock } from "../ai/types.js";
import { db } from "../db/client.js";
import { flashcards, materialChunks } from "../db/schema.js";
import { normalize, selectChunks, type Chunk } from "../questions/generateForMaterial.js";
import { upsertTopics } from "../questions/topics.js";

/** El modelo devuelve JSON libre: se descarta lo que no tenga la forma esperada. */
function isWellFormed(c: GeneratedFlashcard): boolean {
  return (
    typeof c.topic === "string" &&
    c.topic.trim().length > 0 &&
    typeof c.front === "string" &&
    c.front.trim().length > 0 &&
    typeof c.back === "string" &&
    c.back.trim().length > 0 &&
    typeof c.source?.quote === "string" &&
    typeof c.source?.page === "number"
  );
}

export interface FlashcardGenerationResult {
  created: number;
  /** Tarjetas devueltas por el modelo que se descartaron (mal formadas, cita inexistente o repetidas). */
  discarded: number;
  /** true si el material era demasiado largo y solo se envió una parte al modelo. */
  sampled: boolean;
}

/**
 * Genera tarjetas a partir de los fragmentos de un material y las guarda. Igual que con las
 * preguntas, "sin fuente, no hay respuesta": una tarjeta solo se guarda si su cita existe literal
 * en la página que el modelo dice haber usado, y queda enlazada a ese fragmento. Además se
 * descartan las que repiten el frente de una tarjeta que la materia ya tiene.
 */
export async function generateFlashcardsForMaterial(input: {
  subjectId: string;
  material: { id: string; name: string };
  count: number;
}): Promise<FlashcardGenerationResult> {
  const t0 = Date.now();
  const allChunks = await db.query.materialChunks.findMany({
    where: eq(materialChunks.materialId, input.material.id),
    orderBy: (c, { asc }) => [asc(c.page)],
  });
  const chosen = selectChunks(allChunks);
  const blocks: MaterialBlock[] = chosen.map((c) => ({ page: c.page, text: c.text }));

  const tModel = Date.now();
  const generated = await generateFlashcards(blocks, input.count);
  const modelMs = Date.now() - tModel;

  const existing = await db
    .select({ front: flashcards.front })
    .from(flashcards)
    .where(eq(flashcards.subjectId, input.subjectId));
  const seenFronts = new Set(existing.map((e) => normalize(e.front)));

  const chunkByPage = new Map<number, Chunk>(allChunks.map((c) => [c.page, c]));
  const valid: Array<{ card: GeneratedFlashcard; chunk: Chunk; topicName: string }> = [];
  for (const card of generated) {
    const chunk = isWellFormed(card) ? chunkByPage.get(card.source.page) : undefined;
    if (!chunk || !normalize(chunk.text).includes(normalize(card.source.quote))) continue;
    const key = normalize(card.front);
    if (seenFronts.has(key)) continue;
    seenFronts.add(key);
    valid.push({ card, chunk, topicName: card.topic.trim().slice(0, 120) });
  }

  if (valid.length > 0) {
    const topicByName = await upsertTopics(input.subjectId, valid.map((v) => v.topicName));
    const rows = valid.filter((v) => topicByName.has(v.topicName));
    if (rows.length > 0) {
      await db.insert(flashcards).values(
        rows.map(({ card, chunk, topicName }) => ({
          subjectId: input.subjectId,
          topicId: topicByName.get(topicName)!.id,
          chunkId: chunk.id,
          front: card.front.trim(),
          back: card.back.trim(),
          sourceQuote: card.source.quote,
          // Vence ya: las tarjetas nuevas entran a la cola de hoy. Se fija en JS (no now() de la BD) para
          // comparar siempre con la misma hora que usa el repaso.
          dueAt: new Date(),
        })),
      );
    }
    valid.length = rows.length;
  }

  const charsSent = chosen.reduce((sum, c) => sum + c.text.length, 0);
  const charsTotal = allChunks.reduce((sum, c) => sum + c.text.length, 0);
  console.log(
    `[tarjetas] ${input.material.name}: modelo ${modelMs} ms, total ${Date.now() - t0} ms, ` +
      `${generated.length} devueltas, ${valid.length} guardadas`,
  );
  return { created: valid.length, discarded: generated.length - valid.length, sampled: charsSent < charsTotal };
}
