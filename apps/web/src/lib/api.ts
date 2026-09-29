// La API vive en el mismo proyecto/origen que la web (Route Handlers bajo /api), así que no
// hace falta deducir host ni puerto — ni CORS, ni cold start de un servidor aparte.
const API_URL = "/api";

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

const TOKEN_KEY = "intellixy_token";

/** Guardar el JWT después de login/registro. */
export function setToken(token: string) {
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
}

/** Leer el JWT guardado. */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** Borrar el JWT (logout). */
export function clearToken() {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Con FormData el navegador fija solo el Content-Type (con el boundary); forzar JSON rompe la subida.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
  };

  // Adjuntar token Bearer si existe (también sirve para la app empaquetada en Android)
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: { ...headers, ...options.headers },
    });
  } catch {
    // Sin conexión o servidor caído: fetch lanza un TypeError sin nada útil para mostrar.
    throw new ApiError("No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.", 0, "NETWORK");
  }

  if (!res.ok) {
    // Si la API rechaza el token, lo borramos para no seguir enviándolo.
    if (res.status === 401) clearToken();
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
