import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { withRoute } from "@/server/http/safe";
import { getOwnedAttempt, loadItems, publicAttempt, toItem } from "../_shared";

/** Un intento con sus preguntas; permite retomarlo tras recargar o reabrir la app. */
export const GET = withRoute(
  async (request: NextRequest, { params }: { params: Promise<{ subjectId: string; attemptId: string }> }) => {
    const userId = requireAuth(request);
    const { subjectId, attemptId } = await params;
    const attempt = await getOwnedAttempt(subjectId, attemptId, userId);
    if (!attempt) {
      return NextResponse.json({ error: "Intento no encontrado" }, { status: 404 });
    }
    const items = (await loadItems(attempt.id)).map(toItem);
    return NextResponse.json({ attempt: publicAttempt(attempt), items });
  },
);
