"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import type { Question, Subject } from "@/lib/types";

const OPTION_LETTERS = ["a", "b", "c", "d"] as const;

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useSession();
  const router = useRouter();

  const [subject, setSubject] = useState<Subject | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [materialName, setMaterialName] = useState("");
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ subject: Subject }>(`/subjects/${id}`).then((data) => setSubject(data.subject));
    apiFetch<{ questions: Question[] }>(`/subjects/${id}/questions`).then((data) =>
      setQuestions(data.questions),
    );
  }, [user, id]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGenerating(true);
    try {
      // Dos pasos: primero se crea el material, luego se piden las preguntas de ese material.
      const created = await apiFetch<{ material: { id: string } }>(
        `/subjects/${id}/materials/text`,
        {
          method: "POST",
          body: JSON.stringify({ name: materialName || "Texto pegado", text }),
        },
      );
      const data = await apiFetch<{ questions: Question[] }>(`/subjects/${id}/questions/generate`, {
        method: "POST",
        body: JSON.stringify({ materialId: created.material.id }),
      });
      setQuestions((prev) => [...data.questions, ...prev]);
      setMaterialName("");
      setText("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron generar las preguntas");
    } finally {
      setGenerating(false);
    }
  }

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-ciruela/50">Cargando...</div>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopNav user={user} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8 sm:px-10">
        <h1 className="font-display text-3xl font-semibold">{subject?.name ?? "Materia"}</h1>

        <form onSubmit={handleGenerate} className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium">
            Nombre del material (opcional)
            <input
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              placeholder="ej. Apuntes de clase 3"
              className="mt-1 w-full rounded-lg border border-ciruela/15 px-3 py-2 outline-none focus:border-turquesa"
            />
          </label>

          <label className="mt-4 block text-sm font-medium">
            Pegá tu texto
            <textarea
              required
              minLength={50}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Pegá acá tus apuntes, un resumen, o cualquier texto de estudio..."
              className="mt-1 w-full rounded-lg border border-ciruela/15 px-3 py-2 outline-none focus:border-turquesa"
            />
          </label>

          {error && <p className="mt-3 text-sm text-wine">{error}</p>}

          <button
            type="submit"
            disabled={generating}
            className="mt-4 rounded-full bg-turquesa px-5 py-2.5 font-medium text-ciruela transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {generating ? "Generando... (puede tardar hasta 2 min)" : "Generar preguntas"}
          </button>
        </form>

        <h2 className="mt-10 font-display text-xl font-semibold">
          Preguntas generadas {questions.length > 0 && `(${questions.length})`}
        </h2>

        {questions.length === 0 ? (
          <p className="mt-3 text-ciruela/50">Todavía no generaste preguntas para esta materia.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {questions.map((q) => (
              <li key={q.id} className="rounded-2xl bg-white p-5 shadow-sm">
                {q.topic && (
                  <span className="rounded-full bg-card-lime px-2.5 py-0.5 text-xs font-medium text-ciruela">
                    {q.topic.name}
                  </span>
                )}
                <p className="mt-2 font-medium">{q.prompt}</p>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {OPTION_LETTERS.map((letter) => (
                    <li
                      key={letter}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        letter === q.correctOption
                          ? "bg-teal-deep/10 font-medium text-teal-deep"
                          : "text-ciruela/70"
                      }`}
                    >
                      {letter}) {q.options[letter]}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-ciruela/60">{q.explanation}</p>
                <p className="mt-2 border-l-2 border-turquesa pl-2 text-xs italic text-ciruela/50">
                  “{q.sourceQuote}”
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
