import type { Request, Response } from "express";

/** Los errores no capturados en handlers async tumban el proceso en Express 4. */
export function safe<P>(handler: (req: Request<P>, res: Response) => Promise<void>) {
  return (req: Request<P>, res: Response) => {
    handler(req, res).catch((err) => {
      console.error(`Error en ${req.method} ${req.originalUrl}:`, err);
      if (!res.headersSent) res.status(500).json({ error: "Error interno del servidor" });
    });
  };
}
