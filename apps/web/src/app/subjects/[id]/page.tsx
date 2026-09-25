"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MaterialCard } from "@/components/MaterialCard";
import { MaterialUploader } from "@/components/MaterialUploader";
import { FlashcardsPanel } from "@/components/FlashcardsPanel";
import { ProgressPanel } from "@/components/ProgressPanel";
import { QuestionGroups } from "@/components/QuestionGroups";
import { QuizHistory } from "@/components/QuizHistory";
import { QuizLauncher } from "@/components/QuizLauncher";
import { TopNav } from "@/components/TopNav";
import { apiFetch, ApiError, errorMessage, isNotFound } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ListSkeleton, Skeleton } from "@/components/Skeleton";
import { FullPageStatus } from "@/components/FullPageStatus";
import { useSession } from "@/lib/useSession";
import type { GenerationJob, GenerationKind, Material, Question, Subject } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading, error: sessionError, retry: retrySession } = useSession();
  const router = useRouter();

  const [subject, setSubject] = useState<Subject | null>(null);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  // Sube cuando termina una generación de tarjetas, para que el panel de tarjetas vuelva a pedir sus totales.
  const [cardsRefresh, setCardsRefresh] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fallo al cargar la materia (red, servidor): se muestra con "Reintentar". `reloadKey` vuelve a lanzar la carga.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
          setError(job.errorMessage ?? `No se pudieron generar las ${job.kind}`);
          continue;
        }
        const name = materialsRef.current?.find((m) => m.id === job.materialId)?.name ?? "tu material";
        const one = job.questionCount === 1;
        const noun = job.kind === "tarjetas" ? (one ? "tarjeta" : "tarjetas") : one ? "pregunta" : "preguntas";
        const parts = [`Se generaron ${job.questionCount} ${noun} de «${name}».`];
        if (job.sampled) {
          parts.push("El material es largo, así que se usaron páginas repartidas de todo el documento.");
        }
        if (job.discarded > 0) {
          parts.push(
            job.kind === "tarjetas"
              ? `${job.discarded} se descartaron: su cita no se pudo verificar o ya tenías una tarjeta igual.`
              : `${job.discarded} se descartaron porque su cita no se pudo verificar en el material.`,
          );
        }
        setError(null);
        setNotice(parts.join(" "));
        if (job.kind === "tarjetas") setCardsRefresh((n) => n + 1);
        else void refreshQuestions().catch(() => {});
      }
    },
    [refreshQuestions],
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Si la materia no existe se sale al inicio; cualquier otro fallo se muestra para poder reintentar.
    const fail = (err: unknown) => {
      if (cancelled) return;
      if (isNotFound(err)) router.push("/");
      else setLoadError(errorMessage(err, "No pudimos cargar la materia"));
    };
    apiFetch<{ subject: Subject }>(`/subjects/${id}`)
      .then((data) => !cancelled && setSubject(data.subject))
      .catch(fail);
    apiFetch<{ materials: Material[] }>(`/subjects/${id}/materials`)
      .then((data) => !cancelled && setMaterials(data.materials))
      .catch(fail);
    apiFetch<{ questions: Question[] }>(`/subjects/${id}/questions`)
      .then((data) => !cancelled && setQuestions(data.questions))
      .catch(fail);
    // Si se recargó la página mientras se generaba, se recupera el estado sin volver a avisar de lo ya terminado.
    apiFetch<{ jobs: GenerationJob[] }>(`/subjects/${id}/generations`)
      .then((data) => !cancelled && syncJobs(data.jobs, false))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, id, router, syncJobs, reloadKey]);

  function reload() {
    setLoadError(null);
    setReloadKey((n) => n + 1);
  }

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

  async function handleGenerate(material: Material, kind: GenerationKind) {
    setError(null);
    setNotice(null);
    const endpoint = kind === "tarjetas" ? "flashcards" : "questions";
    try {
      const { job } = await apiFetch<{ job: GenerationJob }>(`/subjects/${id}/${endpoint}/generate`, {
        method: "POST",
        body: JSON.stringify({ materialId: material.id }),
      });
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
      setNotice(
        `Estamos generando las ${kind} de «${material.name}». Puedes seguir usando la app; te avisamos cuando estén listas.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Ya había una generación en curso para este material: se muestra esa.
        const data = await apiFetch<{ jobs: GenerationJob[] }>(`/subjects/${id}/generations`).catch(() => null);
        if (data) syncJobs(data.jobs, false);
      }
      setError(err instanceof ApiError ? err.message : `No se pudieron generar las ${kind}`);
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
    return <FullPageStatus error={sessionError} onRetry={retrySession} />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopNav user={user} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-10 sm:py-8">
        <Link href="/" className="text-sm font-medium text-teal-deep hover:underline">
          ← Mis materias
        </Link>
        {subject ? (
          <h1 className="mt-2 font-display text-3xl font-semibold">{subject.name}</h1>
        ) : (
          <Skeleton className="mt-3 h-9 w-2/3 sm:w-1/2" />
        )}
        {loadError && <ErrorNotice message={loadError} onRetry={reload} className="mt-4" />}

        <h2 className="mt-8 font-display text-xl font-semibold">Materiales</h2>
        <div className="mt-3">
          <MaterialUploader subjectId={id} onCreated={handleCreated} />
        </div>

        {materials === null ? (
          loadError ? null : (
            <div className="mt-4">
              <ListSkeleton rows={2} />
            </div>
          )
        ) : materials.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Aún no hay material"
              description="Sube un PDF, una foto de tus apuntes o pega un texto, y de ahí saldrán tus preguntas, tarjetas y el tutor."
            />
          </div>
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

        <FlashcardsPanel subjectId={id} refreshKey={cardsRefresh} />

        <ProgressPanel subjectId={id} refreshKey={cardsRefresh + questions.length} />

        {materials?.some((m) => m.status === "listo") && (
          <section id="tutor" className="scroll-mt-4">
            <h2 className="mt-10 font-display text-xl font-semibold">Tutor</h2>
            <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <p className="text-sm text-ciruela/70">
                Pregúntale lo que no entiendas. Responde con tus apuntes y te muestra de dónde sacó cada dato.
              </p>
              <Link
                href={`/subjects/${id}/tutor`}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-turquesa px-5 text-sm font-semibold text-ciruela transition-opacity hover:opacity-90 sm:w-auto"
              >
                Preguntarle al tutor
              </Link>
            </div>
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
