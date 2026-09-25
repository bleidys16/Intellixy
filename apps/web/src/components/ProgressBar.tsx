import type { TopicStatus } from "@/lib/types";

/**
 * Barra de progreso única de la app. El tono decide los colores:
 * - "brand": riel ciruela con relleno turquesa (sobre fondos claros, 9.6:1).
 * - "card": relleno ciruela sobre riel suave, para dentro de una tarjeta de color.
 * - un estado de tema: el relleno toma el color del estado (débil, en progreso, dominado).
 */
export type ProgressTone = "brand" | "card" | TopicStatus;

const TONES: Record<ProgressTone, { rail: string; fill: string }> = {
  brand: { rail: "bg-ciruela", fill: "bg-turquesa" },
  card: { rail: "bg-ciruela/15", fill: "bg-ciruela" },
  debil: { rail: "bg-ciruela/10", fill: "bg-wine" },
  en_progreso: { rail: "bg-ciruela/10", fill: "bg-soft-blue" },
  dominado: { rail: "bg-ciruela/10", fill: "bg-teal-deep" },
  sin_datos: { rail: "bg-ciruela/10", fill: "bg-ciruela/20" },
};

interface Props {
  /** Avance actual; null = sin medir (la barra queda vacía y sin valor para lectores de pantalla). */
  value: number | null;
  /** Valor que equivale al 100%. */
  max?: number;
  /** Qué mide la barra, para lectores de pantalla. */
  label: string;
  tone?: ProgressTone;
  className?: string;
}

export function ProgressBar({ value, max = 100, label, tone = "brand", className = "" }: Props) {
  const colors = TONES[tone];
  const percent = value !== null && max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={`h-2 overflow-hidden rounded-full ${colors.rail} ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
    >
      <div className={`h-full rounded-full transition-all ${colors.fill}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
