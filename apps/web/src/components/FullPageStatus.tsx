import Link from "next/link";
import { ErrorNotice } from "@/components/ErrorNotice";

/**
 * Pantalla completa mientras se comprueba la sesión o una página carga; si algo falla, lo dice, deja reintentar
 * y, si se indica, ofrece volver a la pantalla anterior.
 */
export function FullPageStatus({
  error,
  onRetry,
  backHref,
  backLabel = "Volver",
}: {
  error?: string | null;
  onRetry?: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md">
          <ErrorNotice message={error} onRetry={onRetry} />
          {backHref && (
            <Link href={backHref} className="mt-4 inline-block text-sm font-medium text-teal-deep hover:underline">
              ← {backLabel}
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-1 items-center justify-center gap-2 text-ciruela/50">
      <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-ciruela/20 border-t-ciruela/60" />
      Cargando...
    </div>
  );
}
