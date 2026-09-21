"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MaterialCard } from "@/components/MaterialCard";
import { MaterialUploader } from "@/components/MaterialUploader";
import { TopNav } from "@/components/TopNav";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import type { GenerationResult, Material, Question, Subject } from "@/lib/types";

const OPTION_LETTERS = ["a", "b", "c", "d"] as const;
const POLL_INTERVAL_MS = 2500;

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useSession();
  const router = useRouter();

  const [subject, setSubject] = useState<Subject | null>(null);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ subject: Subject }>(`/subjects/${id}`)
      .then((data) => setSubject(data.subject))
      .catch(() => router.push("/"));
    apiFetch<{ materials: Material[] }>(`/subjects/${id}/materials`)
      .then((data) => setMaterials(data.materials))
      .catch(() => {});
    apiFetch<{ questions: Question[] }>(`/subjects/${id}/questions`)
      .then((data) => setQuestions(data.questions))
      .catch(() => {});
  }, [user, id, router]);

  // Mientras algún material se esté leyendo, se consulta la lista cada pocos segundos.
  const hasPending = materials?.some((m) => m.status === "pendiente" || m.status === "procesando");
  useEffect(() => {
    if (!user || !hasPending) return;
    const timer = window.setInterval(() => {
      apiFetch<{ materials: Material[] }>(`/subjects/${id}/materials`)
        .then((data) => setMaterials(data.materials))
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [user, id, hasPending]);

  function handleCreated(material: Material) {
    setMaterials((prev) => [material, ...(prev ?? [])]);
  }

  async function handleGenerate(material: Material) {
    setError(null);
    setNotice(null);
    setGeneratingId(material.id);
    try {
      const result = await apiFetch<GenerationResult>(`/subjects/${id}/questions/generate`, {
        method: "POST",
        body: JSON.stringify({ materialId: material.id }),
      });
      setQuestions((prev) => [...result.questions, ...prev]);

      const count = result.questions.length;
      const parts = [
        `Se generaron ${count} ${count === 1 ? "pregunta" : "preguntas"} de «${material.name}».`,
      ];
      if (result.sampled) {
        parts.push("El material es largo, así que se usaron páginas repartidas de todo el documento.");
      }
      if (result.discarded > 0) {
        parts.push(
          `${result.discarded} se descartaron porque su cita no se pudo verificar en el material.`,
        );
      }
      setNotice(parts.join(" "));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron generar las preguntas");
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleRetry(material: Material) {
    const data = await apiFetch<{ material: Material }>(
      `/subjects/${id}/materials/${material.id}/retry`,
      { method: "POST" },
    );
    setMaterials((prev) => prev?.map((m) => (m.id === material.id ? data.material : m)) ?? prev);
  }

  async function handleDelete(material: Material) {
    await apiFetch(`/subjects/${id}/materials/${material.id}`, { method: "DELETE" });
    setMaterials((prev) => prev?.filter((m) => m.id !== material.id) ?? prev);
    // Borrar un material borra también sus preguntas: se vuelve a pedir la lista.
    const data = await apiFetch<{ questions: Question[] }>(`/subjects/${id}/questions`);
    setQuestions(data.questions);
  }

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-ciruela/50">Cargando...</div>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopNav user={user} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8 sm:px-10">
        <Link href="/" className="text-sm font-medium text-teal-deep hover:underline">
          ← Mis materias
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">{subject?.name ?? "Materia"}</h1>

        <h2 className="mt-8 font-display text-xl font-semibold">Materiales</h2>
        <div className="mt-3">
          <MaterialUploader subjectId={id} onCreated={handleCreated} />
        </div>

        {materials === null ? (
          <p className="mt-4 text-ciruela/50">Cargando materiales...</p>
        ) : materials.length === 0 ? (
          <p className="mt-4 text-ciruela/50">
            Todavía no has añadido material. Sube un PDF, una foto de tus apuntes o pega un texto.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {materials.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                subjectId={id}
                generating={generatingId === material.id}
                anyGenerating={generatingId !== null}
                onGenerate={handleGenerate}
                onRetry={handleRetry}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}

        {notice && (
          <p role="status" className="mt-4 rounded-xl bg-yuzu/50 px-4 py-3 text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-wine/10 px-4 py-3 text-sm text-wine">
            {error}
          </p>
        )}

        <h2 className="mt-10 font-display text-xl font-semibold">
          Preguntas generadas {questions.length > 0 && `(${questions.length})`}
        </h2>

        {questions.length === 0 ? (
          <p className="mt-3 text-ciruela/50">
            Todavía no has generado preguntas. Cuando un material esté listo, pulsa «Generar preguntas».
          </p>
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
