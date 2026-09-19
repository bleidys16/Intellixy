import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE, verifySession } from "./jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  try {
    const { userId } = verifySession(token);
    req.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: "Sesión inválida o vencida" });
  }
}
