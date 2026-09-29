import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { attemptAnswers, quizAttempts } from "@/server/db/schema";
import { isUuid } from "@/server/http/access";

type AttemptRow = typeof quizAttempts.$inferSelect;

export async function getOwnedAttempt(subjectId: string, attemptId: string, userId: string) {
  if (!isUuid(attemptId)) return undefined;
  return db.query.quizAttempts.findFirst({
    where: and(eq(quizAttempts.id, attemptId), eq(quizAttempts.subjectId, subjectId), eq(quizAttempts.userId, userId)),
  });
}

export function publicAttempt(a: AttemptRow) {
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

export async function loadItems(attemptId: string) {
  return db.query.attemptAnswers.findMany({
    where: eq(attemptAnswers.attemptId, attemptId),
    orderBy: (a, { asc }) => [asc(a.position)],
    with: { question: { with: { topic: true, chunk: { with: { material: true } } } } },
  });
}

type ItemRow = Awaited<ReturnType<typeof loadItems>>[number];

/** Lo que se revela al responder: acierto, respuesta correcta, explicación y la fuente exacta. */
export function feedback(row: ItemRow) {
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

export function toItem(row: ItemRow) {
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
