import type { NextRequest } from "next/server";
import { AUTH_COOKIE, verifySession } from "./jwt";

/** Lanzado por `requireAuth`; el wrapper de rutas (`server/http/safe.ts`) lo traduce a un 401 JSON. */
export class AuthError extends Error {}

/** Bearer token o, si no hay, la cookie de sesión — igual que la versión Express. */
export function requireAuth(request: NextRequest): string {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const token = bearerToken || request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    throw new AuthError("No autenticado");
  }
  try {
    return verifySession(token).userId;
  } catch {
    throw new AuthError("Sesión inválida o vencida");
  }
}
