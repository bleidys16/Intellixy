"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProgressBar } from "@/components/ProgressBar";
import { Sparkle } from "@/components/Sparkle";
import { TopNav } from "@/components/TopNav";
import { apiFetch } from "@/lib/api";
import { formatAgo } from "@/lib/relativeTime";
import { DEFAULT_SUBJECT_COLOR, SUBJECT_COLORS, subjectCardClass } from "@/lib/subjectColors";
import { useSession } from "@/lib/useSession";
import type { Subject } from "@/lib/types";

export default function HomePage() {
  const { user, loading } = useSession();
  const router = useRouter();
  // null = todavía cargando; distingue "cargando" de "no tienes materias".
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  // Hora en que llegó el listado, para "hace 2 días" sin leer el reloj durante el render.
  const [now, setNow] = useState(0);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_SUBJECT_COLOR.hex);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      apiFetch<{ subjects: Subject[] }>("/subjects")
        .then((data) => {
          setSubjects(data.subjects);
          setNow(Date.now());
        })
        .catch(() => setSubjects([]));
    }
  }, [user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { subject } = await apiFetch<{ subject: Subject }>("/subjects", {
        method: "POST",
        body: JSON.stringify({ name, color }),
      });
      setSubjects((prev) => [subject, ...(prev ?? [])]);
      setName("");
    } finally {
      setCreating(false);
    }
  }

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-ciruela/50">Cargando...</div>;
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

        <form
          onSubmit={handleCreate}
          className="mt-6 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-end"
        >
          <label className="flex-1 text-sm font-medium">
            Nueva materia
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Biología celular"
              className="mt-1 w-full rounded-lg border border-ciruela/15 px-3 py-2 outline-none focus:border-turquesa"
            />
          </label>
          <div className="flex items-center gap-1" role="group" aria-label="Color de la materia">
            {SUBJECT_COLORS.map((c) => (
              <button
                type="button"
                key={c.hex}
                onClick={() => setColor(c.hex)}
                aria-label={c.name}
                aria-pressed={color === c.hex}
                className="flex h-11 w-11 items-center justify-center rounded-full"
              >
                <span
                  className={`block h-8 w-8 rounded-full border border-ciruela/15 ${
                    color === c.hex ? "outline-2 outline-offset-2 outline-ciruela" : ""
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-full bg-ciruela px-5 py-2.5 font-medium text-oat transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creando..." : "Crear materia"}
          </button>
        </form>

        {subjects === null ? (
          <p className="mt-10 text-center text-ciruela/50">Cargando tus materias...</p>
        ) : subjects.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-ciruela/20 px-6 py-10 text-center">
            <p className="font-display text-xl font-semibold">Aquí vivirán tus materias</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ciruela/60">
              Crea la primera arriba, sube tus apuntes y te preparamos quizzes, tarjetas y un tutor que responde con tu
              propio material.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {subjects.map((subject) => (
              <SubjectCard key={subject.id} subject={subject} now={now} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SubjectCard({ subject, now }: { subject: Subject; now: number }) {
  const summary = subject.summary;
  const mastery = summary?.mastery ?? null;
  const percent = mastery !== null ? Math.round(mastery * 100) : null;
  const materials = summary?.materialCount ?? 0;
  const due = summary?.dueCards ?? 0;

  return (
    <Link
      href={`/subjects/${subject.id}`}
      className={`flex min-h-44 flex-col rounded-2xl p-5 transition-transform hover:-translate-y-0.5 ${subjectCardClass(subject.color)}`}
    >
      <p className="font-display text-lg font-semibold">{subject.name}</p>
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
