import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { generationJobs, materials, subjects } from "@/server/db/schema";
import { getOwnedSubject } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";
import { storage } from "@/server/storage/index";

export const GET = withRoute(async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
  const userId = requireAuth(request);
  const { subjectId } = await params;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) {
    return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ subject });
});

const updateSubjectSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
});

/** Renombrar y/o cambiar el color de la materia. */
export const PATCH = withRoute(
  async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
    const userId = requireAuth(request);
    const { subjectId } = await params;
    const subject = await getOwnedSubject(subjectId, userId);
    if (!subject) {
      return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
    }
    const parsed = updateSubjectSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    if (parsed.data.name === undefined && parsed.data.color === undefined) {
      return NextResponse.json({ subject });
    }

    const [updated] = await db
      .update(subjects)
      .set(parsed.data)
      .where(eq(subjects.id, subjectId))
      .returning();

    return NextResponse.json({ subject: updated });
  },
);

/**
 * Borra la materia entera: sus materiales, preguntas, tarjetas, intentos de quiz y
 * conversaciones con el tutor se van con ella (cascade). Los archivos en Blob no son parte
 * de la base de datos, así que se borran aparte, después de confirmar el borrado.
 */
export const DELETE = withRoute(
  async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
    const userId = requireAuth(request);
    const { subjectId } = await params;
    const subject = await getOwnedSubject(subjectId, userId);
    if (!subject) {
      return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
    }

    const generating = await db.query.generationJobs.findFirst({
      where: and(eq(generationJobs.subjectId, subjectId), inArray(generationJobs.status, ["procesando"])),
    });
    if (generating) {
      return NextResponse.json(
        { error: "Se está generando contenido en esta materia; espera a que termine" },
        { status: 409 },
      );
    }

    const materialsToPurge = await db.query.materials.findMany({
      where: eq(materials.subjectId, subjectId),
      columns: { storagePath: true },
    });

    await db.delete(subjects).where(eq(subjects.id, subjectId));

    for (const material of materialsToPurge) {
      if (!material.storagePath) continue;
      await storage.remove(material.storagePath).catch((err) => {
        console.error(`No se pudo borrar el archivo ${material.storagePath}:`, err);
      });
    }

    return NextResponse.json({ deleted: true });
  },
);
