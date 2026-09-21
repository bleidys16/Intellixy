import { and, asc, eq, lt } from "drizzle-orm";
import { askTutor, type HistoryTurn } from "../ai/tutorAnswer.js";
import { db } from "../db/client.js";
import { materialChunks, materials, tutorMessages, type TutorCitation } from "../db/schema.js";
import { normalize } from "../questions/generateForMaterial.js";
import { selectContext, type ContextBlock } from "./retrieval.js";

/** Cuántos intercambios (pregunta + respuesta) anteriores ve el modelo. La conversación completa se guarda igual. */
const HISTORY_TURNS = 3;
/** Una cita más corta que esto se acepta con demasiada facilidad ("el", "la Revolución"), así que no vale. */
const MIN_QUOTE_WORDS = 4;

export type TutorOutcome = "grounded" | "not_in_material" | "unverified";

export interface TutorReply {
  content: string;
  outcome: TutorOutcome;
  general: string | null;
  citations: TutorCitation[];
}

/** Lo que el modelo "recuerda" de una respuesta anterior. */
function replyForHistory(m: typeof tutorMessages.$inferSelect): string {
  if (m.outcome === "grounded") return m.content;
  return `Eso no aparece en tus apuntes.${m.general ? ` ${m.general}` : ""}`;
}

/**
 * Comprueba cada cita contra el bloque que el modelo dice haber usado: la cita tiene que existir literal
 * (ignorando tildes, mayúsculas y puntuación) en ese bloque. Las que no pasan se descartan y sus marcadores [n]
 * se quitan del texto; las que pasan se renumeran 1, 2, 3... para que el texto no tenga saltos.
 */
export function verifyCitations(
  answer: string,
  modelCitations: Array<{ ref: number; blockId: string; quote: string }>,
  blocks: ContextBlock[],
): { answer: string; citations: TutorCitation[] } {
  const byId = new Map(blocks.map((b) => [b.blockId, b]));
  const renumber = new Map<number, number>();
  const citations: TutorCitation[] = [];

  for (const c of modelCitations) {
    if (renumber.has(c.ref)) continue;
    const block = byId.get(c.blockId.replace(/[\[\]\s]/g, "").toUpperCase());
    const quote = normalize(c.quote);
    if (!block || quote.split(" ").length < MIN_QUOTE_WORDS) continue;
    if (!normalize(block.text).includes(quote)) continue;

    const ref = citations.length + 1;
    renumber.set(c.ref, ref);
    citations.push({
      ref,
      quote: c.quote.trim(),
      page: block.page,
      materialId: block.materialId,
      materialName: block.materialName,
      materialType: block.materialType,
    });
  }

  // Un solo recorrido: reemplaza [1], [2, 3]... por los números nuevos y borra los de citas descartadas.
  const cleaned = answer
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_m, list: string) => {
      const kept = list
        .split(",")
        .map((n) => renumber.get(Number(n.trim())))
        .filter((n): n is number => n !== undefined);
      return kept.length > 0 ? `[${[...new Set(kept)].join(", ")}]` : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();

  // Respuestas muy cortas a veces vienen sin marcadores aunque sí tengan citas: se añaden al final para que
  // el texto siempre apunte a sus fuentes.
  const hasMarker = /\[\d+(?:\s*,\s*\d+)*\]/.test(cleaned);
  const withMarkers =
    cleaned && citations.length > 0 && !hasMarker ? `${cleaned} [${citations.map((c) => c.ref).join(", ")}]` : cleaned;

  return { answer: withMarkers, citations };
}

/**
 * Genera la respuesta del tutor a la última pregunta de la conversación. Regla del plan, "sin fuente no hay
 * respuesta": el texto de `content` solo se muestra si al menos una cita se verificó en el material. Si el tema
 * no está en los apuntes, se dice claramente; el conocimiento general del modelo se ofrece aparte (`general`),
 * marcado como no verificado y sin fuentes inventadas.
 */
export async function respondToMessage(assistantMessageId: string): Promise<TutorReply> {
  const assistant = await db.query.tutorMessages.findFirst({
    where: eq(tutorMessages.id, assistantMessageId),
    with: { conversation: true },
  });
  if (!assistant) throw new Error("La respuesta ya no existe");

  const prior = await db.query.tutorMessages.findMany({
    where: and(
      eq(tutorMessages.conversationId, assistant.conversationId),
      lt(tutorMessages.createdAt, assistant.createdAt),
    ),
    orderBy: asc(tutorMessages.createdAt),
  });
  const last = prior.at(-1);
  if (!last || last.role !== "user") throw new Error("No hay una pregunta para responder");

  // Pares pregunta/respuesta anteriores; un intercambio cuya respuesta falló no cuenta.
  const exchanges: Array<{ question: string; reply: string }> = [];
  let waiting: string | null = null;
  for (const m of prior.slice(0, -1)) {
    if (m.role === "user") waiting = m.content;
    else if (m.status === "listo" && waiting !== null) {
      exchanges.push({ question: waiting, reply: replyForHistory(m) });
      waiting = null;
    }
  }
  const recent = exchanges.slice(-HISTORY_TURNS);
  const history: HistoryTurn[] = recent.flatMap((e) => [
    { role: "user" as const, content: e.question },
    { role: "assistant" as const, content: e.reply },
  ]);

  const chunks = await db
    .select({
      materialId: materials.id,
      materialName: materials.name,
      materialType: materials.type,
      page: materialChunks.page,
      text: materialChunks.text,
    })
    .from(materialChunks)
    .innerJoin(materials, eq(materialChunks.materialId, materials.id))
    .where(and(eq(materials.subjectId, assistant.conversation.subjectId), eq(materials.status, "listo")))
    .orderBy(asc(materials.createdAt), asc(materialChunks.page));
  if (chunks.length === 0) throw new Error("La materia no tiene material listo");

  // Las preguntas de seguimiento ("¿y por qué?") no traen palabras útiles: se busca con la anterior también.
  const query = [last.content, recent.at(-1)?.question].filter(Boolean).join(" ");
  const blocks = selectContext(chunks, query);

  const t0 = Date.now();
  const model = await askTutor({ blocks, history, question: last.content });
  const verified = verifyCitations(model.answer, model.citations, blocks);
  console.log(
    `[tutor] ${Date.now() - t0} ms, ${blocks.length} bloques, inMaterial=${model.inMaterial}, ` +
      `citas ${verified.citations.length}/${model.citations.length}`,
  );

  if (model.inMaterial && verified.citations.length > 0 && verified.answer) {
    return { content: verified.answer, outcome: "grounded", general: model.general, citations: verified.citations };
  }
  // El modelo dijo que sí estaba en el material pero no se pudo comprobar: no se muestra su texto.
  const outcome: TutorOutcome = model.inMaterial ? "unverified" : "not_in_material";
  return { content: "", outcome, general: model.general, citations: [] };
}
