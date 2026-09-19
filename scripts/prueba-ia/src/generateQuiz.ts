import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { QuizResponse } from "./types.js";

const execFileAsync = promisify(execFile);

const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export async function generateQuiz(
  systemPrompt: string,
  userPrompt: string,
): Promise<QuizResponse> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("Falta NVIDIA_API_KEY en el .env (ver .env.example)");
  }
  const model = process.env.NVIDIA_MODEL ?? "meta/llama-3.2-11b-vision-instruct";

  const body = {
    model,
    temperature: 0.2,
    max_tokens: 4096,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  // El tier gratis de NVIDIA NIM puede tener latencia y disponibilidad
  // variables por modelo; se reintenta una vez antes de darse por vencido.
  const attempts = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const data = await curlPost(NVIDIA_CHAT_URL, apiKey, body);
      const raw = data?.choices?.[0]?.message?.content ?? "";
      return parseQuizJson(raw);
    } catch (err) {
      lastError = err;
      console.warn(
        `Intento ${attempt}/${attempts} falló: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  throw lastError;
}

/**
 * Llama a la API vía `curl` en lugar del cliente HTTP de Node.
 *
 * El modelo tarda hasta un par de minutos en responder (cold start + genera
 * bastante texto). Durante esa espera, sin datos yendo y viniendo, la red de
 * este proyecto corta la conexión que abre Node (ECONNRESET) — probablemente
 * por una renegociación TLS que curl tolera pero el cliente fetch de Node no.
 * curl sí aguanta la espera sin problema, así que lo usamos como transporte.
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

/** El modelo a veces envuelve el JSON en ```json ... ``` pese a la instrucción; esto lo tolera. */
function parseQuizJson(raw: string): QuizResponse {
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

  const jsonSlice = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(jsonSlice) as QuizResponse;
  if (!Array.isArray(parsed.questions)) {
    throw new Error("El JSON no tiene un array 'questions'");
  }
  return parsed;
}
