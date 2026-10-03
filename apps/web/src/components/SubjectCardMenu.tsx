"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api";
import { DEFAULT_SUBJECT_COLOR } from "@/lib/subjectColors";
import { Modal } from "@/components/Modal";
import { SubjectColorPicker } from "@/components/SubjectColorPicker";
import { ErrorNotice } from "@/components/ErrorNotice";
import type { Subject } from "@/lib/types";

interface Props {
  subject: Subject;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdated: (subject: Subject) => void;
  onDeleted: (subjectId: string) => void;
}

/**
 * Menú "⋮" de la tarjeta de materia: editar (nombre y color) y eliminar siempre; subir/bajar
 * solo se ven en pantallas chicas (`sm:hidden`) — en escritorio se reordena arrastrando la
 * tarjeta, ver el `draggable` en `SubjectCard`.
 */
export function SubjectCardMenu({ subject, isFirst, isLast, onMoveUp, onMoveDown, onUpdated, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "edit" | "delete">("menu");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    setView("menu");
  }

  return (
    <div ref={rootRef} className="absolute right-2.5 top-2.5" draggable={false} onClick={(e) => e.preventDefault()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Opciones de ${subject.name}`}
        className="flex h-6 w-6 items-center justify-center rounded-full text-ciruela/60 transition-colors hover:bg-white/60 hover:text-ciruela"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>

      {open && view === "menu" && (
        <div role="menu" className="absolute right-0 top-9 z-20 w-48 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-ciruela/10">
          <button
            type="button"
            role="menuitem"
            disabled={isFirst}
            onClick={() => {
              onMoveUp();
              close();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-ciruela/5 disabled:cursor-not-allowed disabled:opacity-40 sm:hidden"
          >
            Subir
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isLast}
            onClick={() => {
              onMoveDown();
              close();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-ciruela/5 disabled:cursor-not-allowed disabled:opacity-40 sm:hidden"
          >
            Bajar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setView("edit")}
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-ciruela/5"
          >
            Renombrar / color
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setView("delete")}
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-wine hover:bg-wine/5"
          >
            Eliminar
          </button>
        </div>
      )}

      {open && view === "edit" && (
        <EditSubjectModal
          subject={subject}
          onClose={close}
          onUpdated={(s) => {
            onUpdated(s);
            close();
          }}
        />
      )}
      {open && view === "delete" && (
        <DeleteSubjectModal
          subject={subject}
          onClose={close}
          onDeleted={(id) => {
            onDeleted(id);
            close();
          }}
        />
      )}
    </div>
  );
}

function EditSubjectModal({
  subject,
  onClose,
  onUpdated,
}: {
  subject: Subject;
  onClose: () => void;
  onUpdated: (subject: Subject) => void;
}) {
  const [name, setName] = useState(subject.name);
  const [color, setColor] = useState(subject.color ?? DEFAULT_SUBJECT_COLOR.hex);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { subject: updated } = await apiFetch<{ subject: Subject }>(`/subjects/${subject.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), color }),
      });
      onUpdated(updated);
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar"));
      setSaving(false);
    }
  }

  return (
    <Modal title="Editar materia" onClose={onClose}>
      <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-4">
        <label className="text-sm font-medium">
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded-lg border border-ciruela/15 px-3 py-2 outline-none focus:border-turquesa"
          />
        </label>
        <SubjectColorPicker value={color} onChange={setColor} />
        {error && <ErrorNotice message={error} />}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium hover:bg-ciruela/5">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-full bg-ciruela px-4 py-2 text-sm font-medium text-oat disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteSubjectModal({
  subject,
  onClose,
  onDeleted,
}: {
  subject: Subject;
  onClose: () => void;
  onDeleted: (subjectId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/subjects/${subject.id}`, { method: "DELETE" });
      onDeleted(subject.id);
    } catch (err) {
      setError(errorMessage(err, "No se pudo borrar"));
      setBusy(false);
    }
  }

  return (
    <Modal title={`¿Borrar "${subject.name}"?`} onClose={onClose}>
      <p className="text-sm text-ciruela/70">
        Se borrarán también sus materiales, preguntas, tarjetas, historial de quizzes y conversaciones con el tutor.
        Esto no se puede deshacer.
      </p>
      {error && <ErrorNotice message={error} className="mt-3" />}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="rounded-full px-4 py-2 text-sm font-medium hover:bg-ciruela/5">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={busy}
          className="rounded-full bg-wine px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Borrando..." : "Sí, borrar"}
        </button>
      </div>
    </Modal>
  );
}
