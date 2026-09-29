import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { getOwnedSubject } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";
import { getLimits, limitReachedBody } from "@/server/limits";
import { countMaterialsInSubject } from "@/server/usage";

/**
 * Emite el token con el que el navegador sube el archivo directo a Vercel Blob, sin pasar por
 * esta función: las funciones de Vercel cortan el cuerpo de la petición en 4.5MB, muy poco para
 * un PDF o una foto de apuntes. La validación real del archivo (tipo por bytes, cuota de
 * almacenamiento, cuota de OCR) pasa después, en `materials/finalize`, cuando el archivo ya
 * está subido y se puede leer.
 */
export const POST = withRoute(async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
  const userId = requireAuth(request);
  const { subjectId } = await params;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) {
    return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const limits = getLimits(user.plan);

  const materialCount = await countMaterialsInSubject(subject.id);
  if (materialCount >= limits.maxMaterialsPerSubject) {
    const { status, body } = limitReachedBody(
      "maxMaterialsPerSubject",
      `Esta materia ya tiene ${limits.maxMaterialsPerSubject} materiales, que es el máximo de tu plan`,
      limits.maxMaterialsPerSubject,
    );
    return NextResponse.json(body, { status });
  }

  const body = (await request.json()) as HandleUploadBody;
  const result = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async () => ({
      addRandomSuffix: true,
      maximumSizeInBytes: limits.maxFileBytes,
      allowedContentTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
    }),
  });
  return NextResponse.json(result);
});
