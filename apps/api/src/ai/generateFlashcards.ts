import { chatJson } from "./chatJson.js";
import type { MaterialBlock } from "./types.js";

export interface GeneratedFlashcard {
  topic: string;
  front: string;
  back: string;
  source: { page: number; quote: string };
}

const SYSTEM_PROMPT = `Sos un generador de tarjetas de estudio (flashcards) para estudiantes universitarios.

Tu unica fuente de verdad es el material que te va a pasar el usuario a continuacion. Reglas estrictas:

1. Cada tarjeta debe basarse EXCLUSIVAMENTE en el texto dado, nunca en conocimiento general externo, aunque lo sepas.
2. Cada tarjeta debe traer una cita textual corta (entre 8 y 25 palabras) copiada LITERALMENTE del material, que respalde el reverso. Si no podes copiar un fragmento real y exacto, no generes esa tarjeta.
3. El frente es una pregunta corta y concreta, o un concepto o termino a definir. El reverso es la respuesta breve (maximo 2 oraciones). Nada de opciones multiples.
4. Una sola idea por tarjeta. El frente nunca debe contener la respuesta. No repitas ideas entre tarjetas.
5. Elegi lo que vale la pena memorizar (definiciones, causas, relaciones, fechas o cifras clave), no datos triviales.
6. Repartí las tarjetas entre las distintas partes del material, no te concentres en una sola seccion.
7. Devolvé SOLO un JSON valido, sin texto adicional, sin markdown, sin bloques de codigo, con exactamente este esquema:

{
  "flashcards": [
    {
      "topic": "string: tema puntual de la tarjeta",
      "front": "string: pregunta o concepto",
      "back": "string: respuesta breve",
      "source": { "page": number, "quote": "string: cita textual literal" }
    }
  ]
}`;

function buildUserPrompt(blocks: MaterialBlock[], count: number): string {
  const materialBlock = blocks.map((b) => `=== pagina: ${b.page} ===\n${b.text}`).join("\n\n");
  return `Material de estudio:\n\n${materialBlock}\n\nGenerá exactamente ${count} tarjetas repartidas entre las secciones de arriba, siguiendo las reglas del sistema.`;
}

export async function generateFlashcards(
  blocks: MaterialBlock[],
  count: number,
): Promise<GeneratedFlashcard[]> {
  return chatJson({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(blocks, count),
    maxTokens: 4096,
    validate: (parsed) => {
      const cards = (parsed as { flashcards?: unknown }).flashcards;
      if (!Array.isArray(cards)) throw new Error("El JSON no tiene un array 'flashcards'");
      return cards as GeneratedFlashcard[];
    },
  });
}
