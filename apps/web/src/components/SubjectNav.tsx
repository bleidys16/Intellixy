"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export type SubjectTabId = "materiales" | "practicar" | "tarjetas" | "progreso" | "tutor";

const TABS: { id: SubjectTabId; label: string; icon: ReactNode }[] = [
  {
    id: "materiales",
    label: "Materiales",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M14 3v5h5" />
      </svg>
    ),
  },
  {
    id: "practicar",
    label: "Practicar",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    id: "tarjetas",
    label: "Tarjetas",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5" y="7" width="14" height="11" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2" />
      </svg>
    ),
  },
  {
    id: "progreso",
    label: "Progreso",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 20V12M10 20V4M16 20v-6M4 20h16" />
      </svg>
    ),
  },
  {
    id: "tutor",
    label: "Tutor",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      </svg>
    ),
  },
];

interface Props {
  active: SubjectTabId;
  onSelect: (tab: SubjectTabId) => void;
}

/**
 * Navegación de la materia: barra vertical flotante en escritorio, botón flotante
 * expandible ("speed dial") en móvil. Todo cambia de pestaña en la misma página.
 */
export function SubjectNav({ active, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function select(tab: SubjectTabId) {
    onSelect(tab);
    setOpen(false);
  }

  return (
    <>
      {/* Escritorio: barra vertical flotante */}
      <nav
        role="tablist"
        aria-label="Secciones de la materia"
        className="fixed left-3 top-1/2 z-10 hidden max-h-[calc(100vh-2rem)] -translate-y-1/2 flex-col gap-1 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-ciruela/10 lg:flex"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => select(t.id)}
            className={`flex w-16 flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[11px] font-medium transition-colors ${
              active === t.id ? "bg-ciruela text-oat shadow-sm" : "text-ciruela/60 hover:bg-ciruela/5"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {/* Móvil: botón flotante que se expande hacia arriba */}
      <div ref={rootRef} className="lg:hidden">
        {open && (
          <div
            className="fixed inset-0 z-10 bg-ciruela/10 backdrop-blur-[1px] transition-opacity"
            onClick={() => setOpen(false)}
            aria-hidden
          />
        )}
        <div
          role="menu"
          aria-label="Secciones de la materia"
          className="fixed bottom-5 right-4 z-20 flex flex-col items-end gap-3"
        >
          {open &&
            TABS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                onClick={() => select(t.id)}
                aria-current={active === t.id ? "page" : undefined}
                className="group flex items-center gap-3 opacity-0 text-left focus:outline-none"
                style={{ animation: `subject-fab-in 160ms ease-out ${i * 35}ms forwards` }}
              >
                <span className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-ciruela shadow-md transition-colors group-hover:bg-oat">
                  {t.label}
                </span>
                <span
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-full shadow-lg transition-colors ${
                    active === t.id ? "bg-ciruela text-oat" : "bg-white text-ciruela group-hover:bg-oat"
                  }`}
                >
                  {t.icon}
                </span>
              </button>
            ))}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Cerrar menú de la materia" : "Abrir menú de la materia"}
            aria-expanded={open}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ciruela text-oat shadow-xl transition-transform"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className={`transition-transform duration-200 ${open ? "rotate-45" : ""}`}
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes subject-fab-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
