"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { Question, QuizAttempt } from "@/lib/types";

/** Igual que el tope de la API (MAX_QUIZ_SIZE). */
const MAX_QUIZ_SIZE = 30;
const COUNT_CHOICES = [5, 10, 20];

interface Props {
  subjectId: string;
  questions: Question[];
}

export function QuizLauncher({ subjectId, questions }: Props) {
  const router = useRouter();
  const [scope, setScope] = useState("all");
  // null = todas las del alcance (hasta el tope)
  const [count, setCount] = useState<number | null>(10);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { materials, topics } = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    const t = new Map<string, { name: string; n: number }>();
    for (const q of questions) {
      const mm = m.get(q.material.id) ?? { name: q.material.name, n: 0 };
      mm.n++;
      m.set(q.material.id, mm);
      if (q.topic) {
        const tt = t.get(q.topic.id) ?? { name: q.topic.name, n: 0 };
        tt.n++;
        t.set(q.topic.id, tt);
      }
    }
    return { materials: [...m.entries()], topics: [...t.entries()] };
  }, [questions]);

  const available = useMemo(() => {
    if (scope === "all") return questions.length;
    const [kind, value] = scope.split(":");
    return questions.filter((q) => (kind === "material" ? q.material.id === value : q.topic?.id === value)).length;
  }, [scope, questions]);

  const cap = Math.min(available, MAX_QUIZ_SIZE);
  const choices = COUNT_CHOICES.filter((n) => n < cap);
  const effective = count === null || count >= cap ? cap : count;
  // "Todas" está activa cuando la cantidad efectiva no coincide con ninguna de las opciones fijas.
  const allActive = !choices.includes(effective);

  async function start() {
    setStarting(true);
    setError(null);
    const [kind, value] = scope.split(":");
    try {
      const data = await apiFetch<{ attempt: QuizAttempt }>(`/subjects/${subjectId}/quizzes`, {
        method: "POST",
        body: JSON.stringify({
          count: effective,
          ...(kind === "material" ? { materialId: value } : {}),
          ...(kind === "topic" ? { topicId: value } : {}),
        }),
      });
      router.push(`/subjects/${subjectId}/quiz/${data.attempt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo empezar el quiz");
      setStarting(false);
    }
  }

  const chip = (active: boolean) =>
    `min-h-10 rounded-full border px-4 text-sm font-medium transition-colors ${
      active ? "border-ciruela bg-ciruela text-white" : "border-ciruela/20 hover:bg-ciruela/5"
    }`;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <label className="block text-sm font-medium" htmlFor="quiz-scope">
        ¿Sobre qué quieres practicar?
      </label>
      <select
        id="quiz-scope"
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        className="mt-1.5 min-h-11 w-full rounded-xl border border-ciruela/20 bg-oat px-3 text-sm"
      >
        <option value="all">Toda la materia ({questions.length})</option>
        {materials.length > 1 && (
          <optgroup label="Por material">
            {materials.map(([mid, m]) => (
              <option key={mid} value={`material:${mid}`}>
                {m.name} ({m.n})
              </option>
            ))}
          </optgroup>
        )}
        {topics.length > 1 && (
          <optgroup label="Por tema">
            {topics.map(([tid, t]) => (
              <option key={tid} value={`topic:${tid}`}>
                {t.name} ({t.n})
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <p className="mt-4 text-sm font-medium">Cantidad de preguntas</p>
      <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Cantidad de preguntas">
        {choices.map((n) => (
          <button key={n} type="button" onClick={() => setCount(n)} className={chip(effective === n)}>
            {n}
          </button>
        ))}
        <button type="button" onClick={() => setCount(null)} className={chip(allActive)}>
          Todas ({cap})
        </button>
      </div>

      <button
        type="button"
        onClick={() => void start()}
        disabled={starting || cap === 0}
        className="mt-5 min-h-11 w-full rounded-full bg-turquesa px-5 text-sm font-semibold text-ciruela transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        {starting ? "Preparando..." : `Empezar quiz de ${effective} ${effective === 1 ? "pregunta" : "preguntas"}`}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-wine">
          {error}
        </p>
      )}
    </div>
  );
}
