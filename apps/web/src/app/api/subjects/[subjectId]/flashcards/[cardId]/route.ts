import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { flashcards } from "@/server/db/schema";
import { getOwnedSubject, isUuid } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";

export const DELETE = withRoute(
  async (request: NextRequest, { params }: { params: Promise<{ subjectId: string; cardId: string }> }) => {
    const userId = requireAuth(request);
    const { subjectId, cardId } = await params;
    const subject = await getOwnedSubject(subjectId, userId);
    if (!subject || !isUuid(cardId)) {
      return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
    }
    const removed = await db
      .delete(flashcards)
      .where(and(eq(flashcards.id, cardId), eq(flashcards.subjectId, subject.id)))
      .returning({ id: flashcards.id });
    if (removed.length === 0) {
      return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  },
);
