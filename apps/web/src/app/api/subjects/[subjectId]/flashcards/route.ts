import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { flashcards } from "@/server/db/schema";
import { getOwnedSubject } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";
import { getStats, loadCards, toCard } from "./_shared";

/** Todas las tarjetas de la materia, con los totales por caja. */
export const GET = withRoute(async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
  const userId = requireAuth(request);
  const { subjectId } = await params;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) {
    return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  }
  const [cards, stats] = await Promise.all([
    loadCards({ where: eq(flashcards.subjectId, subject.id) }),
    getStats(subject.id),
  ]);
  return NextResponse.json({ flashcards: cards.map(toCard), stats });
});
