import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { flashcards, generationJobs, materialChunks, materials, questions } from "@/server/db/schema";
import { withRoute } from "@/server/http/safe";
import { storage } from "@/server/storage/index";
import { getOwnedMaterial, publicMaterial } from "../_shared";

/** Un material con sus fragmentos por página: lo que lo hace "consultable". */
export const GET = withRoute(
  async (request: NextRequest, { params }: { params: Promise<{ subjectId: string; materialId: string }> }) => {
    const userId = requireAuth(request);
    const { subjectId, materialId } = await params;
    const material = await getOwnedMaterial(subjectId, materialId, userId);
    if (!material) {
      return NextResponse.json({ error: "Material no encontrado" }, { status: 404 });
    }
    const chunks = await db.query.materialChunks.findMany({
      where: eq(materialChunks.materialId, material.id),
      orderBy: (c, { asc }) => [asc(c.page)],
      columns: { id: true, page: true, text: true },
    });
    return NextResponse.json({ material: publicMaterial(material), chunks });
  },
);

/**
 * Borra el material, su archivo y sus fragmentos. Las preguntas generadas a partir de
 * esos fragmentos también se borran: sin su fuente ya no hay de dónde citarlas.
 * Borrar libera espacio del plan, pero no devuelve las cuotas diarias ya gastadas.
 */
export const DELETE = withRoute(
  async (request: NextRequest, { params }: { params: Promise<{ subjectId: string; materialId: string }> }) => {
    const userId = requireAuth(request);
    const { subjectId, materialId } = await params;
    const material = await getOwnedMaterial(subjectId, materialId, userId);
    if (!material) {
      return NextResponse.json({ error: "Material no encontrado" }, { status: 404 });
    }
    if (material.status === "procesando") {
      return NextResponse.json({ error: "El material se está procesando; espera a que termine" }, { status: 409 });
    }
    const generating = await db.query.generationJobs.findFirst({
      where: and(eq(generationJobs.materialId, material.id), inArray(generationJobs.status, ["pendiente", "procesando"])),
    });
    if (generating) {
      return NextResponse.json(
        { error: "Se están generando preguntas de este material; espera a que termine" },
        { status: 409 },
      );
    }

    const { questionsDeleted, flashcardsDeleted } = await db.transaction(async (tx) => {
      const chunkIds = tx
        .select({ id: materialChunks.id })
        .from(materialChunks)
        .where(eq(materialChunks.materialId, material.id));
      // Las tarjetas se borran solas con el material (cascade), pero se cuentan para avisar al cliente.
      const cards = await tx.select({ id: flashcards.id }).from(flashcards).where(inArray(flashcards.chunkId, chunkIds));
      const removed = await tx
        .delete(questions)
        .where(
          inArray(
            questions.chunkId,
            tx.select({ id: materialChunks.id }).from(materialChunks).where(eq(materialChunks.materialId, material.id)),
          ),
        )
        .returning({ id: questions.id });
      await tx.delete(materials).where(eq(materials.id, material.id));
      return { questionsDeleted: removed.length, flashcardsDeleted: cards.length };
    });

    // Después de la base de datos: si esto falla queda un archivo huérfano, no un material roto.
    if (material.storagePath) {
      await storage.remove(material.storagePath).catch((err) => {
        console.error(`No se pudo borrar el archivo ${material.storagePath}:`, err);
      });
    }

    return NextResponse.json({ deleted: true, questionsDeleted, flashcardsDeleted });
  },
);
