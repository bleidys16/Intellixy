import { and, eq } from "drizzle-orm";
import { generateQuestions } from "../ai/generateQuestions.js";
import type { GeneratedQuestion, MaterialBlock } from "../ai/types.js";
import { db } from "../db/client.js";
import { materialChunks, questions, topics } from "../db/schema.js";

/**
 * Tope de texto que se envía al modelo (~15.000 tokens). El RAG con embeddings queda fuera
 * del MVP, así que un material largo no se manda entero: se toman páginas repartidas.
 */
const MAX_INPUT_CHARS = 60_000;

type Chunk = typeof materialChunks.$inferSelect;

/**
 * Para comparar citas se ignoran mayúsculas, tildes y puntuación: el modelo suele "corregir"
 * las tildes al citar (o el PDF las perdió al generarse) y pdfjs separa la puntuación con
 * espacios ("ATP ."). Lo que sí se exige es que las mismas palabras aparezcan en el mismo orden.
 */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Si el material cabe en el presupuesto se envía completo; si no, se toma una página cada
 * `step` (repartidas por todo el material, no solo el principio) y cada página se recorta.
 */
function selectChunks(chunks: Chunk[]): Chunk[] {
  const total = chunks.reduce((sum, c) => sum + c.text.length, 0);
  if (total <= MAX_INPUT_CHARS) return chunks;

  const step = Math.ceil(total / MAX_INPUT_CHARS);
  let used = 0;
  const picked: Chunk[] = [];
  for (let i = 0; i < chunks.length; i += step) {
    const room = MAX_INPUT_CHARS - used;
    if (room <= 0) break;
    const text = chunks[i].text.slice(0, room);
    picked.push({ ...chunks[i], text });
    used += text.length;
  }
  return picked;
}

/** El modelo devuelve JSON libre: se descarta lo que no tenga la forma esperada. */
function isWellFormed(q: GeneratedQuestion): boolean {
  const optionKeys = ["a", "b", "c", "d"] as const;
  return (
    typeof q.topic === "string" &&
    q.topic.trim().length > 0 &&
    typeof q.question === "string" &&
    q.question.trim().length > 0 &&
    typeof q.explanation === "string" &&
    optionKeys.every((k) => typeof q.options?.[k] === "string" && q.options[k].trim().length > 0) &&
    optionKeys.includes(q.correctOption) &&
    typeof q.source?.quote === "string" &&
    typeof q.source?.page === "number"
  );
}

export interface GenerationResult {
  questions: Array<typeof questions.$inferSelect & { topic: { id: string; name: string } }>;
  /** Preguntas que el modelo devolvió pero se descartaron (mal formadas o con cita que no existe). */
  discarded: number;
  /** true si el material era demasiado largo y solo se envió una parte al modelo. */
  sampled: boolean;
}

/**
 * Genera preguntas a partir de los fragmentos de un material y las guarda. Regla de
 * "sin fuente, no hay respuesta": una pregunta solo se guarda si su cita existe literal
 * en la página que el modelo dice haber usado, y queda enlazada a ese fragmento.
 * Lanza si el modelo falla; el llamador decide qué hacer con la cuota.
 */
export async function generateForMaterial(input: {
  subjectId: string;
  materialId: string;
  count: number;
}): Promise<GenerationResult> {
  const allChunks = await db.query.materialChunks.findMany({
    where: eq(materialChunks.materialId, input.materialId),
    orderBy: (c, { asc }) => [asc(c.page)],
  });
  const chosen = selectChunks(allChunks);
  const blocks: MaterialBlock[] = chosen.map((c) => ({ page: c.page, text: c.text }));

  const generated = await generateQuestions(blocks, input.count);

  // La cita se valida contra el texto completo guardado de esa página.
  const chunkByPage = new Map(allChunks.map((c) => [c.page, c]));
  const saved: GenerationResult["questions"] = [];
  let discarded = 0;

  for (const q of generated) {
    const chunk = isWellFormed(q) ? chunkByPage.get(q.source.page) : undefined;
    if (!chunk || !normalize(chunk.text).includes(normalize(q.source.quote))) {
      discarded++;
      continue;
    }

    const topicName = q.topic.trim().slice(0, 120);
    const [inserted] = await db
      .insert(topics)
      .values({ subjectId: input.subjectId, name: topicName })
      .onConflictDoNothing({ target: [topics.subjectId, topics.name] })
      .returning();
    const topic =
      inserted ??
      (await db.query.topics.findFirst({
        where: and(eq(topics.subjectId, input.subjectId), eq(topics.name, topicName)),
      }));
    if (!topic) {
      discarded++;
      continue;
    }

    const [row] = await db
      .insert(questions)
      .values({
        subjectId: input.subjectId,
        topicId: topic.id,
        chunkId: chunk.id,
        prompt: q.question,
        options: q.options,
        correctOption: q.correctOption,
        explanation: q.explanation,
        sourceQuote: q.source.quote,
      })
      .returning();
    saved.push({ ...row, topic: { id: topic.id, name: topic.name } });
  }

  const charsSent = chosen.reduce((sum, c) => sum + c.text.length, 0);
  const charsTotal = allChunks.reduce((sum, c) => sum + c.text.length, 0);
  return { questions: saved, discarded, sampled: charsSent < charsTotal };
}
