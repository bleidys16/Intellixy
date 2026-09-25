import { and, eq, isNotNull, sql } from "drizzle-orm";
import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { attemptAnswers, flashcardReviews, flashcards, questions, quizAttempts, topics } from "../db/schema.js";
import { type Evidence, masteryOf, MIN_EVIDENCE, statusOf, type TopicStatus } from "../progress/mastery.js";
import { getOwnedSubject } from "./access.js";
import { safe } from "./safe.js";

/**
 * Panel de progreso de una materia: dominio por tema, temas débiles y recomendaciones. Todo se calcula
 * al vuelo con las respuestas y repasos ya guardados (no gasta IA ni tiene tablas propias).
 */
export const progressRouter = Router({ mergeParams: true });
progressRouter.use(requireAuth);

/** Un repaso de tarjeta vale como evidencia: lo sabía = acierto, dudé = a medias, no lo sabía = fallo. */
const REVIEW_SCORE = { sabia: 1, dude: 0.5, no_sabia: 0 } as const;

const MAX_RECOMMENDATIONS = 3;
const WEAK_TOPICS_RECOMMENDED = 2;

type Recommendation =
  | { type: "tarjetas_vencidas"; message: string; count: number }
  | { type: "tema_debil"; message: string; topicId: string; topicName: string; mastery: number; questionCount: number }
  | { type: "mas_datos"; message: string; topicId: string; topicName: string; missing: number; questionCount: number }
  | { type: "al_dia"; message: string };

type SubjectParams = { subjectId: string };

progressRouter.get<SubjectParams>(
  "/",
  safe(async (req, res) => {
    const subject = await getOwnedSubject(req.params.subjectId, req.userId!);
    if (!subject) {
      res.status(404).json({ error: "Materia no encontrada" });
      return;
    }
    const now = new Date();

    const [topicRows, answerRows, reviewRows, questionCounts, cardRows, attemptRows] = await Promise.all([
      db.select({ id: topics.id, name: topics.name }).from(topics).where(eq(topics.subjectId, subject.id)),
      db
        .select({ topicId: questions.topicId, isCorrect: attemptAnswers.isCorrect, at: attemptAnswers.answeredAt })
        .from(attemptAnswers)
        .innerJoin(quizAttempts, eq(attemptAnswers.attemptId, quizAttempts.id))
        .innerJoin(questions, eq(attemptAnswers.questionId, questions.id))
        .where(
          and(
            eq(quizAttempts.subjectId, subject.id),
            eq(quizAttempts.userId, req.userId!),
            isNotNull(attemptAnswers.answeredAt),
          ),
        ),
      db
        .select({ topicId: flashcards.topicId, result: flashcardReviews.result, at: flashcardReviews.reviewedAt })
        .from(flashcardReviews)
        .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
        .where(eq(flashcards.subjectId, subject.id)),
      db
        .select({ topicId: questions.topicId, n: sql<number>`count(*)::int` })
        .from(questions)
        .where(eq(questions.subjectId, subject.id))
        .groupBy(questions.topicId),
      db
        .select({ topicId: flashcards.topicId, dueAt: flashcards.dueAt })
        .from(flashcards)
        .where(eq(flashcards.subjectId, subject.id)),
      db
        .select({ score: quizAttempts.score, total: quizAttempts.total })
        .from(quizAttempts)
        .where(
          and(
            eq(quizAttempts.subjectId, subject.id),
            eq(quizAttempts.userId, req.userId!),
            eq(quizAttempts.status, "terminado"),
          ),
        )
        .orderBy(sql`${quizAttempts.finishedAt} desc`),
    ]);

    const byTopic = new Map<string, { evidence: Evidence[]; quiz: number; cards: number }>();
    const bucket = (topicId: string) => {
      let b = byTopic.get(topicId);
      if (!b) byTopic.set(topicId, (b = { evidence: [], quiz: 0, cards: 0 }));
      return b;
    };
    for (const a of answerRows) {
      const b = bucket(a.topicId);
      b.quiz++;
      b.evidence.push({ score: a.isCorrect ? 1 : 0, at: a.at! });
    }
    for (const r of reviewRows) {
      const b = bucket(r.topicId);
      b.cards++;
      b.evidence.push({ score: REVIEW_SCORE[r.result as keyof typeof REVIEW_SCORE] ?? 0, at: r.at });
    }
    const questionsByTopic = new Map(questionCounts.map((q) => [q.topicId, q.n]));
    const cardsByTopic = new Map<string, number>();
    let dueCards = 0;
    for (const c of cardRows) {
      cardsByTopic.set(c.topicId, (cardsByTopic.get(c.topicId) ?? 0) + 1);
      if (c.dueAt.getTime() <= now.getTime()) dueCards++;
    }

    // Solo cuentan los temas que tienen contenido (preguntas o tarjetas): un tema sin nada que estudiar no aporta.
    const topicList = topicRows
      .filter((t) => (questionsByTopic.get(t.id) ?? 0) > 0 || (cardsByTopic.get(t.id) ?? 0) > 0)
      .map((t) => {
        const b = byTopic.get(t.id);
        const evidenceCount = b?.evidence.length ?? 0;
        const mastery = b ? masteryOf(b.evidence, now) : null;
        const status: TopicStatus = statusOf(mastery, evidenceCount);
        const lastActivityAt = b?.evidence.reduce<Date | null>((m, e) => (!m || e.at > m ? e.at : m), null) ?? null;
        return {
          id: t.id,
          name: t.name,
          // Sin evidencias suficientes no se muestra porcentaje: sería ruido.
          mastery: status === "sin_datos" ? null : mastery,
          status,
          evidenceCount,
          quizAnswers: b?.quiz ?? 0,
          cardReviews: b?.cards ?? 0,
          questionCount: questionsByTopic.get(t.id) ?? 0,
          cardCount: cardsByTopic.get(t.id) ?? 0,
          lastActivityAt,
        };
      })
      // Débiles primero, luego en progreso, dominados y, al final, los que aún no tienen datos.
      .sort((a, b) => {
        const rank = (s: TopicStatus) => ({ debil: 0, en_progreso: 1, dominado: 2, sin_datos: 3 })[s];
        return rank(a.status) - rank(b.status) || (a.mastery ?? 1) - (b.mastery ?? 1) || a.name.localeCompare(b.name);
      });

    const allEvidence = [...byTopic.values()].flatMap((b) => b.evidence);
    const overallMastery = masteryOf(allEvidence, now);
    const overall = {
      mastery: allEvidence.length >= MIN_EVIDENCE ? overallMastery : null,
      evidenceCount: allEvidence.length,
    };

    const percents = attemptRows.filter((a) => a.score !== null && a.total > 0).map((a) => (a.score! / a.total) * 100);
    const quizzes = {
      finished: percents.length,
      averagePercent: percents.length ? Math.round(percents.reduce((s, p) => s + p, 0) / percents.length) : null,
      lastPercent: percents.length ? Math.round(percents[0]) : null,
    };

    // Recomendación: primero las tarjetas vencidas, luego los temas más débiles, y si no hay ninguno,
    // el tema al que más le faltan respuestas para poder medirlo.
    const recommendations: Recommendation[] = [];
    if (dueCards > 0) {
      recommendations.push({
        type: "tarjetas_vencidas",
        count: dueCards,
        message: `Repasa tus ${dueCards} ${dueCards === 1 ? "tarjeta pendiente" : "tarjetas pendientes"} de hoy.`,
      });
    }
    for (const t of topicList.filter((t) => t.status === "debil").slice(0, WEAK_TOPICS_RECOMMENDED)) {
      recommendations.push({
        type: "tema_debil",
        topicId: t.id,
        topicName: t.name,
        mastery: t.mastery!,
        questionCount: t.questionCount,
        message: `Refuerza «${t.name}»: tu dominio es ${Math.round(t.mastery! * 100)}%.`,
      });
    }
    if (!recommendations.some((r) => r.type === "tema_debil")) {
      const thin = topicList
        .filter((t) => t.status === "sin_datos" && t.questionCount > 0)
        .sort((a, b) => a.evidenceCount - b.evidenceCount)[0];
      if (thin) {
        const missing = MIN_EVIDENCE - thin.evidenceCount;
        recommendations.push({
          type: "mas_datos",
          topicId: thin.id,
          topicName: thin.name,
          missing,
          questionCount: thin.questionCount,
          message: `Practica «${thin.name}»: te faltan ${missing} ${missing === 1 ? "respuesta o repaso" : "respuestas o repasos"} para medir tu dominio.`,
        });
      }
    }
    if (recommendations.length === 0 && topicList.some((t) => t.status !== "sin_datos")) {
      recommendations.push({ type: "al_dia", message: "Vas bien: no tienes temas débiles ni tarjetas pendientes." });
    }

    res.json({
      overall,
      topics: topicList,
      quizzes,
      flashcards: { total: cardRows.length, due: dueCards },
      recommendations: recommendations.slice(0, MAX_RECOMMENDATIONS),
      minEvidence: MIN_EVIDENCE,
    });
  }),
);
