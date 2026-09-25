import type { ReactNode } from "react";

/** Estado vacío: qué falta y cómo empezar. `action` es opcional (un botón o enlace). */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-ciruela/20 px-6 py-10 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ciruela/60">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
