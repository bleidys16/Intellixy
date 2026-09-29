import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth/middleware";
import { enqueueGeneration } from "@/server/generation/enqueue";
import { getOwnedSubject } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";

const generateSchema = z.object({
  materialId: z.string().uuid(),
  count: z.number().int().min(1).optional(),
});

/**
 * Encola la generación de tarjetas de un material "listo" (202 con el trabajo). Comparte cuota con las preguntas.
 * TODO (fase 6 del plan de migración): disparar el procesamiento real.
 */
export const POST = withRoute(async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
  const userId = requireAuth(request);
  const { subjectId } = await params;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) {
    return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  }
  const parsed = generateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await enqueueGeneration({
    userId,
    subjectId: subject.id,
    materialId: parsed.data.materialId,
    kind: "tarjetas",
    count: parsed.data.count,
  });
  return NextResponse.json(result.body, { status: result.status });
});
