"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ProgressBar } from "@/components/ProgressBar";
import { Sparkle } from "@/components/Sparkle";
import { TopicStatusChip } from "@/components/StatusChip";
import type { QuizAttempt, Recommendation, SubjectProgress, TopicProgress } from "@/lib/types";

interface Props {
  subjectId: string;
  /** Cambia cuando llegan preguntas o tarjetas nuevas, para volver a pedir el progreso. */
  refreshKey: number;
}

const percent = (mastery: number) => Math.round(mastery * 100);

/** Dominio por tema, temas débiles y qué repasar primero. No se muestra si la materia aún no tiene qué practicar. */
export function ProgressPanel({ subjectId, refreshKey }: Props) {
  const router = useRouter();
  const [progress, setProgress] = useState<SubjectProgress | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Si la carga falla se avisa (no se oculta el panel); `reloadKey` la vuelve a lanzar.
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  function reload() {
    setFailed(false);
    setReloadKey((n) => n + 1);
  }

  useEffect(() => {
    apiFetch<SubjectProgress>(`/subjects/${subjectId}/progress`)
      .then(setProgress)
      .catch(() => setFailed(true));
  }, [subjectId, refreshKey, reloadKey]);

  if (failed) {
    return (
      <section id="progreso" className="scroll-mt-4">
        <h2 className="mt-10 font-display text-xl font-semibold">Tu progreso</h2>
        <ErrorNotice message="No pudimos cargar tu progreso." onRetry={reload} className="mt-3" />
      </section>
    );
  }
  if (!progress || progress.topics.length === 0) return null;

  async function practice(topicId: string) {
    setStarting(topicId);
    setError(null);
    try {
      const data = await apiFetch<{ attempt: QuizAttempt }>(`/subjects/${subjectId}/quizzes`, {
        method: "POST",
        body: JSON.stringify({ count: 10, topicId }),
      });
      router.push(`/subjects/${subjectId}/quiz/${data.attempt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo empezar el quiz");
      setStarting(null);
    }
  }

  const { overall, quizzes } = progress;
  const button =
    "inline-flex min-h-11 items-center justify-center rounded-full bg-turquesa px-5 text-sm font-semibold text-ciruela transition-opacity hover:opacity-90 disabled:opacity-40";

  function action(rec: Recommendation) {
    if (rec.type === "tarjetas_vencidas") {
      return (
        <Link href={`/subjects/${subjectId}/flashcards`} className={button}>
          Estudiar tarjetas
        </Link>
      );
    }
    if ((rec.type === "tema_debil" || rec.type === "mas_datos") && rec.questionCount > 0) {
      return (
        <button type="button" onClick={() => void practice(rec.topicId)} disabled={starting !== null} className={button}>
          {starting === rec.topicId ? "Preparando..." : "Practicar este tema"}
        </button>
      );
    }
    return null;
  }

  return (
    <section id="progreso" className="scroll-mt-4">
      <h2 className="mt-10 font-display text-xl font-semibold">Tu progreso</h2>
      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-ciruela/70">Dominio general</p>
          <p className="font-display text-2xl font-semibold">
            {overall.mastery !== null ? `${percent(overall.mastery)}%` : "—"}
          </p>
        </div>
        <ProgressBar
          value={overall.mastery !== null ? percent(overall.mastery) : null}
          label="Dominio general"
          tone="brand"
          className="mt-2"
        />
        {overall.mastery === null && (
          <p className="mt-1 text-sm text-ciruela/60">
            Responde al menos {progress.minEvidence} preguntas o repasa tarjetas para medir tu dominio.
          </p>
        )}
        {quizzes.finished > 0 && (
          <p className="mt-1 text-xs text-ciruela/60">
            {quizzes.finished} {quizzes.finished === 1 ? "quiz terminado" : "quizzes terminados"} · promedio{" "}
            {quizzes.averagePercent}% · último {quizzes.lastPercent}%
          </p>
        )}

        {progress.recommendations.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-ciruela/70">Qué repasar ahora</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {progress.recommendations.map((rec, i) => {
                const cta = action(rec);
                return (
                  <li
                    key={`${rec.type}-${i}`}
                    className="flex flex-col gap-3 rounded-xl bg-yuzu/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="flex items-start gap-2 text-sm">
                      <Sparkle className="mt-0.5 h-4 w-4 shrink-0 text-teal-deep" />
                      <span>{rec.message}</span>
                    </p>
                    {cta && <div className="shrink-0">{cta}</div>}
                  </li>
                );
              })}
            </ul>
            {error && (
              <p role="alert" className="mt-3 text-sm text-wine">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-ciruela/70">Dominio por tema</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {progress.topics.map((t) => (
              <TopicRow key={t.id} topic={t} minEvidence={progress.minEvidence} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function TopicRow({ topic, minEvidence }: { topic: TopicProgress; minEvidence: number }) {
  const value = topic.mastery !== null ? percent(topic.mastery) : 0;
  const detail =
    topic.status === "sin_datos"
      ? `${topic.evidenceCount} de ${minEvidence} respuestas o repasos necesarios`
      : `${topic.quizAnswers} ${topic.quizAnswers === 1 ? "respuesta" : "respuestas"} · ${topic.cardReviews} ${topic.cardReviews === 1 ? "repaso" : "repasos"}`;
  return (
    <li>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{topic.name}</span>
        <TopicStatusChip status={topic.status} />
        <span className="w-10 shrink-0 text-right text-sm font-semibold">
          {topic.mastery !== null ? `${value}%` : "—"}
        </span>
      </div>
      <ProgressBar value={topic.mastery !== null ? value : null} label={`Dominio de ${topic.name}`} tone={topic.status} className="mt-1.5" />
      <p className="mt-1 text-xs text-ciruela/60">{detail}</p>
    </li>
  );
}
