import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { subjects } from "../db/schema.js";

const uuidSchema = z.string().uuid();

/** Un id que no es UUID nunca existe; sin esta guarda Postgres lanza error de sintaxis. */
export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

/** La materia solo se devuelve si pertenece al usuario. */
export async function getOwnedSubject(subjectId: string, userId: string) {
  if (!isUuid(subjectId)) return undefined;
  return db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.userId, userId)),
  });
}
