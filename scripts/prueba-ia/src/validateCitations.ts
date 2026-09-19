import type { ExtractedMaterial, QuizQuestion } from "./types.js";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Chequeo automático mínimo: solo confirma que la cita citada exista, literal,
 * en la página que el modelo dice haber usado. No valida si la pregunta en sí
 * es correcta o si el tema tiene sentido — eso queda para la revisión manual.
 */
export function citationExists(materials: ExtractedMaterial[], question: QuizQuestion): boolean {
  const material = materials.find((m) => m.file === question.source.file);
  if (!material) return false;

  const page = material.pages.find((p) => p.page === question.source.page);
  if (!page) return false;

  return normalize(page.text).includes(normalize(question.source.quote));
}
