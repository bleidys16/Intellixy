"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDueIn } from "@/lib/relativeTime";
import type { Flashcard, FlashcardStats } from "@/lib/types";

interface Props {
  subjectId: string;
  /** Cambia cuando termina una generación de tarjetas, para volver a pedir los totales. */
  refreshKey: number;
}

/** Estado de las tarjetas de la materia y acceso al repaso de hoy. No se muestra si no hay tarjetas. */
export function FlashcardsPanel({ subjectId, refreshKey }: Props) {
  const [stats, setStats] = useState<FlashcardStats | null>(null);
  const [nextLabel, setNextLabel] = useState<string | null>(null);

  useEffect(() => {
    // limit=1: solo interesan los totales, no las tarjetas.
    apiFetch<{ cards: Flashcard[]; stats: FlashcardStats }>(`/subjects/${subjectId}/flashcards/due?limit=1`)
      .then((data) => {
        setStats(data.stats);
        setNextLabel(data.stats.nextDueAt ? formatDueIn(data.stats.nextDueAt, Date.now()) : null);
      })
      .catch(() => setStats(null));
  }, [subjectId, refreshKey]);

  if (!stats || stats.total === 0) return null;

  const max = Math.max(...stats.byBox, 1);

  return (
    <section id="tarjetas" className="scroll-mt-4">
      <h2 className="mt-10 font-display text-xl font-semibold">Tarjetas de estudio ({stats.total})</h2>
      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        {stats.due > 0 ? (
          <>
            <p className="text-sm text-ciruela/70">
              Tienes <strong className="text-ciruela">{stats.due}</strong>{" "}
              {stats.due === 1 ? "tarjeta pendiente" : "tarjetas pendientes"} para hoy.
            </p>
            <Link
              href={`/subjects/${subjectId}/flashcards`}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-turquesa px-5 text-sm font-semibold text-ciruela transition-opacity hover:opacity-90 sm:w-auto"
            >
              Estudiar tarjetas
            </Link>
          </>
        ) : (
          <p className="text-sm text-ciruela/70">
            ¡Estás al día! {nextLabel ? `La próxima tarjeta toca ${nextLabel}.` : "No hay más tarjetas por ahora."}
          </p>
        )}

        <div className="mt-5" aria-label="Tarjetas por caja">
          <p className="text-xs font-medium text-ciruela/60">Tarjetas por caja (a más alta, mejor sabidas)</p>
          <ul className="mt-2 grid grid-cols-5 items-end gap-2">
            {stats.byBox.map((n, i) => (
              <li key={i} className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium">{n}</span>
                <span
                  className="w-full rounded-t-md bg-teal-deep/70"
                  style={{ height: `${Math.max(4, (n / max) * 40)}px` }}
                  aria-hidden
                />
                <span className="text-[11px] text-ciruela/60">Caja {i + 1}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
