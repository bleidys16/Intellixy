import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// El driver estándar de pg asume un proceso largo que reutiliza conexiones; en
// serverless cada invocación es un proceso nuevo y agotaría las conexiones de Neon.
// @neondatabase/serverless sí está hecho para esto (WebSocket, tolera el churn) y,
// a diferencia de su propio modo HTTP, soporta transacciones y FOR UPDATE SKIP LOCKED,
// que los workers de generación/materiales/tutor necesitan.
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Falta DATABASE_URL en el .env");
}

const pool = new Pool({ connectionString });

// Sin esto, un cliente inactivo que el servidor (p. ej. Neon) cierra por su cuenta
// tumba todo el proceso: emite 'error' en el pool y Node lo trata como excepción
// no capturada. El pool ya descarta ese cliente solo; aquí solo evitamos el crash.
pool.on("error", (err) => {
  console.error("Error inesperado en un cliente inactivo de PostgreSQL:", err);
});

export const db = drizzle(pool, { schema });
