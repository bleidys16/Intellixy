/** Bloque gris pulsante que ocupa el lugar de un contenido que aún carga. Decorativo: el contenedor avisa con aria-busy. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-ciruela/10 ${className}`} />;
}

/** Silueta de una tarjeta de materia del inicio. */
export function SubjectCardSkeleton() {
  return (
    <div className="flex min-h-44 flex-col rounded-2xl bg-ciruela/5 p-5">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-2 h-4 w-1/3" />
      <div className="mt-auto pt-5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-2 h-2 w-full rounded-full" />
        <Skeleton className="mt-3 h-3 w-1/2" />
      </div>
    </div>
  );
}

/** Siluetas de filas de una lista (materiales, intentos...). */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}
