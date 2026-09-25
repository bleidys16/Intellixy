"use client";

import { useEffect } from "react";
import { Logo } from "@/components/Logo";

/** Se muestra cuando algo se rompe al pintar una pantalla. `retry` la vuelve a intentar sin recargar todo. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto h-9" />
        <h1 className="mt-8 font-display text-2xl font-semibold">Algo salió mal</h1>
        <p className="mt-2 text-sm text-ciruela/60">
          No pudimos mostrar esta pantalla. Tus datos están a salvo; inténtalo de nuevo y, si sigue igual, recarga la
          página.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 min-h-11 rounded-full bg-ciruela px-6 text-sm font-semibold text-oat transition-opacity hover:opacity-90"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}
