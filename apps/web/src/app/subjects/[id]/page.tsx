"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackLink } from "@/components/BackLink";
import { MaterialCard } from "@/components/MaterialCard";
import { MaterialUploader } from "@/components/MaterialUploader";
import { CircularProgressLoader } from "@/components/CircularProgressLoader";
import { FlashcardsPanel } from "@/components/FlashcardsPanel";
import { ProgressPanel } from "@/components/ProgressPanel";
import { QuestionGroups } from "@/components/QuestionGroups";
import { QuizHistory } from "@/components/QuizHistory";
import { QuizLauncher } from "@/components/QuizLauncher";
import { SubjectNav } from "@/components/SubjectNav";
import type { SubjectTabId } from "@/components/SubjectNav";
import { TopNav } from "@/components/TopNav";
import { TutorChat } from "@/components/TutorChat";
import { apiFetch, ApiError, errorMessage, isNotFound } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ListSkeleton, Skeleton } from "@/components/Skeleton";
import { FullPageStatus } from "@/components/FullPageStatus";
import { useSession } from "@/lib/useSession";
import type { GenerationJob, GenerationKind, Material, Question, Subject } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;

const TAB_IDS: SubjectTabId[] = ["materiales", "practicar", "tarjetas", "progreso", "tutor"];

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
  // Distingue el aviso "generando..." (lleva spinner) del aviso de resultado final.
  const [noticeLoading, setNoticeLoading] = useState(false);
  // Pestaña a la que lleva el botón del aviso de resultado ("Ir a practicar" / "Ir a tarjetas"); null mientras genera.
  const [noticeTab, setNoticeTab] = useState<SubjectTabId | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fallo al cargar la materia (red, servidor): se muestra con "Reintentar". `reloadKey` vuelve a lanzar la carga.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState<SubjectTabId>("materiales");

  // Si se llega con #practicar (p. ej. al volver de un quiz), se abre esa pestaña.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!TAB_IDS.includes(hash as SubjectTabId)) return;
    const timer = setTimeout(() => setActiveTab(hash as SubjectTabId), 0);
    return () => clearTimeout(timer);
  }, []);

  function selectTab(tab: SubjectTabId) {
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
  }

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
          setNoticeLoading(false);
          setNoticeTab(null);
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
        setNoticeLoading(false);
        setNoticeTab(job.kind === "tarjetas" ? "tarjetas" : "practicar");
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
    setNoticeTab(null);
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
      setNoticeLoading(true);
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
      <SubjectNav active={activeTab} onSelect={selectTab} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-28 sm:px-10 sm:py-8 lg:pb-8">
        <BackLink href="/">Mis materias</BackLink>
        {subject ? (
          <h1 className="mt-2 font-display text-3xl font-semibold">{subject.name}</h1>
        ) : (
          <Skeleton className="mt-3 h-9 w-2/3 sm:w-1/2" />
        )}
        {loadError && <ErrorNotice message={loadError} onRetry={reload} className="mt-4" />}

        {(notice || error) && (
          <div className="mt-4">
            {notice && (
              <div role="status" className="rounded-xl bg-yuzu/50 px-4 py-3 text-sm">
                <p className="flex items-center gap-2">
                  {noticeLoading && <CircularProgressLoader className="h-4 w-4" />}
                  <span>{notice}</span>
                </p>
                {noticeTab && (
                  <button
                    type="button"
                    onClick={() => selectTab(noticeTab)}
                    className="mt-2 rounded-full bg-ciruela px-3.5 py-1.5 text-sm font-medium text-oat transition-opacity hover:opacity-90"
                  >
                    {noticeTab === "tarjetas" ? "Ir a tarjetas" : "Ir a practicar"}
                  </button>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="mt-2 rounded-xl bg-wine/10 px-4 py-3 text-sm text-wine">
                {error}
              </p>
            )}
          </div>
        )}

        <div id="panel-materiales" role="tabpanel" aria-labelledby="tab-materiales" hidden={activeTab !== "materiales"} className="mt-5">
          <MaterialUploader subjectId={id} onCreated={handleCreated} />

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
        </div>

        <div id="panel-practicar" role="tabpanel" aria-labelledby="tab-practicar" hidden={activeTab !== "practicar"} className="mt-5">
          {questions.length === 0 ? (
            <EmptyState
              title="Aún no hay preguntas"
              description="Ve a Materiales y genera preguntas de un material listo para poder practicar."
            />
          ) : (
            <>
              <QuizLauncher subjectId={id} questions={questions} />
              <QuizHistory subjectId={id} />
              <h2 className="mt-10 font-display text-xl font-semibold">Preguntas generadas ({questions.length})</h2>
              <QuestionGroups questions={questions} />
            </>
          )}
        </div>

        <div id="panel-tarjetas" role="tabpanel" aria-labelledby="tab-tarjetas" hidden={activeTab !== "tarjetas"} className="mt-5">
          <FlashcardsPanel
            subjectId={id}
            refreshKey={cardsRefresh}
            emptyFallback={
              <EmptyState
                title="Aún no hay tarjetas"
                description="Ve a Materiales y genera tarjetas de un material listo para empezar a repasar."
              />
            }
          />
        </div>

        <div id="panel-progreso" role="tabpanel" aria-labelledby="tab-progreso" hidden={activeTab !== "progreso"} className="mt-5">
          <ProgressPanel
            subjectId={id}
            refreshKey={cardsRefresh + questions.length}
            emptyFallback={
              <EmptyState
                title="Todavía no hay progreso que mostrar"
                description="Responde preguntas o repasa tarjetas y aquí verás tu dominio por tema."
              />
            }
          />
        </div>

        <div id="panel-tutor" role="tabpanel" aria-labelledby="tab-tutor" hidden={activeTab !== "tutor"} className="mt-5">
          {materials === null ? (
            loadError ? null : (
              <div className="mt-4">
                <ListSkeleton rows={2} />
              </div>
            )
          ) : materials.some((m) => m.status === "listo") ? (
            <TutorChat subjectId={id} />
          ) : (
            <EmptyState
              title="El tutor todavía no está listo"
              description="Sube un material y espera a que termine de procesarse para poder preguntarle."
            />
          )}
        </div>
      </main>
    </div>
  );
}
