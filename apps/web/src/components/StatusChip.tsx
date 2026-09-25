import type { MaterialStatus, TopicStatus } from "@/lib/types";
import { Sparkle } from "./Sparkle";

const BASE = "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium";

const TOPIC: Record<TopicStatus, { label: string; className: string }> = {
  debil: { label: "Débil", className: "bg-wine/10 text-wine" },
  en_progreso: { label: "En progreso", className: "bg-yuzu/60 text-ciruela" },
  dominado: { label: "Dominado", className: "bg-teal-deep/10 text-teal-deep" },
  sin_datos: { label: "Sin datos suficientes", className: "bg-ciruela/10 text-ciruela/60" },
};

const MATERIAL: Record<MaterialStatus, { label: string; className: string }> = {
  pendiente: { label: "En cola", className: "bg-ciruela/10 text-ciruela" },
  procesando: { label: "Procesando", className: "bg-card-blue text-ciruela" },
  listo: { label: "Listo", className: "bg-card-turquoise text-teal-deep" },
  error: { label: "Error", className: "bg-wine/10 text-wine" },
};

/** Estado de un tema; los dominados llevan la estrella de la marca como sello. */
export function TopicStatusChip({ status }: { status: TopicStatus }) {
  const { label, className } = TOPIC[status];
  return (
    <span className={`${BASE} ${className}`}>
      {status === "dominado" && <Sparkle className="h-3 w-3" />}
      {label}
    </span>
  );
}

/** Estado de un material: en cola, procesando, listo o error. */
export function MaterialStatusChip({ status }: { status: MaterialStatus }) {
  const { label, className } = MATERIAL[status];
  return (
    <span className={`${BASE} ${className}`}>
      {status === "procesando" && (
        <span
          aria-hidden
          className="h-3 w-3 animate-spin rounded-full border-2 border-ciruela/30 border-t-ciruela"
        />
      )}
      {label}
    </span>
  );
}
