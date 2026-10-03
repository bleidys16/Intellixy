import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { subjects } from "@/server/db/schema";
import { withRoute } from "@/server/http/safe";

const reorderSchema = z.object({
  /** Ids de TODAS las materias del usuario, en el orden deseado (primero = arriba). */
  orderedIds: z.array(z.string().uuid()).min(1),
});

/**
 * Reordena las materias del usuario (arrastrar en web, flechas subir/bajar en móvil).
 * El cliente manda la lista completa ya en el orden final; se valida que sea exactamente
 * el mismo conjunto de materias que ya tiene el usuario, para no poder tocar las de otro
 * ni dejar alguna sin posición.
 */
export const POST = withRoute(async (request: NextRequest) => {
  const userId = requireAuth(request);
  const parsed = reorderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { orderedIds } = parsed.data;

  const owned = await db.query.subjects.findMany({
    where: eq(subjects.userId, userId),
    columns: { id: true },
  });
  const ownedIds = new Set(owned.map((s) => s.id));
  const sameSet = orderedIds.length === ownedIds.size && orderedIds.every((id) => ownedIds.has(id));
  if (!sameSet) {
    return NextResponse.json({ error: "La lista no coincide con tus materias" }, { status: 400 });
  }

  const total = orderedIds.length;
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(subjects)
        .set({ position: total - i })
        .where(and(eq(subjects.id, orderedIds[i]), eq(subjects.userId, userId)));
    }
  });

  return NextResponse.json({ reordered: true });
});
