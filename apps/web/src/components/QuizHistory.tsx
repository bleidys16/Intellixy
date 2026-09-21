"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { QuizSummary } from "@/lib/types";

/** Últimos intentos de la materia; los que quedaron a medias se pueden retomar. */
export function QuizHistory({ subjectId }: { subjectId: string }) {
  const [attempts, setAttempts] = useState<QuizSummary[] | null>(null);

  useEffect(() => {
    apiFetch<{ attempts: QuizSummary[] }>(`/subjects/${subjectId}/quizzes`)
      .then((data) => setAttempts(data.attempts.slice(0, 5)))
      .catch(() => setAttempts([]));
  }, [subjectId]);

  if (!attempts || attempts.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-ciruela/70">Tus últimos intentos</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {attempts.map((a) => {
          const date = new Date(a.createdAt).toLocaleDateString("es", { day: "numeric", month: "short" });
          const done = a.status === "terminado";
          const percent = done && a.score !== null && a.total > 0 ? Math.round((a.score / a.total) * 100) : null;
          return (
            <li key={a.id}>
              <Link
                href={`/subjects/${subjectId}/quiz/${a.id}`}
                className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-white px-4 py-2.5 text-sm shadow-sm transition-colors hover:bg-ciruela/5"
              >
                <span className="text-ciruela/60">{date}</span>
                <span className="flex-1 font-medium">
                  {done
                    ? `${a.score}/${a.total} correctas${percent !== null ? ` · ${percent}%` : ""}`
                    : `${a.answered} de ${a.total} respondidas`}
                </span>
                <span className="shrink-0 font-medium text-teal-deep">{done ? "Ver" : "Continuar"} →</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
