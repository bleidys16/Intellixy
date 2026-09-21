/**
 * "en 3 horas", "en 2 días"... para cuándo toca la próxima tarjeta. Recibe `nowMs` en vez de
 * leer el reloj para que sea una función pura: quien la llama toma la hora en un efecto o manejador.
 */
export function formatDueIn(iso: string, nowMs: number): string {
  const diffMs = new Date(iso).getTime() - nowMs;
  if (diffMs <= 0) return "ahora";
  const hours = diffMs / 3_600_000;
  if (hours < 1) return "en menos de una hora";
  if (hours < 24) {
    const h = Math.round(hours);
    return `en ${h} ${h === 1 ? "hora" : "horas"}`;
  }
  const days = Math.round(hours / 24);
  return `en ${days} ${days === 1 ? "día" : "días"}`;
}
