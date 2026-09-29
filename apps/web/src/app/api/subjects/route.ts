import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { subjects } from "@/server/db/schema";
import { withRoute } from "@/server/http/safe";
import { summarizeSubjects } from "@/server/progress/summary";

const createSubjectSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

export const POST = withRoute(async (request: NextRequest) => {
  const userId = requireAuth(request);
  const parsed = createSubjectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [subject] = await db
    .insert(subjects)
    .values({ userId, name: parsed.data.name, color: parsed.data.color })
    .returning();

  return NextResponse.json({ subject }, { status: 201 });
});

/** Cada materia lleva su resumen (materiales, dominio, tarjetas pendientes, último estudio) para las tarjetas del inicio. */
export const GET = withRoute(async (request: NextRequest) => {
  const userId = requireAuth(request);
  const rows = await db.query.subjects.findMany({
    where: eq(subjects.userId, userId),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
  const summaries = await summarizeSubjects(
    userId,
    rows.map((s) => s.id),
  );
  return NextResponse.json({ subjects: rows.map((s) => ({ ...s, summary: summaries.get(s.id) })) });
});
