"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { ProgressBar } from "@/components/ProgressBar";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDueIn } from "@/lib/relativeTime";
import { useSession } from "@/lib/useSession";
import type { Flashcard, FlashcardStats, ReviewResult } from "@/lib/types";

const BATCH_SIZE = 20;

const RESULT_BUTTONS: Array<{ result: ReviewResult; label: string; hint: string; className: string }> = [
  {
    result: "no_sabia",
    label: "No lo sabía",
    hint: "Vuelve a la caja 1",
    className: "border-wine bg-wine/10 text-wine hover:bg-wine/20",
  },
  {
    result: "dude",
    label: "Dudé",
    hint: "Se repite mañana",
    className: "border-yuzu bg-yuzu/50 text-ciruela hover:bg-yuzu/80",
  },
  {
    result: "sabia",
    label: "Lo sabía",
    hint: "Sube de caja",
    className: "border-teal-deep bg-teal-deep/10 text-teal-deep hover:bg-teal-deep/20",
  },
];

type Tally = Record<ReviewResult, number>;

export default function FlashcardsStudyPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useSession();
  const router = useRouter();

  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [stats, setStats] = useState<FlashcardStats | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState<Tally>({ sabia: 0, dude: 0, no_sabia: 0 });
  const [nextLabel, setNextLabel] = useState<string | null>(null);

  const knewRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  // Aplica una tanda de tarjetas pendientes y reinicia el repaso.
  const applyDue = useCallback((data: { cards: Flashcard[]; stats: FlashcardStats }) => {
    setCards(data.cards);
    setStats(data.stats);
    setNextLabel(data.stats.nextDueAt ? formatDueIn(data.stats.nextDueAt, Date.now()) : null);
    setIndex(0);
    setRevealed(false);
    setTally({ sabia: 0, dude: 0, no_sabia: 0 });
  }, []);

  const dueUrl = `/subjects/${id}/flashcards/due?limit=${BATCH_SIZE}`;

  useEffect(() => {
    if (!user) return;
    // Si el efecto se vuelve a ejecutar (React lo hace dos veces en desarrollo), la respuesta de la carga
    // anterior se ignora: si llegara tarde, reiniciaría el repaso en plena tarjeta.
    let cancelled = false;
    apiFetch<{ cards: Flashcard[]; stats: FlashcardStats }>(dueUrl)
      .then((data) => {
        if (!cancelled) applyDue(data);
      })
      .catch(() => {
        if (!cancelled) router.push(`/subjects/${id}`);
      });
    return () => {
      cancelled = true;
    };
  }, [user, id, dueUrl, applyDue, router]);

  // Al mostrar la respuesta el foco pasa a los botones de resultado.
  useEffect(() => {
    if (revealed) knewRef.current?.focus();
  }, [revealed]);

  async function review(card: Flashcard, result: ReviewResult, clickedAtMs: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ card: Flashcard; stats: FlashcardStats }>(
        `/subjects/${id}/flashcards/${card.id}/review`,
        { method: "POST", body: JSON.stringify({ result }) },
      );
      setStats(res.stats);
      setNextLabel(res.stats.nextDueAt ? formatDueIn(res.stats.nextDueAt, clickedAtMs) : null);
      setTally((t) => ({ ...t, [result]: t[result] + 1 }));
      setIndex((i) => i + 1);
      setRevealed(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Ya estaba repasada (p. ej. desde otra pestaña): se pasa a la siguiente.
        setIndex((i) => i + 1);
        setRevealed(false);
      } else {
        setError(err instanceof ApiError ? err.message : "No se pudo guardar el repaso. Inténtalo de nuevo");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user || !cards) {
    return <div className="flex flex-1 items-center justify-center text-ciruela/50">Cargando...</div>;
  }

  const back = (
    <Link href={`/subjects/${id}`} className="text-sm font-medium text-teal-deep hover:underline">
      ← Volver a la materia
    </Link>
  );
  const shell = (children: React.ReactNode) => (
    <div className="flex flex-1 flex-col">
      <TopNav user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-10 sm:py-8">{children}</main>
    </div>
  );

  // Sin pendientes al entrar
  if (cards.length === 0) {
    return shell(
      <>
        {back}
        <section className="mt-4 rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="font-display text-xl font-semibold">¡Estás al día!</p>
          <p className="mt-2 text-sm text-ciruela/70">
            {nextLabel ? `La próxima tarjeta toca ${nextLabel}.` : "Todavía no tienes tarjetas. Genéralas desde un material."}
          </p>
        </section>
      </>,
    );
  }

  // Terminó la tanda
  if (index >= cards.length) {
    const reviewed = tally.sabia + tally.dude + tally.no_sabia;
    const more = stats?.due ?? 0;
    return shell(
      <>
        {back}
        <section className="mt-4 rounded-2xl bg-white p-5 text-center shadow-sm sm:p-8">
          <p className="font-display text-xl font-semibold">¡Repaso listo!</p>
          <p className="mt-2 text-sm text-ciruela/70">
            Repasaste {reviewed} {reviewed === 1 ? "tarjeta" : "tarjetas"}.
          </p>
          <ul className="mt-5 grid grid-cols-3 gap-2 text-sm">
            <li className="rounded-xl bg-teal-deep/10 px-2 py-3 text-teal-deep">
              <span className="block font-display text-2xl font-semibold">{tally.sabia}</span>
              Las sabía
            </li>
            <li className="rounded-xl bg-yuzu/50 px-2 py-3">
              <span className="block font-display text-2xl font-semibold">{tally.dude}</span>
              Dudé
            </li>
            <li className="rounded-xl bg-wine/10 px-2 py-3 text-wine">
              <span className="block font-display text-2xl font-semibold">{tally.no_sabia}</span>
              No sabía
            </li>
          </ul>
          <p className="mt-5 text-sm text-ciruela/70">
            {more > 0
              ? `Aún tienes ${more} ${more === 1 ? "tarjeta pendiente" : "tarjetas pendientes"} hoy.`
              : nextLabel
                ? `No queda nada por hoy. La próxima tarjeta toca ${nextLabel}.`
                : "No queda nada por hoy."}
          </p>
          {more > 0 && (
            <button
              type="button"
              onClick={() =>
                void apiFetch<{ cards: Flashcard[]; stats: FlashcardStats }>(dueUrl).then(applyDue).catch(() => {})
              }
              className="mt-4 min-h-11 w-full rounded-full bg-turquesa px-5 text-sm font-semibold text-ciruela transition-opacity hover:opacity-90 sm:w-auto"
            >
              Seguir con las siguientes
            </button>
          )}
        </section>
      </>,
    );
  }

  const card = cards[index];
  const sourceText =
    card.source.materialType === "pdf"
      ? `${card.source.materialName}, p. ${card.source.page}`
      : card.source.materialName;

  return shell(
    <>
      <div className="flex items-center justify-between gap-3">
        <Link href={`/subjects/${id}`} className="text-sm font-medium text-teal-deep hover:underline">
          ← Salir
        </Link>
        <span className="text-sm text-ciruela/60">
          Tarjeta {index + 1} de {cards.length}
        </span>
      </div>
      <ProgressBar value={index} max={cards.length} label="Progreso del repaso" className="mt-3" />

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-card-lime px-2.5 py-0.5 text-xs font-medium">{card.topic.name}</span>
          <span className="text-xs text-ciruela/50">Caja {card.box} de 5</span>
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold leading-snug">{card.front}</h1>

        {!revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-8 min-h-12 w-full rounded-full bg-ciruela px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Mostrar respuesta
          </button>
        ) : (
          <div className="mt-6">
            <div role="status" className="rounded-xl bg-oat p-4">
              <p className="text-lg leading-snug">{card.back}</p>
              <p className="mt-3 border-l-2 border-turquesa pl-3 text-xs italic text-ciruela/70">
                “{card.source.quote}”
                <span className="mt-1 block font-medium not-italic">Fuente: {sourceText}</span>
              </p>
            </div>

            <p className="mt-5 text-sm font-medium">¿Qué tal te fue?</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {RESULT_BUTTONS.map((b) => (
                <button
                  key={b.result}
                  ref={b.result === "sabia" ? knewRef : undefined}
                  type="button"
                  disabled={busy}
                  onClick={(e) => void review(card, b.result, performance.timeOrigin + e.timeStamp)}
                  className={`flex min-h-14 flex-col items-center justify-center rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${b.className}`}
                >
                  {b.label}
                  <span className="text-[11px] font-normal opacity-70">{b.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-wine/10 px-4 py-3 text-sm text-wine">
          {error}
        </p>
      )}
    </>,
  );
}
