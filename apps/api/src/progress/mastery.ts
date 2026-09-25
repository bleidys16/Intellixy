/**
 * Dominio por tema: promedio ponderado de las evidencias (respuestas de quiz y repasos de tarjetas) donde
 * las recientes pesan más: w = 0.5^(días / vida media). Único lugar donde viven estas reglas.
 * Los valores son iniciales y se calibran con uso real.
 */

/** Cada cuántos días pierde la mitad de su peso una evidencia. */
export const HALF_LIFE_DAYS = 14;
/** Evidencias mínimas para mostrar un dominio; con menos, el tema queda "sin_datos" en lugar de marcarse débil. */
export const MIN_EVIDENCE = 8;
/** Por debajo de este dominio un tema es "debil"; desde WEAK_BELOW hasta MASTERED_FROM, "en_progreso". */
export const WEAK_BELOW = 0.6;
export const MASTERED_FROM = 0.8;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TopicStatus = "sin_datos" | "debil" | "en_progreso" | "dominado";

/** Una respuesta o un repaso. `score` va de 0 (fallo) a 1 (acierto); las tarjetas dudosas valen a medias. */
export interface Evidence {
  score: number;
  at: Date;
}

export function evidenceWeight(at: Date, now: Date): number {
  const days = Math.max(0, (now.getTime() - at.getTime()) / DAY_MS);
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/** Dominio de 0 a 1, o null si no hay evidencias. */
export function masteryOf(evidence: Evidence[], now: Date): number | null {
  if (evidence.length === 0) return null;
  let weighted = 0;
  let total = 0;
  for (const e of evidence) {
    const w = evidenceWeight(e.at, now);
    weighted += w * e.score;
    total += w;
  }
  return total > 0 ? weighted / total : null;
}

export function statusOf(mastery: number | null, evidenceCount: number): TopicStatus {
  if (mastery === null || evidenceCount < MIN_EVIDENCE) return "sin_datos";
  if (mastery < WEAK_BELOW) return "debil";
  if (mastery < MASTERED_FROM) return "en_progreso";
  return "dominado";
}
