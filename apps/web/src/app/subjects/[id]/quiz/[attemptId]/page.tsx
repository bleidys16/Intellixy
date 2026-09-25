"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { ProgressBar } from "@/components/ProgressBar";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import type { OptionLetter, QuizAnswerResponse, QuizAttempt, QuizItem, QuizResult } from "@/lib/types";

const LETTERS: OptionLetter[] = ["a", "b", "c", "d"];

function sourceLabel(item: QuizItem, result: QuizResult): string {
  // En texto pegado no hay páginas: solo se nombra el material.
  return item.question.material.type === "pdf"
    ? `${result.source.materialName}, p. ${result.source.page}`
    : result.source.materialName;
}

function Source({ item, result }: { item: QuizItem; result: QuizResult }) {
  return (
    <p className="border-l-2 border-turquesa pl-3 text-xs italic text-ciruela/70">
      “{result.source.quote}”
      <span className="mt-1 block font-medium not-italic">Fuente: {sourceLabel(item, result)}</span>
    </p>
  );
}

export default function QuizPage() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  const { user, loading } = useSession();
  const router = useRouter();

  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [items, setItems] = useState<QuizItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shownAt = useRef(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const ready = items !== null;

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    // Ignora la respuesta de una carga anterior (React ejecuta el efecto dos veces en desarrollo): si llegara
    // tarde, volvería a la primera pregunta sin responder en plena partida.
    let cancelled = false;
    apiFetch<{ attempt: QuizAttempt; items: QuizItem[] }>(`/subjects/${id}/quizzes/${attemptId}`)
      .then((data) => {
        if (cancelled) return;
        setAttempt(data.attempt);
        setItems(data.items);
        // Se retoma en la primera pregunta sin responder; si no queda ninguna, se muestran los resultados.
        const first = data.items.findIndex((i) => !i.answered);
        if (first === -1) setShowResults(true);
        else setIndex(first);
      })
      .catch(() => {
        if (!cancelled) router.push(`/subjects/${id}`);
      });
    return () => {
      cancelled = true;
    };
  }, [user, id, attemptId, router]);

  // El tiempo por pregunta se mide desde que aparece en pantalla.
  useEffect(() => {
    shownAt.current = performance.now();
  }, [index, ready]);

  const current = items?.[index];
  const currentResult = current?.result ?? null;

  // Al responder, el foco pasa a "Siguiente": se puede avanzar solo con el teclado.
  useEffect(() => {
    if (currentResult) nextRef.current?.focus();
  }, [currentResult]);

  async function answer(letter: OptionLetter, clickedAt: number) {
    if (!current || current.answered || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const seconds = Math.max(0, Math.round((clickedAt - shownAt.current) / 1000));
      const res = await apiFetch<QuizAnswerResponse>(`/subjects/${id}/quizzes/${attemptId}/answers`, {
        method: "POST",
        body: JSON.stringify({ questionId: current.question.id, answer: letter, seconds }),
      });
      setItems((prev) =>
        prev?.map((i) => (i.position === current.position ? { ...i, answered: true, result: res.result } : i)) ?? prev,
      );
      setAttempt(res.attempt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la respuesta. Inténtalo de nuevo");
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (!items) return;
    if (index < items.length - 1) setIndex(index + 1);
    else setShowResults(true);
  }

  if (loading || !user || !items || !attempt) {
    return <div className="flex flex-1 items-center justify-center text-ciruela/50">Cargando...</div>;
  }

  const back = (
    <Link href={`/subjects/${id}`} className="text-sm font-medium text-teal-deep hover:underline">
      ← Volver a la materia
    </Link>
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <TopNav user={user} />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-10 sm:py-8">
          {back}
          <p className="mt-6 text-ciruela/70">
            Este intento ya no tiene preguntas: se borró el material del que salían.
          </p>
        </main>
      </div>
    );
  }

  if (showResults) {
    return <Results user={user} subjectId={id} attempt={attempt} items={items} />;
  }

  const answeredCount = items.filter((i) => i.answered).length;
  const isLast = index === items.length - 1;

  return (
    <div className="flex flex-1 flex-col">
      <TopNav user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-10 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <Link href={`/subjects/${id}`} className="text-sm font-medium text-teal-deep hover:underline">
            ← Salir
          </Link>
          <span className="text-sm text-ciruela/60">
            Pregunta {index + 1} de {items.length}
          </span>
        </div>
        <ProgressBar value={answeredCount} max={items.length} label="Progreso del quiz" className="mt-3" />

        {current && (
          <>
            <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
              <span className="rounded-full bg-card-lime px-2.5 py-0.5 text-xs font-medium">
                {current.question.topic.name}
              </span>
              <h1 className="mt-3 font-display text-xl font-semibold leading-snug">{current.question.prompt}</h1>

              <ul className="mt-5 flex flex-col gap-2.5">
                {LETTERS.map((letter) => {
                  const result = current.result;
                  const isCorrectOption = result?.correctOption === letter;
                  const isWrongPick = result !== null && result.givenAnswer === letter && !isCorrectOption;
                  const state = isCorrectOption
                    ? "border-teal-deep bg-teal-deep/10 text-teal-deep"
                    : isWrongPick
                      ? "border-wine bg-wine/10 text-wine"
                      : result
                        ? "border-transparent bg-ciruela/5 text-ciruela/50"
                        : "border-ciruela/15 bg-white hover:border-turquesa";
                  return (
                    <li key={letter}>
                      <button
                        type="button"
                        onClick={(e) => void answer(letter, e.timeStamp)}
                        disabled={current.answered || submitting}
                        className={`flex min-h-12 w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-[15px] transition-colors disabled:cursor-default ${state}`}
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ciruela/10 text-xs font-semibold">
                          {isCorrectOption ? "✓" : isWrongPick ? "✗" : letter.toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">{current.question.options[letter]}</span>
                        {isCorrectOption && <span className="sr-only">(respuesta correcta)</span>}
                        {isWrongPick && <span className="sr-only">(tu respuesta, incorrecta)</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-wine/10 px-4 py-3 text-sm text-wine">
                {error}
              </p>
            )}

            {current.result && (
              <section
                role="status"
                className={`mt-4 rounded-2xl p-4 sm:p-5 ${current.result.isCorrect ? "bg-teal-deep/10" : "bg-wine/10"}`}
              >
                <p className={`font-semibold ${current.result.isCorrect ? "text-teal-deep" : "text-wine"}`}>
                  {current.result.isCorrect
                    ? "¡Correcto!"
                    : `Incorrecto. La respuesta correcta era la ${current.result.correctOption.toUpperCase()}.`}
                </p>
                <p className="mt-2 text-sm">{current.result.explanation}</p>
                <div className="mt-3">
                  <Source item={current} result={current.result} />
                </div>
                <button
                  ref={nextRef}
                  type="button"
                  onClick={next}
                  className="mt-4 min-h-11 w-full rounded-full bg-ciruela px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
                >
                  {isLast ? "Ver resultados" : "Siguiente"}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Results({
  user,
  subjectId,
  attempt,
  items,
}: {
  user: NonNullable<ReturnType<typeof useSession>["user"]>;
  subjectId: string;
  attempt: QuizAttempt;
  items: QuizItem[];
}) {
  const total = items.length;
  const score = attempt.score ?? items.filter((i) => i.result?.isCorrect).length;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  const title = percent >= 80 ? "¡Excelente!" : percent >= 50 ? "Buen avance" : "Sigue practicando";

  const byTopic = new Map<string, { name: string; ok: number; total: number }>();
  for (const i of items) {
    const t = byTopic.get(i.question.topic.id) ?? { name: i.question.topic.name, ok: 0, total: 0 };
    t.total++;
    if (i.result?.isCorrect) t.ok++;
    byTopic.set(i.question.topic.id, t);
  }
  // Los temas más flojos primero: es lo que conviene repasar.
  const topics = [...byTopic.values()].sort((a, b) => a.ok / a.total - b.ok / b.total);
  const missed = items.filter((i) => i.result && !i.result.isCorrect);

  return (
    <div className="flex flex-1 flex-col">
      <TopNav user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-10 sm:py-8">
        <Link href={`/subjects/${subjectId}`} className="text-sm font-medium text-teal-deep hover:underline">
          ← Volver a la materia
        </Link>

        <section className="mt-4 rounded-2xl bg-white p-5 text-center shadow-sm sm:p-8">
          <p className="font-display text-xl font-semibold">{title}</p>
          <p className="mt-2 font-display text-5xl font-semibold text-ciruela">
            {score}
            <span className="text-ciruela/40">/{total}</span>
          </p>
          <p className="mt-1 text-sm text-ciruela/60">{percent}% de respuestas correctas</p>
          <Link
            href={`/subjects/${subjectId}#practicar`}
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-turquesa px-5 text-sm font-semibold text-ciruela transition-opacity hover:opacity-90"
          >
            Hacer otro quiz
          </Link>
        </section>

        {topics.length > 1 && (
          <section className="mt-6">
            <h2 className="font-display text-lg font-semibold">Por tema</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {topics.map((t) => {
                const pct = Math.round((t.ok / t.total) * 100);
                return (
                  <li key={t.name}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{t.name}</span>
                      <span className="shrink-0 text-ciruela/60">
                        {t.ok}/{t.total}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-ciruela/10">
                      <div
                        className={`h-full rounded-full ${pct >= 50 ? "bg-teal-deep" : "bg-wine"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {missed.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold">
              Para repasar ({missed.length})
            </h2>
            <ul className="mt-3 flex flex-col gap-4">
              {missed.map((i) => {
                const r = i.result!;
                return (
                  <li key={i.question.id} className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                    <span className="rounded-full bg-card-lime px-2.5 py-0.5 text-xs font-medium">
                      {i.question.topic.name}
                    </span>
                    <p className="mt-2 font-medium">{i.question.prompt}</p>
                    <p className="mt-3 rounded-lg bg-wine/10 px-3 py-2 text-sm text-wine">
                      ✗ Tu respuesta: {r.givenAnswer?.toUpperCase()}) {r.givenAnswer && i.question.options[r.givenAnswer]}
                    </p>
                    <p className="mt-2 rounded-lg bg-teal-deep/10 px-3 py-2 text-sm font-medium text-teal-deep">
                      ✓ Correcta: {r.correctOption.toUpperCase()}) {i.question.options[r.correctOption]}
                    </p>
                    <p className="mt-3 text-sm text-ciruela/70">{r.explanation}</p>
                    <div className="mt-3">
                      <Source item={i} result={r} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {missed.length === 0 && (
          <p className="mt-6 rounded-xl bg-yuzu/50 px-4 py-3 text-sm">
            ¡No fallaste ninguna! Prueba con otro material o con más preguntas.
          </p>
        )}
      </main>
    </div>
  );
}
