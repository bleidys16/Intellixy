"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ProgressBar } from "@/components/ProgressBar";
import { Sparkle } from "@/components/Sparkle";
import { CreateSubjectTile } from "@/components/CreateSubjectTile";
import { SubjectCardMenu } from "@/components/SubjectCardMenu";
import { TopNav } from "@/components/TopNav";
import { apiFetch, errorMessage } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { SubjectCardSkeleton } from "@/components/Skeleton";
import { formatAgo } from "@/lib/relativeTime";
import { subjectCardClass } from "@/lib/subjectColors";
import { FullPageStatus } from "@/components/FullPageStatus";
import { useSession } from "@/lib/useSession";
import type { Subject } from "@/lib/types";

export default function HomePage() {
  const { user, loading, error: sessionError, retry: retrySession } = useSession();
  const router = useRouter();
  // null = todavía cargando; distingue "cargando" de "no tienes materias".
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  // Hora en que llegó el listado, para "hace 2 días" sin leer el reloj durante el render.
  const [now, setNow] = useState(0);
  // Fallo al cargar las materias; `reloadKey` vuelve a pedirlas.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch<{ subjects: Subject[] }>("/subjects")
      .then((data) => {
        if (cancelled) return;
        setSubjects(data.subjects);
        setNow(Date.now());
      })
      // Un fallo NO es "no tienes materias": se avisa y se deja reintentar.
      .catch((err) => !cancelled && setLoadError(errorMessage(err, "No pudimos cargar tus materias")));
    return () => {
      cancelled = true;
    };
  }, [user, reloadKey]);

  function reload() {
    setLoadError(null);
    setReloadKey((n) => n + 1);
  }

  function handleSubjectCreated(subject: Subject) {
    setSubjects((prev) => [subject, ...(prev ?? [])]);
  }

  function handleSubjectUpdated(updated: Subject) {
    setSubjects((prev) => prev?.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)) ?? prev);
  }

  function handleSubjectDeleted(subjectId: string) {
    setSubjects((prev) => prev?.filter((s) => s.id !== subjectId) ?? prev);
  }

  /** Guarda el orden en el servidor; si falla, vuelve a pedir la lista para no quedar desincronizado. */
  async function persistOrder(list: Subject[]) {
    try {
      await apiFetch("/subjects/reorder", {
        method: "POST",
        body: JSON.stringify({ orderedIds: list.map((s) => s.id) }),
      });
    } catch {
      reload();
    }
  }

  function moveBy(subjectId: string, delta: number) {
    setSubjects((prev) => {
      if (!prev) return prev;
      const index = prev.findIndex((s) => s.id === subjectId);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      void persistOrder(next);
      return next;
    });
  }

  // Arrastrar y soltar (solo mouse, así que en la práctica es cosa de escritorio): el id que se
  // está arrastrando vive en un ref porque cambia muchas veces por segundo durante el gesto y no
  // necesita volver a renderizar nada hasta soltar.
  const draggedId = useRef<string | null>(null);

  function handleDragOver(overId: string) {
    if (!draggedId.current || draggedId.current === overId) return;
    const fromId = draggedId.current;
    setSubjects((prev) => {
      if (!prev) return prev;
      const from = prev.findIndex((s) => s.id === fromId);
      const to = prev.findIndex((s) => s.id === overId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function handleDragEnd() {
    draggedId.current = null;
    if (subjects) void persistOrder(subjects);
  }

  if (loading || !user) {
    return <FullPageStatus error={sessionError} onRetry={retrySession} />;
  }

  // Aviso de hoy: total de tarjetas pendientes y la materia que más tiene, a donde lleva el botón.
  const withDue = (subjects ?? []).filter((s) => (s.summary?.dueCards ?? 0) > 0);
  const totalDue = withDue.reduce((sum, s) => sum + (s.summary?.dueCards ?? 0), 0);
  const topDue = withDue.reduce<Subject | null>(
    (top, s) => (!top || (s.summary?.dueCards ?? 0) > (top.summary?.dueCards ?? 0) ? s : top),
    null,
  );

  return (
    <div className="flex flex-1 flex-col">
      <TopNav user={user} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8 sm:px-10">
        <h1 className="font-display text-3xl font-semibold">Hola, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-ciruela/60">Estas son tus materias.</p>

        {topDue && (
          <Link
            href={`/subjects/${topDue.id}/flashcards`}
            className="mt-6 flex flex-col gap-3 rounded-2xl border border-l-[6px] border-turquesa/50 border-l-turquesa bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              <span className="block font-display text-lg font-semibold">
                Hoy toca repasar {totalDue} {totalDue === 1 ? "tarjeta" : "tarjetas"}
              </span>
              <span className="block text-sm text-ciruela/70">
                {withDue.length === 1 ? `en ${topDue.name}` : `en ${withDue.length} materias · empieza por ${topDue.name}`}
              </span>
            </span>
            <span className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-ciruela px-5 text-sm font-semibold text-oat">
              Repasar ahora
            </span>
          </Link>
        )}

        {loadError ? (
          <ErrorNotice message={loadError} onRetry={reload} className="mt-8" />
        ) : subjects === null ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3" aria-busy="true" aria-label="Cargando tus materias">
            {[0, 1, 2].map((i) => (
              <SubjectCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            {subjects.length === 0 && (
              <div className="mt-10">
                <EmptyState
                  title="Aquí vivirán tus materias"
                  description="Crea la primera abajo, sube tus apuntes y te preparamos quizzes, tarjetas y un tutor que responde con tu propio material."
                />
              </div>
            )}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <CreateSubjectTile onCreated={handleSubjectCreated} />
              {subjects.map((subject, index) => (
                <SubjectCard
                  key={subject.id}
                  subject={subject}
                  now={now}
                  isFirst={index === 0}
                  isLast={index === subjects.length - 1}
                  onMoveUp={() => moveBy(subject.id, -1)}
                  onMoveDown={() => moveBy(subject.id, 1)}
                  onUpdated={handleSubjectUpdated}
                  onDeleted={handleSubjectDeleted}
                  onDragStartCard={() => {
                    draggedId.current = subject.id;
                  }}
                  onDragOverCard={() => handleDragOver(subject.id)}
                  onDragEndCard={handleDragEnd}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

interface SubjectCardProps {
  subject: Subject;
  now: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdated: (subject: Subject) => void;
  onDeleted: (subjectId: string) => void;
  onDragStartCard: () => void;
  onDragOverCard: () => void;
  onDragEndCard: () => void;
}

function SubjectCard({
  subject,
  now,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onUpdated,
  onDeleted,
  onDragStartCard,
  onDragOverCard,
  onDragEndCard,
}: SubjectCardProps) {
  const summary = subject.summary;
  const mastery = summary?.mastery ?? null;
  const percent = mastery !== null ? Math.round(mastery * 100) : null;
  const materials = summary?.materialCount ?? 0;
  const due = summary?.dueCards ?? 0;

  return (
    <Link
      href={`/subjects/${subject.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", subject.id);
        onDragStartCard();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverCard();
      }}
      onDrop={(e) => e.preventDefault()}
      onDragEnd={onDragEndCard}
      className={`relative flex min-h-44 flex-col rounded-2xl p-5 transition-transform hover:-translate-y-0.5 ${subjectCardClass(subject.color)}`}
    >
      <SubjectCardMenu
        subject={subject}
        isFirst={isFirst}
        isLast={isLast}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
      />
      <p className="pr-6 font-display text-lg font-semibold">{subject.name}</p>
      <p className="mt-1 text-sm text-ciruela/60">
        {materials === 0 ? "Sin materiales todavía" : `${materials} ${materials === 1 ? "material" : "materiales"}`}
      </p>

      <div className="mt-auto pt-5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-ciruela/70">Dominio</span>
          <span className="flex items-center gap-1.5 font-display font-semibold">
            {summary?.status === "dominado" && <Sparkle className="h-4 w-4" />}
            {percent !== null ? `${percent}%` : "Sin medir"}
          </span>
        </div>
        <ProgressBar value={percent} label={`Dominio de ${subject.name}`} tone="card" className="mt-1.5" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ciruela/60">
          <span>
            {summary?.lastStudiedAt ? `Último repaso: ${formatAgo(summary.lastStudiedAt, now)}` : "Aún no has estudiado"}
          </span>
          {due > 0 && (
            <span className="rounded-full bg-ciruela px-2.5 py-0.5 font-medium text-oat">
              {due} {due === 1 ? "pendiente" : "pendientes"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
