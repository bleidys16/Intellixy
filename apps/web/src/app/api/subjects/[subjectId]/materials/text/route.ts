import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { materialChunks, materials } from "@/server/db/schema";
import { getOwnedSubject } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";
import { publicMaterial } from "../_shared";

const pasteTextSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(50, "El texto es muy corto para generar preguntas útiles"),
});

/** Pega texto como material. Ya no genera preguntas: eso se pide aparte, por material. */
export const POST = withRoute(async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
  const userId = requireAuth(request);
  const { subjectId } = await params;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) {
    return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  }

  const parsed = pasteTextSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, text } = parsed.data;

  const material = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(materials)
      .values({ subjectId: subject.id, type: "text", name, status: "listo", pageCount: 1 })
      .returning();
    await tx.insert(materialChunks).values({ materialId: created.id, page: 1, text });
    return created;
  });

  return NextResponse.json({ material: publicMaterial(material) }, { status: 201 });
});
