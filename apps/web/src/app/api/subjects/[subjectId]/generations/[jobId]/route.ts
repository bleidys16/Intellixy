import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { generationJobs } from "@/server/db/schema";
import { isUuid } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";

export const GET = withRoute(
  async (request: NextRequest, { params }: { params: Promise<{ subjectId: string; jobId: string }> }) => {
    const userId = requireAuth(request);
    const { subjectId, jobId } = await params;
    if (!isUuid(jobId)) {
      return NextResponse.json({ error: "Trabajo no encontrado" }, { status: 404 });
    }
    const job = await db.query.generationJobs.findFirst({
      where: and(eq(generationJobs.id, jobId), eq(generationJobs.subjectId, subjectId), eq(generationJobs.userId, userId)),
    });
    if (!job) {
      return NextResponse.json({ error: "Trabajo no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ job });
  },
);
