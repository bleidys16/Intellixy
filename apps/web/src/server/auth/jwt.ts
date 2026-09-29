import jwt from "jsonwebtoken";

export const AUTH_COOKIE = "intellixy_session";
const EXPIRES_IN = "7d";

const isProduction = process.env.NODE_ENV === "production";
/** Mismas opciones que en Express; con web y API en el mismo origen ya no hace falta sameSite:"none". */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction,
  maxAge: 7 * 24 * 60 * 60,
  path: "/",
};

export interface SessionPayload {
  userId: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Falta JWT_SECRET en el .env");
  }
  return secret;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: EXPIRES_IN });
}

export function verifySession(token: string): SessionPayload {
  return jwt.verify(token, getSecret()) as SessionPayload;
}
