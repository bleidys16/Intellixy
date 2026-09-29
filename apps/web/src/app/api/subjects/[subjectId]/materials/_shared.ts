import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { materials } from "@/server/db/schema";
import { getOwnedSubject } from "@/server/http/access";

type Material = typeof materials.$inferSelect;

/** La ruta interna del archivo en el almacenamiento no se expone al cliente. */
export function publicMaterial(material: Material) {
  const { storagePath: _storagePath, ...rest } = material;
  return rest;
}

const uuidSchema = z.string().uuid();

export async function getOwnedMaterial(subjectId: string, materialId: string, userId: string) {
  if (!uuidSchema.safeParse(materialId).success) return null;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) return null;
  return (
    (await db.query.materials.findFirst({
      where: and(eq(materials.id, materialId), eq(materials.subjectId, subject.id)),
    })) ?? null
  );
}
