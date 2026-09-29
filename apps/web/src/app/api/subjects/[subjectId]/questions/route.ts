import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { questions } from "@/server/db/schema";
import { getOwnedSubject } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";

export const GET = withRoute(async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
  const userId = requireAuth(request);
  const { subjectId } = await params;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) {
    return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  }

  const rows = await db.query.questions.findMany({
    where: eq(questions.subjectId, subject.id),
    orderBy: (q, { desc }) => [desc(q.createdAt)],
    with: { topic: true, chunk: { with: { material: true } } },
  });
  // Se aplana el material de origen y se quita el fragmento completo del payload.
  return NextResponse.json({
    questions: rows.map(({ chunk, ...q }) => ({
      ...q,
      material: { id: chunk.material.id, name: chunk.material.name, type: chunk.material.type },
    })),
  });
});
