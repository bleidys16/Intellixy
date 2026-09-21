import { normalize } from "../questions/generateForMaterial.js";

/** Un fragmento (página) de un material de la materia. */
export interface SourceChunk {
  materialId: string;
  materialName: string;
  materialType: string;
  page: number;
  text: string;
}

/** Fragmento elegido para el contexto del modelo, con el id (B1, B2...) con el que la respuesta lo cita. */
export interface ContextBlock extends SourceChunk {
  blockId: string;
}

/** Tope de texto del contexto (~12.000 tokens): deja espacio al historial y a la respuesta. */
export const MAX_CONTEXT_CHARS = 48_000;

/** Palabras que no ayudan a encontrar el fragmento adecuado. */
const STOPWORDS = new Set(
  (
    "que los las del por para con una uno unos unas como pero esto esta este estos estas son fue fueron ser era " +
    "sus mas entre cuando donde porque sobre tambien muy hay han haber cual cuales quien quienes cuanto cuantos " +
    "puede pueden segun desde hasta hacia sin les nos mis tus todo toda todos todas otro otra otros otras asi " +
    "explica explicame dime dame decime cuentame resume resumeme hablame por que cual es"
  ).split(" "),
);

/** Las palabras se comparan por su raíz (5 letras) para que "impuesto" y "impuestos" coincidan. */
const stem = (word: string) => word.slice(0, 5);

function stems(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
      .map(stem),
  );
}

/**
 * Elige qué fragmentos ve el modelo. Si todo el material de la materia cabe en el presupuesto se
 * envía completo; si no, se eligen los fragmentos que más se parecen a la pregunta (coincidencia de
 * palabras ponderada por lo raras que son) hasta llenar el presupuesto. Es la versión sin embeddings del
 * "RAG progresivo" del plan; cuando existan los embeddings, solo cambia esta función.
 */
export function selectContext(chunks: SourceChunk[], query: string): ContextBlock[] {
  const total = chunks.reduce((sum, c) => sum + c.text.length, 0);
  let picked: SourceChunk[];

  if (total <= MAX_CONTEXT_CHARS) {
    picked = chunks;
  } else {
    const queryStems = stems(query);
    const chunkStems = chunks.map((c) => stems(c.text));
    const docFreq = new Map<string, number>();
    for (const set of chunkStems) for (const s of set) docFreq.set(s, (docFreq.get(s) ?? 0) + 1);

    const scored = chunks.map((chunk, index) => {
      let score = 0;
      for (const s of queryStems) {
        if (chunkStems[index].has(s)) score += Math.log(1 + chunks.length / (docFreq.get(s) ?? 1));
      }
      return { chunk, index, score };
    });

    const byRelevance = scored.some((x) => x.score > 0)
      ? [...scored].sort((a, b) => b.score - a.score || a.index - b.index)
      : // Sin ninguna coincidencia: una muestra repartida por todo el material, para que el modelo vea algo.
        scored.filter((_, i) => i % Math.ceil(chunks.length / 20) === 0);

    const chosen: Array<{ chunk: SourceChunk; index: number }> = [];
    let used = 0;
    for (const { chunk, index } of byRelevance) {
      const room = MAX_CONTEXT_CHARS - used;
      if (room <= 0) break;
      const text = chunk.text.slice(0, room);
      chosen.push({ chunk: { ...chunk, text }, index });
      used += text.length;
    }
    // Se devuelven en el orden original del material, que es como se leen.
    picked = chosen.sort((a, b) => a.index - b.index).map((x) => x.chunk);
  }

  return picked.map((c, i) => ({ ...c, blockId: `B${i + 1}` }));
}
