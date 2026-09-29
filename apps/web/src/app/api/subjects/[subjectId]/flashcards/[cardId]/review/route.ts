import { and, eq, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { flashcardReviews, flashcards } from "@/server/db/schema";
import { nextState, REVIEW_RESULTS } from "@/server/flashcards/leitner";
import { getOwnedSubject, isUuid } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";
import { getStats, loadCards, toCard } from "../../_shared";

const reviewSchema = z.object({ result: z.enum(REVIEW_RESULTS) });

/** Registra un repaso y mueve la tarjeta de caja según Leitner. Solo se puede repasar una tarjeta vencida. */
export const POST = withRoute(
  async (request: NextRequest, { params }: { params: Promise<{ subjectId: string; cardId: string }> }) => {
    const userId = requireAuth(request);
    const { subjectId, cardId } = await params;
    const subject = await getOwnedSubject(subjectId, userId);
    if (!subject || !isUuid(cardId)) {
      return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
    }
    const parsed = reviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const [card] = await loadCards({ where: and(eq(flashcards.id, cardId), eq(flashcards.subjectId, subject.id)) });
    if (!card) {
      return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
    }

    const now = new Date();
    if (card.dueAt.getTime() > now.getTime()) {
      return NextResponse.json({ error: "Esta tarjeta todavía no toca repasarla", dueAt: card.dueAt }, { status: 409 });
    }

    const next = nextState(card.box, parsed.data.result, now);
    const saved = await db.transaction(async (tx) => {
      // Filtrar por "sigue vencida" evita contar dos veces un doble clic: la primera petición
      // adelanta `dueAt` y la segunda ya no encuentra la fila.
      const updated = await tx
        .update(flashcards)
        .set({ box: next.box, dueAt: next.dueAt })
        .where(and(eq(flashcards.id, card.id), lte(flashcards.dueAt, now)))
        .returning({ id: flashcards.id });
      if (updated.length === 0) return false;
      await tx.insert(flashcardReviews).values({
        flashcardId: card.id,
        result: parsed.data.result,
        boxAfter: next.box,
        reviewedAt: now,
        nextDueAt: next.dueAt,
      });
      return true;
    });
    if (!saved) {
      return NextResponse.json({ error: "Esta tarjeta ya se repasó" }, { status: 409 });
    }

    return NextResponse.json({
      card: toCard({ ...card, box: next.box, dueAt: next.dueAt }),
      stats: await getStats(subject.id),
    });
  },
);
