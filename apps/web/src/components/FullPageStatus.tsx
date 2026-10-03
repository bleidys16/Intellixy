import { useEffect, useState } from "react";
import { BackLink } from "@/components/BackLink";
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
  // El backend gratuito se duerme tras un rato inactivo y tarda unos segundos en despertar;
  // sin este aviso, esa espera se ve igual que una app colgada.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (error) return;
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [error]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md">
          <ErrorNotice message={error} onRetry={onRetry} />
          {backHref && (
            <div className="mt-4">
              <BackLink href={backHref}>{backLabel}</BackLink>
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-ciruela/50">
      <span className="flex items-center gap-2">
        <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-ciruela/20 border-t-ciruela/60" />
        Cargando...
      </span>
      {slow && <span className="text-sm">Despertando el servidor, puede tardar unos segundos…</span>}
    </div>
  );
}
