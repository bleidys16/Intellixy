import OpenAI from "openai";
import type { QuizResponse } from "./types.js";

export async function generateQuiz(
  systemPrompt: string,
  userPrompt: string,
): Promise<QuizResponse> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("Falta NVIDIA_API_KEY en el .env (ver .env.example)");
  }
  const model = process.env.NVIDIA_MODEL ?? "meta/llama-3.1-70b-instruct";

  const client = new OpenAI({
    apiKey,
    baseURL: "https://integrate.api.nvidia.com/v1",
  });

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  return parseQuizJson(raw);
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
