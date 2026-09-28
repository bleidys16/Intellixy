import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Falta DATABASE_URL en el .env");
}

const pool = new Pool({ connectionString });

// Sin esto, un cliente inactivo que el servidor (p. ej. Neon) cierra por su cuenta
// tumba todo el proceso: pg emite 'error' en el pool y Node lo trata como excepción
// no capturada. El pool ya descarta ese cliente solo; aquí solo evitamos el crash.
pool.on("error", (err) => {
  console.error("Error inesperado en un cliente inactivo de PostgreSQL:", err);
});

export const db = drizzle(pool, { schema });
