import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { materials, users } from "@/server/db/schema";
import { detectFileType } from "@/server/files/detectType";
import { getOwnedSubject } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";
import { getLimits, limitReachedBody } from "@/server/limits";
import { processMaterial } from "@/server/materials/process";
import { storage } from "@/server/storage/index";
import { countUsageLastDay, getStorageUsedBytes, recordUsage } from "@/server/usage";

type Material = typeof materials.$inferSelect;

/** La ruta interna del archivo en el almacenamiento no se expone al cliente. */
function publicMaterial(material: Material) {
  const { storagePath: _storagePath, ...rest } = material;
  return rest;
}

const finalizeSchema = z.object({
  pathname: z.string().min(1),
  name: z.string().optional(),
});

/**
 * Segundo paso de la subida: el navegador ya dejó el archivo en Blob (ver `materials/upload`,
 * que solo emitió el token); acá se valida de verdad — tipo real por bytes (nunca el que declaró
 * el cliente), cuota de almacenamiento, cuota de OCR — y si algo no pasa, se borra el blob para
 * no dejar basura. Si todo bien, crea el material "pendiente" y dispara la extracción en segundo
 * plano con `waitUntil`, sin bloquear la respuesta.
 *
 * El `pathname` no se valida contra el usuario: solo se llega hasta acá con un token que
 * `materials/upload` ya emitió tras comprobar auth + dueño de la materia, y Blob le pone un
 * sufijo aleatorio (no es adivinable ni enumerable), así que no hace falta otra comprobación.
 */
export const POST = withRoute(async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
  const userId = requireAuth(request);
  const { subjectId } = await params;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) {
    return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  }
  const parsed = finalizeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { pathname } = parsed.data;

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const limits = getLimits(user.plan);

  const buffer = await storage.read(pathname).catch(() => null);
  if (!buffer) {
    return NextResponse.json({ error: "No se encontró el archivo subido" }, { status: 404 });
  }

  const detected = detectFileType(buffer);
  if (!detected) {
    await storage.remove(pathname).catch(() => {});
    return NextResponse.json({ error: "Formato no soportado. Sube un PDF, PNG, JPG o WebP" }, { status: 415 });
  }

  const storageUsed = await getStorageUsedBytes(userId);
  if (storageUsed + buffer.length > limits.maxStorageBytes) {
    await storage.remove(pathname).catch(() => {});
    const { status, body } = limitReachedBody(
      "maxStorageBytes",
      "No queda espacio suficiente en tu plan para este archivo",
      limits.maxStorageBytes,
    );
    return NextResponse.json(body, { status });
  }

  // Las imágenes gastan OCR con IA: se reserva la cuota acá, antes de encolar el procesamiento.
  if (detected.type === "image") {
    const ocrToday = await countUsageLastDay(userId, "ai_ocr");
    if (ocrToday >= limits.ocrImagesPerDay) {
      await storage.remove(pathname).catch(() => {});
      const { status, body } = limitReachedBody(
        "ocrImagesPerDay",
        `Ya usaste tus ${limits.ocrImagesPerDay} imágenes con OCR de hoy`,
        limits.ocrImagesPerDay,
      );
      return NextResponse.json(body, { status });
    }
  }

  const fallbackName = parsed.data.name?.trim().replace(/\.[^.]+$/, "") ?? "";
  const name = (fallbackName || "Material sin nombre").slice(0, 200);

  const [material] = await db
    .insert(materials)
    .values({
      subjectId: subject.id,
      type: detected.type,
      name,
      status: "pendiente",
      storagePath: pathname,
      mimeType: detected.mime,
      sizeBytes: buffer.length,
    })
    .returning();

  await recordUsage(userId, "upload");
  if (detected.type === "image") await recordUsage(userId, "ai_ocr");

  waitUntil(processMaterial(material));

  return NextResponse.json({ material: publicMaterial(material) }, { status: 202 });
});
