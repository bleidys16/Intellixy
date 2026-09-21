import { getNvidiaApiKey, nvidiaChat } from "./nvidia.js";
import type { GeneratedQuestion, MaterialBlock } from "./types.js";

const SYSTEM_PROMPT = `Sos un generador de preguntas de examen para estudiantes universitarios.

Tu unica fuente de verdad es el material que te va a pasar el usuario a continuacion. Reglas estrictas:

1. Cada pregunta debe basarse EXCLUSIVAMENTE en el texto dado, nunca en conocimiento general externo, aunque lo sepas.
2. Cada pregunta debe traer una cita textual corta (entre 8 y 25 palabras) copiada LITERALMENTE del material, que respalde la respuesta correcta. Si no podes copiar un fragmento real y exacto, no generes esa pregunta.
3. Cada pregunta es de opcion multiple con 4 opciones (a, b, c, d), una sola correcta.
4. Calidad de las opciones incorrectas: deben ser plausibles para alguien que estudio a medias. Usa errores comunes, conceptos parecidos del mismo material o afirmaciones que suenan bien pero son falsas segun el texto. Prohibido: opciones absurdas o que contradigan el sentido comun ("las personas seran malas"), opciones que digan lo contrario exacto de la correcta cambiando una palabra, y opciones que se solapen entre si o con la correcta (si dos opciones podrian ser verdaderas, reformula la pregunta).
5. Prohibido usar "todas las anteriores", "ninguna de las anteriores" o combinaciones de opciones. Las cuatro opciones deben tener longitud y estilo parecidos, para que la correcta no se note por ser mas larga o mas especifica. Varia la letra de la respuesta correcta entre preguntas.
6. Preguntá por conceptos, causas, relaciones o definiciones, no por datos triviales que se adivinan sin haber estudiado.
7. Repartí las preguntas entre las distintas partes del material, no te concentres en una sola seccion.
8. Devolvé SOLO un JSON valido, sin texto adicional, sin markdown, sin bloques de codigo, con exactamente este esquema:

{
  "questions": [
    {
      "topic": "string: tema puntual de la pregunta",
      "question": "string: enunciado de la pregunta",
      "options": { "a": "string", "b": "string", "c": "string", "d": "string" },
      "correctOption": "a" | "b" | "c" | "d",
      "explanation": "string: por que esa es la respuesta correcta",
      "source": { "page": number, "quote": "string: cita textual literal" }
    }
  ]
}`;

function buildUserPrompt(blocks: MaterialBlock[], questionCount: number): string {
  const materialBlock = blocks
    .map((b) => `=== pagina: ${b.page} ===\n${b.text}`)
    .join("\n\n");
  return `Material de estudio:\n\n${materialBlock}\n\nGenerá exactamente ${questionCount} preguntas repartidas entre las secciones de arriba, siguiendo las reglas del sistema.`;
}

export async function generateQuestions(
  blocks: MaterialBlock[],
  questionCount: number,
): Promise<GeneratedQuestion[]> {
  getNvidiaApiKey();
  const model = process.env.NVIDIA_MODEL ?? "meta/llama-3.2-11b-vision-instruct";

  const body = {
    model,
    temperature: 0.2,
    max_tokens: 4096,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(blocks, questionCount) },
    ],
  };

  const attempts = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const data = await nvidiaChat(body);
      const raw = data?.choices?.[0]?.message?.content ?? "";
      return parseQuestions(raw);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function parseQuestions(raw: string): GeneratedQuestion[] {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`No se encontró un JSON en la respuesta del modelo:\n${raw}`);
  }

  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { questions: GeneratedQuestion[] };
  if (!Array.isArray(parsed.questions)) {
    throw new Error("El JSON no tiene un array 'questions'");
  }
  return parsed.questions;
}
