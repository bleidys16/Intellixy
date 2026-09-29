import { and, eq, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { attemptAnswers, quizAttempts } from "@/server/db/schema";
import { withRoute } from "@/server/http/safe";
import { feedback, getOwnedAttempt, loadItems, publicAttempt } from "../../_shared";

const answerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.enum(["a", "b", "c", "d"]),
  seconds: z.number().int().min(0).max(3600).optional(),
});

/** Responde una pregunta del intento. Al contestar la última, el intento termina y se calcula la nota. */
export const POST = withRoute(
  async (request: NextRequest, { params }: { params: Promise<{ subjectId: string; attemptId: string }> }) => {
    const userId = requireAuth(request);
    const { subjectId, attemptId } = await params;
    const attempt = await getOwnedAttempt(subjectId, attemptId, userId);
    if (!attempt) {
      return NextResponse.json({ error: "Intento no encontrado" }, { status: 404 });
    }
    const parsed = answerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    if (attempt.status !== "en_curso") {
      return NextResponse.json({ error: "Este intento ya terminó" }, { status: 409 });
    }

    const row = (await loadItems(attempt.id)).find((r) => r.questionId === parsed.data.questionId);
    if (!row) {
      return NextResponse.json({ error: "Esa pregunta no es parte de este intento" }, { status: 404 });
    }
    const isCorrect = parsed.data.answer === row.question.correctOption;

    // El filtro por "sin responder" evita que dos peticiones simultáneas contesten dos veces.
    const [updated] = await db
      .update(attemptAnswers)
      .set({
        givenAnswer: parsed.data.answer,
        isCorrect,
        seconds: parsed.data.seconds ?? null,
        answeredAt: new Date(),
      })
      .where(and(eq(attemptAnswers.id, row.id), isNull(attemptAnswers.givenAnswer)))
      .returning({ id: attemptAnswers.id });
    if (!updated) {
      return NextResponse.json({ error: "Ya respondiste esta pregunta" }, { status: 409 });
    }

    const [counts] = await db
      .select({
        remaining: sql<number>`count(*) filter (where ${attemptAnswers.givenAnswer} is null)::int`,
        correct: sql<number>`count(*) filter (where ${attemptAnswers.isCorrect})::int`,
      })
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptId, attempt.id));

    let current = attempt;
    if (counts.remaining === 0) {
      const [finished] = await db
        .update(quizAttempts)
        .set({ status: "terminado", score: counts.correct, finishedAt: new Date() })
        .where(and(eq(quizAttempts.id, attempt.id), eq(quizAttempts.status, "en_curso")))
        .returning();
      // Si otra petición ya lo cerró, se lee su estado final.
      current = finished ?? (await getOwnedAttempt(attempt.subjectId, attempt.id, userId)) ?? attempt;
    }

    return NextResponse.json({
      result: feedback({ ...row, givenAnswer: parsed.data.answer, isCorrect }),
      attempt: publicAttempt(current),
      remaining: counts.remaining,
    });
  },
);
