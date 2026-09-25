import { and, count, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { attemptAnswers, flashcardReviews, flashcards, materials, quizAttempts, questions } from "../db/schema.js";
import { type Evidence, masteryOf, MIN_EVIDENCE, reviewScore, statusOf, type TopicStatus } from "./mastery.js";

export interface SubjectSummary {
  materialCount: number;
  /** Dominio general de 0 a 1; null mientras haya menos de MIN_EVIDENCE evidencias. */
  mastery: number | null;
  /** "dominado", "en_progreso", "debil" o "sin_datos" según el dominio general. */
  status: TopicStatus;
  /** Tarjetas que ya toca repasar. */
  dueCards: number;
  /** Última vez que respondió una pregunta o repasó una tarjeta; null si nunca. */
  lastStudiedAt: Date | null;
}

/**
 * Resumen de varias materias de un usuario para la pantalla de inicio: una consulta por tipo de dato
 * (no una por materia), y el dominio con la misma fórmula que el panel de progreso.
 */
export async function summarizeSubjects(userId: string, subjectIds: string[], now = new Date()) {
  const result = new Map<string, SubjectSummary>();
  if (subjectIds.length === 0) return result;
  for (const id of subjectIds) result.set(id, { materialCount: 0, mastery: null, status: "sin_datos", dueCards: 0, lastStudiedAt: null });

  const [materialRows, answerRows, reviewRows, dueRows] = await Promise.all([
    db
      .select({ subjectId: materials.subjectId, n: count() })
      .from(materials)
      .where(inArray(materials.subjectId, subjectIds))
      .groupBy(materials.subjectId),
    db
      .select({ subjectId: quizAttempts.subjectId, isCorrect: attemptAnswers.isCorrect, at: attemptAnswers.answeredAt })
      .from(attemptAnswers)
      .innerJoin(quizAttempts, eq(attemptAnswers.attemptId, quizAttempts.id))
      .innerJoin(questions, eq(attemptAnswers.questionId, questions.id))
      .where(
        and(
          inArray(quizAttempts.subjectId, subjectIds),
          eq(quizAttempts.userId, userId),
          isNotNull(attemptAnswers.answeredAt),
        ),
      ),
    db
      .select({ subjectId: flashcards.subjectId, result: flashcardReviews.result, at: flashcardReviews.reviewedAt })
      .from(flashcardReviews)
      .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
      .where(inArray(flashcards.subjectId, subjectIds)),
    db
      .select({ subjectId: flashcards.subjectId, n: count() })
      .from(flashcards)
      .where(and(inArray(flashcards.subjectId, subjectIds), lte(flashcards.dueAt, now)))
      .groupBy(flashcards.subjectId),
  ]);

  const evidence = new Map<string, Evidence[]>();
  const push = (subjectId: string, e: Evidence) => {
    const list = evidence.get(subjectId);
    if (list) list.push(e);
    else evidence.set(subjectId, [e]);
  };
  for (const a of answerRows) push(a.subjectId, { score: a.isCorrect ? 1 : 0, at: a.at! });
  for (const r of reviewRows) push(r.subjectId, { score: reviewScore(r.result), at: r.at });

  for (const m of materialRows) result.get(m.subjectId)!.materialCount = m.n;
  for (const d of dueRows) result.get(d.subjectId)!.dueCards = d.n;
  for (const [subjectId, list] of evidence) {
    const summary = result.get(subjectId)!;
    if (list.length >= MIN_EVIDENCE) {
      summary.mastery = masteryOf(list, now);
      summary.status = statusOf(summary.mastery, list.length);
    }
    summary.lastStudiedAt = list.reduce<Date | null>((latest, e) => (!latest || e.at > latest ? e.at : latest), null);
  }
  return result;
}
