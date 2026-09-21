import { getNvidiaApiKey, nvidiaChat } from "./nvidia.js";

/** Saca el objeto JSON de la respuesta del modelo, que a veces lo envuelve en ``` o añade texto. */
export function extractJson(raw: string): unknown {
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
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Pide al modelo una respuesta JSON y la valida. `validate` recibe el JSON ya parseado y devuelve
 * el resultado tipado, o lanza si no tiene la forma esperada. Se reintenta hasta dos veces más: con estos
 * modelos un JSON cortado o mal formado es lo más común y suele salir bien al segundo intento.
 */
export async function chatJson<T>(input: {
  system: string;
  /** Turnos anteriores de la conversación (opcional), en orden, entre el sistema y el mensaje nuevo. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  user: string;
  maxTokens: number;
  validate: (parsed: unknown) => T;
}): Promise<T> {
  getNvidiaApiKey();
  const model = process.env.NVIDIA_MODEL ?? "meta/llama-3.2-11b-vision-instruct";

  const body = {
    model,
    temperature: 0.2,
    max_tokens: input.maxTokens,
    messages: [
      { role: "system", content: input.system },
      ...(input.history ?? []),
      { role: "user", content: input.user },
    ],
  };

  const attempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const data = await nvidiaChat(body);
      const raw = data?.choices?.[0]?.message?.content ?? "";
      return input.validate(extractJson(raw));
    } catch (err) {
      lastError = err;
      // Los errores del proveedor (HTTP 5xx, 429, conexión caída) suelen durar unos segundos: se espera antes de
      // reintentar. Un JSON mal formado no necesita espera, solo otra generación.
      const transient = err instanceof Error && /HTTP (5\d\d|429)|Command failed/.test(err.message);
      if (attempt < attempts && transient) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
  throw lastError;
}
