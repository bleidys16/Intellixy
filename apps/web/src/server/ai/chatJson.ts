import { getGroqApiKey, groqChat } from "./groq";

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
 * el resultado tipado, o lanza si no tiene la forma esperada. Se reintenta una vez más: con estos
 * modelos un JSON cortado o mal formado es lo más común y suele salir bien al segundo intento.
 *
 * Solo 2 intentos y sin espera entre ellos (antes 3 intentos + backoff de hasta 4s): cada intento
 * cuelga de una invocación de Vercel con 60s de presupuesto total, así que reintentar con demora
 * arriesga cortar la función a medio segundo intento. Un fallo por error transitorio (5xx/429) ya
 * no se reintenta aquí — el job queda en "error" y el usuario reintenta manualmente, o lo recoge el
 * barrido externo (ver plan de migración).
 */
export async function chatJson<T>(input: {
  system: string;
  /** Turnos anteriores de la conversación (opcional), en orden, entre el sistema y el mensaje nuevo. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  user: string;
  maxTokens: number;
  validate: (parsed: unknown) => T;
}): Promise<T> {
  getGroqApiKey();
  const model = process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b";

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

  const attempts = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const data = await groqChat(body);
      const raw = data?.choices?.[0]?.message?.content ?? "";
      return input.validate(extractJson(raw));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
