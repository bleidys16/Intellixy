import { eq } from "drizzle-orm";
import { generateQuestions } from "../ai/generateQuestions.js";
import type { GeneratedQuestion, MaterialBlock } from "../ai/types.js";
import { db } from "../db/client.js";
import { materialChunks, questions } from "../db/schema.js";
import { upsertTopics } from "./topics.js";

/**
 * Tope de texto que se envía al modelo (~15.000 tokens). El RAG con embeddings queda fuera
 * del MVP, así que un material largo no se manda entero: se toman páginas repartidas.
 */
const MAX_INPUT_CHARS = 60_000;

export type Chunk = typeof materialChunks.$inferSelect;

/**
 * Para comparar citas se ignoran mayúsculas, tildes y puntuación: el modelo suele "corregir"
 * las tildes al citar (o el PDF las perdió al generarse) y pdfjs separa la puntuación con
 * espacios ("ATP ."). Lo que sí se exige es que las mismas palabras aparezcan en el mismo orden.
 */
export function normalize(text: string): string {
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
export function selectChunks(chunks: Chunk[]): Chunk[] {
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

export interface MaterialRef {
  id: string;
  name: string;
  type: string;
}

export interface GenerationResult {
  questions: Array<
    typeof questions.$inferSelect & {
      topic: { id: string; name: string };
      /** Material de origen: la interfaz lo usa para separar las preguntas por material. */
      material: MaterialRef;
    }
  >;
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
  material: MaterialRef;
  count: number;
}): Promise<GenerationResult> {
  const t0 = Date.now();
  const allChunks = await db.query.materialChunks.findMany({
    where: eq(materialChunks.materialId, input.material.id),
    orderBy: (c, { asc }) => [asc(c.page)],
  });
  const chosen = selectChunks(allChunks);
  const blocks: MaterialBlock[] = chosen.map((c) => ({ page: c.page, text: c.text }));

  const tModel = Date.now();
  const generated = await generateQuestions(blocks, input.count);
  const modelMs = Date.now() - tModel;

  // La cita se valida contra el texto completo guardado de esa página.
  const chunkByPage = new Map(allChunks.map((c) => [c.page, c]));
  const valid: Array<{ q: GeneratedQuestion; chunk: Chunk; topicName: string }> = [];
  for (const q of generated) {
    const chunk = isWellFormed(q) ? chunkByPage.get(q.source.page) : undefined;
    if (!chunk || !normalize(chunk.text).includes(normalize(q.source.quote))) continue;
    valid.push({ q, chunk, topicName: q.topic.trim().slice(0, 120) });
  }

  // Escritura en lote: una consulta para los temas y otra para las preguntas (antes eran ~3 por pregunta).
  const saved: GenerationResult["questions"] = [];
  if (valid.length > 0) {
    const topicByName = await upsertTopics(input.subjectId, valid.map((v) => v.topicName));
    const topicRows = [...topicByName.values()];

    const rows = valid.filter((v) => topicByName.has(v.topicName));
    const inserted = await db
      .insert(questions)
      .values(
        rows.map(({ q, chunk, topicName }) => ({
          subjectId: input.subjectId,
          topicId: topicByName.get(topicName)!.id,
          chunkId: chunk.id,
          prompt: q.question,
          options: q.options,
          correctOption: q.correctOption,
          explanation: q.explanation,
          sourceQuote: q.source.quote,
        })),
      )
      .returning();
    for (const row of inserted) {
      const topic = topicRows.find((t) => t.id === row.topicId)!;
      saved.push({
        ...row,
        topic: { id: topic.id, name: topic.name },
        material: input.material,
      });
    }
  }
  const discarded = generated.length - saved.length;

  console.log(
    `[generar] ${input.material.name}: modelo ${modelMs} ms, total ${Date.now() - t0} ms, ` +
      `${generated.length} devueltas, ${saved.length} guardadas`,
  );

  const charsSent = chosen.reduce((sum, c) => sum + c.text.length, 0);
  const charsTotal = allChunks.reduce((sum, c) => sum + c.text.length, 0);
  return { questions: saved, discarded, sampled: charsSent < charsTotal };
}
