import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { attemptAnswers, materialChunks, questions, quizAttempts } from "@/server/db/schema";
import { getOwnedSubject } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";
import { loadItems, publicAttempt, toItem } from "./_shared";

const DEFAULT_QUIZ_SIZE = 10;
const MAX_QUIZ_SIZE = 30;

const createSchema = z.object({
  count: z.number().int().min(1).max(MAX_QUIZ_SIZE).optional(),
  /** Alcance: un material o un tema. Sin ninguno, toda la materia. */
  materialId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
});

/** Crea un intento con preguntas al azar del alcance elegido. */
export const POST = withRoute(async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
  const userId = requireAuth(request);
  const { subjectId } = await params;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) {
    return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { materialId, topicId } = parsed.data;
  const wanted = parsed.data.count ?? DEFAULT_QUIZ_SIZE;

  const picked = await db
    .select({ id: questions.id })
    .from(questions)
    .innerJoin(materialChunks, eq(questions.chunkId, materialChunks.id))
    .where(
      and(
        eq(questions.subjectId, subject.id),
        materialId ? eq(materialChunks.materialId, materialId) : undefined,
        topicId ? eq(questions.topicId, topicId) : undefined,
      ),
    )
    .orderBy(sql`random()`)
    .limit(wanted);

  if (picked.length === 0) {
    return NextResponse.json(
      { error: "No hay preguntas para ese alcance. Genera preguntas de un material primero" },
      { status: 422 },
    );
  }

  const attempt = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(quizAttempts)
      .values({ userId, subjectId: subject.id, total: picked.length })
      .returning();
    await tx
      .insert(attemptAnswers)
      .values(picked.map((p, i) => ({ attemptId: created.id, questionId: p.id, position: i + 1 })));
    return created;
  });

  const items = (await loadItems(attempt.id)).map(toItem);
  return NextResponse.json({ attempt: publicAttempt(attempt), items }, { status: 201 });
});

/** Historial de intentos de la materia, del más reciente al más antiguo. */
export const GET = withRoute(async (request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) => {
  const userId = requireAuth(request);
  const { subjectId } = await params;
  const subject = await getOwnedSubject(subjectId, userId);
  if (!subject) {
    return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  }
  const rows = await db
    .select({
      attempt: quizAttempts,
      // "quiz_attempts"."id" va calificado a mano: con una sola tabla Drizzle omite el prefijo y `id`
      // se resolvería contra attempt_answers dentro de la subconsulta.
      answered: sql<number>`(
        select count(*)::int from ${attemptAnswers}
        where ${attemptAnswers.attemptId} = "quiz_attempts"."id" and ${attemptAnswers.givenAnswer} is not null
      )`,
    })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.subjectId, subject.id), eq(quizAttempts.userId, userId)))
    .orderBy(sql`${quizAttempts.createdAt} desc`)
    .limit(50);
  return NextResponse.json({ attempts: rows.map((r) => ({ ...publicAttempt(r.attempt), answered: r.answered })) });
});
