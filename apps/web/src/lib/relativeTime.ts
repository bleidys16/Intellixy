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

/** "hoy", "ayer", "hace 3 días"... para cuándo fue lo último que estudió. Igual que arriba, recibe `nowMs`. */
export function formatAgo(iso: string, nowMs: number): string {
  const days = Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `hace ${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
  }
  const months = Math.floor(days / 30);
  return `hace ${months} ${months === 1 ? "mes" : "meses"}`;
}
