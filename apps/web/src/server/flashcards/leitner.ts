/**
 * Repetición espaciada tipo Leitner con cinco cajas. Cada caja tiene un intervalo:
 * la 1 se repasa a diario y la 5 cada 16 días. Único lugar donde viven estas reglas.
 *
 * - "sabia" (lo sabía): sube una caja (tope: la 5) y vuelve a tocar según el intervalo de la nueva caja.
 * - "dude" (dudé): se queda en su caja y vuelve mañana, para reforzarla sin castigarla.
 * - "no_sabia" (no lo sabía): vuelve a la caja 1.
 */
export type ReviewResult = "sabia" | "dude" | "no_sabia";

export const REVIEW_RESULTS = ["sabia", "dude", "no_sabia"] as const;
export const MAX_BOX = 5;

/** Días hasta el próximo repaso, indexado por caja - 1. */
const BOX_INTERVAL_DAYS = [1, 2, 4, 8, 16];
const DAY_MS = 24 * 60 * 60 * 1000;

function intervalMs(box: number): number {
  return BOX_INTERVAL_DAYS[box - 1] * DAY_MS;
}

export function nextState(box: number, result: ReviewResult, now: Date): { box: number; dueAt: Date } {
  if (result === "sabia") {
    const next = Math.min(box + 1, MAX_BOX);
    return { box: next, dueAt: new Date(now.getTime() + intervalMs(next)) };
  }
  if (result === "dude") {
    return { box, dueAt: new Date(now.getTime() + DAY_MS) };
  }
  return { box: 1, dueAt: new Date(now.getTime() + intervalMs(1)) };
}
