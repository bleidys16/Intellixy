"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MaterialCard } from "@/components/MaterialCard";
import { MaterialUploader } from "@/components/MaterialUploader";
import { QuestionGroups } from "@/components/QuestionGroups";
import { QuizHistory } from "@/components/QuizHistory";
import { QuizLauncher } from "@/components/QuizLauncher";
import { TopNav } from "@/components/TopNav";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import type { GenerationJob, Material, Question, Subject } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useSession();
  const router = useRouter();

  const [subject, setSubject] = useState<Subject | null>(null);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Trabajos ya avisados: cada generación terminada se comunica una sola vez.
  const handledJobs = useRef(new Set<string>());
  const materialsRef = useRef<Material[] | null>(null);
  useEffect(() => {
    materialsRef.current = materials;
  }, [materials]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  const refreshQuestions = useCallback(async () => {
    const data = await apiFetch<{ questions: Question[] }>(`/subjects/${id}/questions`);
    setQuestions(data.questions);
  }, [id]);

  /** Aplica la lista de trabajos del servidor y avisa de los que acaban de terminar. */
  const syncJobs = useCallback(
    (list: GenerationJob[], announce: boolean) => {
      setJobs(list);
      for (const job of list) {
        if ((job.status !== "listo" && job.status !== "error") || handledJobs.current.has(job.id)) continue;
        handledJobs.current.add(job.id);
        if (!announce) continue;

        if (job.status === "error") {
          setNotice(null);
          setError(job.errorMessage ?? "No se pudieron generar las preguntas");
          continue;
        }
        const name = materialsRef.current?.find((m) => m.id === job.materialId)?.name ?? "tu material";
        const parts = [
          `Se generaron ${job.questionCount} ${job.questionCount === 1 ? "pregunta" : "preguntas"} de «${name}».`,
        ];
        if (job.sampled) {
          parts.push("El material es largo, así que se usaron páginas repartidas de todo el documento.");
        }
        if (job.discarded > 0) {
          parts.push(`${job.discarded} se descartaron porque su cita no se pudo verificar en el material.`);
        }
        setError(null);
        setNotice(parts.join(" "));
        void refreshQuestions().catch(() => {});
      }
    },
    [refreshQuestions],
  );

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
    // Si se recargó la página mientras se generaba, se recupera el estado sin volver a avisar de lo ya terminado.
    apiFetch<{ jobs: GenerationJob[] }>(`/subjects/${id}/generations`)
      .then((data) => syncJobs(data.jobs, false))
      .catch(() => {});
  }, [user, id, router, syncJobs]);

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

  // Mientras haya una generación en curso se consulta el estado cada pocos segundos.
  const hasActiveJob = jobs.some((j) => j.status === "pendiente" || j.status === "procesando");
  useEffect(() => {
    if (!user || !hasActiveJob) return;
    const timer = window.setInterval(() => {
      apiFetch<{ jobs: GenerationJob[] }>(`/subjects/${id}/generations`)
        .then((data) => syncJobs(data.jobs, true))
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [user, id, hasActiveJob, syncJobs]);

  function handleCreated(material: Material) {
    setMaterials((prev) => [material, ...(prev ?? [])]);
  }

  async function handleGenerate(material: Material) {
    setError(null);
    setNotice(null);
    try {
      const { job } = await apiFetch<{ job: GenerationJob }>(`/subjects/${id}/questions/generate`, {
        method: "POST",
        body: JSON.stringify({ materialId: material.id }),
      });
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
      setNotice(
        `Estamos generando las preguntas de «${material.name}». Puedes seguir usando la app; te avisamos cuando estén listas.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Ya había una generación en curso para este material: se muestra esa.
        const data = await apiFetch<{ jobs: GenerationJob[] }>(`/subjects/${id}/generations`).catch(() => null);
        if (data) syncJobs(data.jobs, false);
      }
      setError(err instanceof ApiError ? err.message : "No se pudieron generar las preguntas");
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
    await refreshQuestions();
  }

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-ciruela/50">Cargando...</div>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopNav user={user} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-10 sm:py-8">
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
                generation={
                  jobs.find(
                    (j) => j.materialId === material.id && (j.status === "pendiente" || j.status === "procesando"),
                  ) ?? null
                }
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

        {questions.length > 0 && (
          <section id="practicar" className="scroll-mt-4">
            <h2 className="mt-10 font-display text-xl font-semibold">Practicar</h2>
            <div className="mt-3">
              <QuizLauncher subjectId={id} questions={questions} />
            </div>
            <QuizHistory subjectId={id} />
          </section>
        )}

        <h2 className="mt-10 font-display text-xl font-semibold">
          Preguntas generadas {questions.length > 0 && `(${questions.length})`}
        </h2>

        {questions.length === 0 ? (
          <p className="mt-3 text-ciruela/50">
            Todavía no has generado preguntas. Cuando un material esté listo, pulsa «Generar preguntas».
          </p>
        ) : (
          <QuestionGroups questions={questions} />
        )}
      </main>
    </div>
  );
}
