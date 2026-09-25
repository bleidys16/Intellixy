import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export function getGroqApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GROQ_API_KEY en el .env");
  }
  return apiKey;
}

/** Llama al endpoint de chat de Groq y devuelve el JSON de la respuesta. */
export async function groqChat(body: unknown): Promise<any> {
  return curlPost(GROQ_CHAT_URL, getGroqApiKey(), body);
}

/**
 * Llama a la API vía `curl` en lugar del cliente HTTP de Node: con este modelo
 * y esta red, las llamadas largas a través del fetch de Node se cortan
 * (ECONNRESET) antes de que llegue la respuesta; curl las aguanta bien.
 * Ver scripts/prueba-ia para el detalle de cómo se detectó el problema.
 */
async function curlPost(url: string, apiKey: string, body: unknown): Promise<any> {
  const dir = await mkdtemp(path.join(tmpdir(), "groq-"));
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
      throw new Error(`Groq API respondió HTTP ${status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
