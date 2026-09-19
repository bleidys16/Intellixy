import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { GeneratedQuestion, MaterialBlock } from "./types.js";

const execFileAsync = promisify(execFile);
const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const SYSTEM_PROMPT = `Sos un generador de preguntas de examen para estudiantes universitarios.

Tu unica fuente de verdad es el material que te va a pasar el usuario a continuacion. Reglas estrictas:

1. Cada pregunta debe basarse EXCLUSIVAMENTE en el texto dado, nunca en conocimiento general externo, aunque lo sepas.
2. Cada pregunta debe traer una cita textual corta (entre 8 y 25 palabras) copiada LITERALMENTE del material, que respalde la respuesta correcta. Si no podes copiar un fragmento real y exacto, no generes esa pregunta.
3. Cada pregunta es de opcion multiple con 4 opciones (a, b, c, d), una sola correcta. Las opciones incorrectas deben ser plausibles, no absurdas.
4. Repartí las preguntas entre las distintas partes del material, no te concentres en una sola seccion.
5. Devolvé SOLO un JSON valido, sin texto adicional, sin markdown, sin bloques de codigo, con exactamente este esquema:

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
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("Falta NVIDIA_API_KEY en el .env");
  }
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
      const data = await curlPost(NVIDIA_CHAT_URL, apiKey, body);
      const raw = data?.choices?.[0]?.message?.content ?? "";
      return parseQuestions(raw);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Llama a la API vía `curl` en lugar del cliente HTTP de Node: con este modelo
 * y esta red, las llamadas largas a través del fetch de Node se cortan
 * (ECONNRESET) antes de que llegue la respuesta; curl las aguanta bien.
 * Ver scripts/prueba-ia para el detalle de cómo se detectó el problema.
 */
async function curlPost(url: string, apiKey: string, body: unknown): Promise<any> {
  const dir = await mkdtemp(path.join(tmpdir(), "nim-"));
  const bodyPath = path.join(dir, "body.json");
  const outPath = path.join(dir, "out.json");

  try {
    await writeFile(bodyPath, JSON.stringify(body), "utf-8");

    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sS",
        "--max-time",
        "300",
        "-X",
        "POST",
        url,
        "-H",
        `Authorization: Bearer ${apiKey}`,
        "-H",
        "Content-Type: application/json",
        "--data-binary",
        `@${bodyPath}`,
        "-o",
        outPath,
        "-w",
        "%{http_code}",
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );

    const status = stdout.trim();
    const text = await readFile(outPath, "utf-8");
    if (!status.startsWith("2")) {
      throw new Error(`NVIDIA API respondió HTTP ${status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
