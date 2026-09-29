import { and, eq, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { flashcards } from "@/server/db/schema";
import { getOwnedSubject } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";
import { getStats, loadCards, toCard } from "../_shared";

const DEFAULT_DUE_LIMIT = 20;
const MAX_DUE_LIMIT = 50;

/** La cola de hoy: tarjetas vencidas, las más atrasadas primero. */
export const GET = withRoute(async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
  const userId = requireAuth(request);
  const { subjectId } = await params;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) {
    return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  }
  const requested = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_DUE_LIMIT) : DEFAULT_DUE_LIMIT;
  const [cards, stats] = await Promise.all([
    loadCards({
      where: and(eq(flashcards.subjectId, subject.id), lte(flashcards.dueAt, new Date())),
      limit,
      oldestDueFirst: true,
    }),
    getStats(subject.id),
  ]);
  return NextResponse.json({ cards: cards.map(toCard), stats });
});
