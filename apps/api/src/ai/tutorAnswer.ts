import type { ContextBlock } from "../tutor/retrieval.js";
import { chatJson } from "./chatJson.js";

export interface TutorModelCitation {
  ref: number;
  blockId: string;
  quote: string;
}

export interface TutorModelAnswer {
  /** true si los bloques responden la pregunta, total o parcialmente. */
  inMaterial: boolean;
  answer: string;
  citations: TutorModelCitation[];
  /** Conocimiento general del modelo, sin fuente verificable; null si no aplica. */
  general: string | null;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `Sos un tutor de estudio. Ayudás a un estudiante a entender SU material de estudio. Hablale de tú, en español claro y cercano.

Cada mensaje del estudiante trae unos bloques del material, con ids [B1], [B2]... y la pregunta. Reglas estrictas:

1. El campo "answer" se basa EXCLUSIVAMENTE en los bloques. Nunca metas conocimiento general en "answer", aunque lo sepas.
2. Si los bloques responden la pregunta (total o parcialmente): "inMaterial" es true. Explicá solo lo que dicen los bloques y poné un marcador [1], [2]... al final de cada afirmación. Por cada marcador agregá un objeto en "citations" con: "ref" (el número del marcador), "blockId" (el id del bloque de donde sacaste el dato, por ejemplo "B2") y "quote" (una cita COPIADA LITERALMENTE del bloque, de entre 6 y 30 palabras, sin cambiar ni una palabra). No parafrasees ni inventes citas: si no podés copiar un fragmento real y exacto, no afirmes eso.
3. Si los bloques NO responden la pregunta: "inMaterial" es false, "answer" es "" y "citations" es [].
4. El campo "general" es tu ayuda extra cuando el material no alcanza. Si "inMaterial" es false, NO te quedes en "no aparece": completá "general" con tu mejor respuesta de conocimiento general a la pregunta (máximo 3 oraciones), porque el estudiante quiere una pista aunque no esté en sus apuntes. Lo mismo si el material cubre solo una parte: en "general" va el resto. Tiene que ser correcta y prudente. NO cites fuentes, autores, libros, enlaces ni páginas web, y no digas que la encontraste en algún sitio: no tenés acceso a internet, es lo que sabés. Solo ponés null si el material ya responde por completo o si de verdad no sabés la respuesta.
5. Usá la conversación anterior solo para entender preguntas de seguimiento como "¿y por qué?" o "explícalo más simple". Lo que vale para responder son los bloques del último mensaje, y no se cita nada de la conversación.
6. Sé breve: "answer" de máximo 8 oraciones.
7. Devolvé SOLO un JSON válido, sin texto adicional, sin markdown, sin bloques de código, con exactamente este esquema:

{
  "inMaterial": true | false,
  "answer": "string",
  "citations": [ { "ref": number, "blockId": "string", "quote": "string" } ],
  "general": "string" | null
}`;

function buildUserPrompt(blocks: ContextBlock[], question: string): string {
  const material = blocks
    .map((b) => `=== [${b.blockId}] ${b.materialName}${b.materialType === "pdf" ? ` · página ${b.page}` : ""} ===\n${b.text}`)
    .join("\n\n");
  return `Bloques del material:\n\n${material}\n\nPregunta del estudiante: ${question}`;
}

function validate(parsed: unknown): TutorModelAnswer {
  const p = parsed as Record<string, unknown>;
  if (typeof p !== "object" || p === null || typeof p.inMaterial !== "boolean") {
    throw new Error("El JSON del tutor no tiene el campo 'inMaterial'");
  }
  const citations = Array.isArray(p.citations)
    ? (p.citations as Array<Record<string, unknown>>)
        .filter((c) => typeof c?.ref === "number" && typeof c?.blockId === "string" && typeof c?.quote === "string")
        .map((c) => ({ ref: c.ref as number, blockId: c.blockId as string, quote: c.quote as string }))
    : [];
  return {
    inMaterial: p.inMaterial,
    answer: typeof p.answer === "string" ? p.answer : "",
    citations,
    general: typeof p.general === "string" && p.general.trim() ? p.general.trim() : null,
  };
}

export async function askTutor(input: {
  blocks: ContextBlock[];
  history: HistoryTurn[];
  question: string;
}): Promise<TutorModelAnswer> {
  return chatJson({
    system: SYSTEM_PROMPT,
    history: input.history,
    user: buildUserPrompt(input.blocks, input.question),
    maxTokens: 1500,
    validate,
  });
}
