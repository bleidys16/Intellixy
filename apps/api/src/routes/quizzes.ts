import { and, eq, isNull, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { attemptAnswers, materialChunks, questions, quizAttempts } from "../db/schema.js";
import { getOwnedSubject, isUuid } from "./access.js";
import { safe } from "./safe.js";

/**
 * Quiz sobre las preguntas ya generadas de una materia (no gasta IA, por eso no tiene cuota).
 * Al crear el intento se fijan sus preguntas; la respuesta correcta, la explicación y la fuente
 * solo se envían DESPUÉS de responder cada una, para que ningún cliente pueda hacer trampa.
 */
export const quizzesRouter = Router({ mergeParams: true });
quizzesRouter.use(requireAuth);

const DEFAULT_QUIZ_SIZE = 10;
const MAX_QUIZ_SIZE = 30;

const createSchema = z.object({
  count: z.number().int().min(1).max(MAX_QUIZ_SIZE).optional(),
  /** Alcance: un material o un tema. Sin ninguno, toda la materia. */
  materialId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
});

const answerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.enum(["a", "b", "c", "d"]),
  seconds: z.number().int().min(0).max(3600).optional(),
});

type AttemptRow = typeof quizAttempts.$inferSelect;

function publicAttempt(a: AttemptRow) {
  return {
    id: a.id,
    subjectId: a.subjectId,
    status: a.status,
    total: a.total,
    score: a.score,
    createdAt: a.createdAt,
    finishedAt: a.finishedAt,
  };
}

async function loadItems(attemptId: string) {
  return db.query.attemptAnswers.findMany({
    where: eq(attemptAnswers.attemptId, attemptId),
    orderBy: (a, { asc }) => [asc(a.position)],
    with: { question: { with: { topic: true, chunk: { with: { material: true } } } } },
  });
}

type ItemRow = Awaited<ReturnType<typeof loadItems>>[number];

/** Lo que se revela al responder: acierto, respuesta correcta, explicación y la fuente exacta. */
function feedback(row: ItemRow) {
  const q = row.question;
  return {
    givenAnswer: row.givenAnswer,
    isCorrect: row.isCorrect,
    correctOption: q.correctOption,
    explanation: q.explanation,
    source: {
      quote: q.sourceQuote,
      page: q.chunk.page,
      materialId: q.chunk.material.id,
      materialName: q.chunk.material.name,
    },
  };
}

function toItem(row: ItemRow) {
  const q = row.question;
  const answered = row.givenAnswer !== null;
  return {
    position: row.position,
    question: {
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      topic: { id: q.topic.id, name: q.topic.name },
      material: { id: q.chunk.material.id, name: q.chunk.material.name, type: q.chunk.material.type },
    },
    answered,
    // Sin respuesta no se manda nada que delate la correcta.
    result: answered ? feedback(row) : null,
  };
}

async function getOwnedAttempt(subjectId: string, attemptId: string, userId: string) {
  if (!isUuid(attemptId)) return undefined;
  return db.query.quizAttempts.findFirst({
    where: and(
      eq(quizAttempts.id, attemptId),
      eq(quizAttempts.subjectId, subjectId),
      eq(quizAttempts.userId, userId),
    ),
  });
}

type SubjectParams = { subjectId: string };
type AttemptParams = SubjectParams & { attemptId: string };

/** Crea un intento con preguntas al azar del alcance elegido. */
quizzesRouter.post<SubjectParams>(
  "/",
  safe(async (req, res) => {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
    }
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
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
      res.status(422).json({
        error: "No hay preguntas para ese alcance. Genera preguntas de un material primero",
      });
      return;
    }

    const attempt = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(quizAttempts)
        .values({ userId: req.userId!, subjectId: subject.id, total: picked.length })
        .returning();
      await tx
        .insert(attemptAnswers)
        .values(picked.map((p, i) => ({ attemptId: created.id, questionId: p.id, position: i + 1 })));
      return created;
    });

    const items = (await loadItems(attempt.id)).map(toItem);
    res.status(201).json({ attempt: publicAttempt(attempt), items });
  }),
);

/** Historial de intentos de la materia, del más reciente al más antiguo. */
quizzesRouter.get<SubjectParams>(
  "/",
  safe(async (req, res) => {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
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
      .where(and(eq(quizAttempts.subjectId, subject.id), eq(quizAttempts.userId, req.userId!)))
      .orderBy(sql`${quizAttempts.createdAt} desc`)
      .limit(50);
    res.json({ attempts: rows.map((r) => ({ ...publicAttempt(r.attempt), answered: r.answered })) });
  }),
);

/** Un intento con sus preguntas; permite retomarlo tras recargar o reabrir la app. */
quizzesRouter.get<AttemptParams>(
  "/:attemptId",
  safe(async (req, res) => {
    const attempt = await getOwnedAttempt(req.params.subjectId, req.params.attemptId, req.userId!);
    if (!attempt) {
      res.status(404).json({ error: "Intento no encontrado" });
      return;
    }
    const items = (await loadItems(attempt.id)).map(toItem);
    res.json({ attempt: publicAttempt(attempt), items });
  }),
);

/** Responde una pregunta del intento. Al contestar la última, el intento termina y se calcula la nota. */
quizzesRouter.post<AttemptParams>(
  "/:attemptId/answers",
  safe(async (req, res) => {
    const attempt = await getOwnedAttempt(req.params.subjectId, req.params.attemptId, req.userId!);
    if (!attempt) {
      res.status(404).json({ error: "Intento no encontrado" });
      return;
    }
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (attempt.status !== "en_curso") {
      res.status(409).json({ error: "Este intento ya terminó" });
      return;
    }

    const row = (await loadItems(attempt.id)).find((r) => r.questionId === parsed.data.questionId);
    if (!row) {
      res.status(404).json({ error: "Esa pregunta no es parte de este intento" });
      return;
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
      res.status(409).json({ error: "Ya respondiste esta pregunta" });
      return;
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
      current = finished ?? (await getOwnedAttempt(attempt.subjectId, attempt.id, req.userId!)) ?? attempt;
    }

    res.json({
      result: feedback({ ...row, givenAnswer: parsed.data.answer, isCorrect }),
      attempt: publicAttempt(current),
      remaining: counts.remaining,
    });
  }),
);
