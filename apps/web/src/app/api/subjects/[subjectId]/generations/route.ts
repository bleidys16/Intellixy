import { and, eq, gte, inArray, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { generationJobs } from "@/server/db/schema";
import { ACTIVE_STATUSES } from "@/server/generation/enqueue";
import { getOwnedSubject } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";

/** Cuánto tiempo sigue apareciendo un trabajo terminado, para que un cliente lento aún vea el resultado. */
const RECENT_JOB_WINDOW_MS = 10 * 60 * 1000;

/**
 * Trabajos de generación de la materia: los activos y los terminados hace poco. Con esto el
 * cliente recupera el estado al recargar la página o reabrir la app mientras se genera.
 */
export const GET = withRoute(async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
  const userId = requireAuth(request);
  const { subjectId } = await params;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) {
    return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  }
  const recentSince = new Date(Date.now() - RECENT_JOB_WINDOW_MS);
  const jobs = await db.query.generationJobs.findMany({
    where: and(
      eq(generationJobs.subjectId, subject.id),
      or(inArray(generationJobs.status, ACTIVE_STATUSES), gte(generationJobs.updatedAt, recentSince)),
    ),
    orderBy: (j, { desc }) => [desc(j.createdAt)],
  });
  return NextResponse.json({ jobs });
});
