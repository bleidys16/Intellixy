import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { materials, users } from "@/server/db/schema";
import { withRoute } from "@/server/http/safe";
import { getLimits, limitReachedBody } from "@/server/limits";
import { processMaterial } from "@/server/materials/process";
import { countUsageLastDay, recordUsage } from "@/server/usage";
import { getOwnedMaterial, publicMaterial } from "../../_shared";

/**
 * Devuelve a la cola un material que falló. Una imagen vuelve a gastar OCR con IA,
 * así que cuenta contra la cuota diaria igual que al subirla; un PDF no cuesta nada.
 */
export const POST = withRoute(
  async (request: NextRequest, { params }: { params: Promise<{ subjectId: string; materialId: string }> }) => {
    const userId = requireAuth(request);
    const { subjectId, materialId } = await params;
    const material = await getOwnedMaterial(subjectId, materialId, userId);
    if (!material) {
      return NextResponse.json({ error: "Material no encontrado" }, { status: 404 });
    }
    if (material.status !== "error" || !material.storagePath) {
      return NextResponse.json({ error: "Solo se pueden reintentar los materiales que fallaron" }, { status: 409 });
    }

    if (material.type === "image") {
      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      const limits = getLimits(user?.plan ?? "free");
      const ocrToday = await countUsageLastDay(userId, "ai_ocr");
      if (ocrToday >= limits.ocrImagesPerDay) {
        const { status, body } = limitReachedBody(
          "ocrImagesPerDay",
          `Ya usaste tus ${limits.ocrImagesPerDay} imágenes con OCR de hoy`,
          limits.ocrImagesPerDay,
        );
        return NextResponse.json(body, { status });
      }
      await recordUsage(userId, "ai_ocr");
    }

    const [updated] = await db
      .update(materials)
      .set({ status: "pendiente", errorMessage: null, updatedAt: new Date() })
      .where(eq(materials.id, material.id))
      .returning();

    waitUntil(processMaterial(updated));

    return NextResponse.json({ material: publicMaterial(updated) }, { status: 202 });
  },
);
