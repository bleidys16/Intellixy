const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Código estable de la API, p. ej. "LIMIT_REACHED" cuando se supera un límite del plan. */
    public code?: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Con FormData el navegador fija solo el Content-Type (con el boundary); forzar JSON rompe la subida.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...options.headers },
    });
  } catch {
    // Sin conexión o servidor caído: fetch lanza un TypeError sin nada útil para mostrar.
    throw new ApiError("No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.", 0, "NETWORK");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // `error` puede ser un objeto (errores de validación); solo un texto sirve como mensaje.
    const message = typeof body.error === "string" ? body.error : `Error ${res.status}`;
    throw new ApiError(message, res.status, typeof body.code === "string" ? body.code : undefined);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Texto para mostrar al usuario: el mensaje de la API si lo hay; si no, el de respaldo. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** true cuando el recurso no existe (o ya no): ahí sí conviene salir de la pantalla en vez de mostrar un error. */
export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}
