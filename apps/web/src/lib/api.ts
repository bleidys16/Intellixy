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

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...options.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // `error` puede ser un objeto (errores de validación); solo un texto sirve como mensaje.
    const message = typeof body.error === "string" ? body.error : `Error ${res.status}`;
    throw new ApiError(message, res.status, typeof body.code === "string" ? body.code : undefined);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
