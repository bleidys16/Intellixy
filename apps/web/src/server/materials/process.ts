import { eq } from "drizzle-orm";
import type { MaterialBlock } from "@/server/ai/types";
import { db } from "@/server/db/client";
import { materialChunks, materials, subjects, users } from "@/server/db/schema";
import { ExtractionError } from "@/server/extraction/errors";
import { extractImage } from "@/server/extraction/extractImage";
import { extractPdf } from "@/server/extraction/extractPdf";
import { getLimits } from "@/server/limits";
import { storage } from "@/server/storage/index";

type Material = typeof materials.$inferSelect;

async function getOwnerPlan(subjectId: string): Promise<string> {
  const [row] = await db
    .select({ plan: users.plan })
    .from(subjects)
    .innerJoin(users, eq(subjects.userId, users.id))
    .where(eq(subjects.id, subjectId));
  return row?.plan ?? "free";
}

/**
 * Extrae el texto de un material (PDF o imagen) y lo deja "listo" con sus fragmentos, o
 * "error" con un mensaje. Antes corría en un worker en background con polling (`setInterval`);
 * ahora se llama directo desde la ruta que sube/reintenta el material, envuelta en `waitUntil()`
 * para que siga corriendo después de que la respuesta 202 ya se envió al cliente.
 */
export async function processMaterial(material: Material): Promise<void> {
  try {
    if (!material.storagePath) {
      throw new ExtractionError("El material no tiene un archivo asociado");
    }
    const data = await storage.read(material.storagePath);

    let pageCount: number;
    let pages: MaterialBlock[];
    if (material.type === "pdf") {
      const owner = await getOwnerPlan(material.subjectId);
      ({ pageCount, pages } = await extractPdf(data, getLimits(owner).maxPdfPages));
    } else if (material.type === "image") {
      pages = await extractImage(data);
      pageCount = 1;
    } else {
      throw new ExtractionError(`Tipo de material no soportado: ${material.type}`);
    }

    // Chunks y estado en una sola transacción: nunca queda "listo" sin sus fragmentos.
    await db.transaction(async (tx) => {
      await tx.delete(materialChunks).where(eq(materialChunks.materialId, material.id));
      await tx
        .insert(materialChunks)
        .values(pages.map((p) => ({ materialId: material.id, page: p.page, text: p.text })));
      await tx
        .update(materials)
        .set({ status: "listo", pageCount, errorMessage: null, updatedAt: new Date() })
        .where(eq(materials.id, material.id));
    });
  } catch (err) {
    const message =
      err instanceof ExtractionError ? err.message : "No se pudo procesar el archivo. Inténtalo de nuevo más tarde";
    if (!(err instanceof ExtractionError)) {
      console.error(`[materials] falló el material ${material.id}:`, err);
    }
    await db
      .update(materials)
      .set({ status: "error", errorMessage: message, updatedAt: new Date() })
      .where(eq(materials.id, material.id));
  }
}
