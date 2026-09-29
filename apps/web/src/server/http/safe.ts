import { NextResponse } from "next/server";
import { AuthError } from "../auth/middleware";
import { ExtractionError } from "../extraction/errors";

/**
 * Equivalente al `safe()` de Express (routes/safe.ts): atrapa lo que lance el handler y lo
 * convierte en una respuesta JSON, para no tener que repetir try/catch en cada ruta.
 * `requireAuth` ya no es middleware previo (no existe en Route Handlers) — se llama dentro
 * del handler y este wrapper atrapa su `AuthError`.
 */
export function withRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json({ error: err.message }, { status: 401 });
      }
      if (err instanceof ExtractionError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      console.error("Error en la ruta:", err);
      return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
    }
  };
}
