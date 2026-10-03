"use client";

import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api";
import { Modal } from "@/components/Modal";
import { SubjectColorPicker } from "@/components/SubjectColorPicker";
import { ErrorNotice } from "@/components/ErrorNotice";
import { DEFAULT_SUBJECT_COLOR } from "@/lib/subjectColors";
import type { Subject } from "@/lib/types";

/**
 * Tarjeta "+" del inicio: antes había un formulario siempre visible arriba de las materias
 * (ocupaba bastante en móvil antes de llegar a verlas); ahora crear es una acción aparte, en
 * un modal, igual que editar.
 */
export function CreateSubjectTile({ onCreated }: { onCreated: (subject: Subject) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_SUBJECT_COLOR.hex);
  const [examDate, setExamDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setName("");
    setColor(DEFAULT_SUBJECT_COLOR.hex);
    setExamDate("");
    setError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { subject } = await apiFetch<{ subject: Subject }>("/subjects", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), color, examDate: examDate || undefined }),
      });
      onCreated(subject);
      close();
    } catch (err) {
      setError(errorMessage(err, "No se pudo crear la materia. Inténtalo de nuevo."));
      setCreating(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ciruela/20 text-ciruela/60 transition-colors hover:border-turquesa hover:text-ciruela"
      >
        <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-ciruela/5 text-2xl leading-none">
          +
        </span>
        <span className="text-sm font-medium">Nueva materia</span>
      </button>

      {open && (
        <Modal title="Nueva materia" onClose={close}>
          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-4">
            <label className="text-sm font-medium">
              Nombre
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="ej. Biología celular"
                className="mt-1 w-full rounded-lg border border-ciruela/15 px-3 py-2 outline-none focus:border-turquesa"
              />
            </label>
            <SubjectColorPicker value={color} onChange={setColor} />
            <label className="text-sm font-medium">
              Fecha de examen (opcional)
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ciruela/15 px-3 py-2 outline-none focus:border-turquesa"
              />
            </label>
            {error && <ErrorNotice message={error} />}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="rounded-full px-4 py-2 text-sm font-medium hover:bg-ciruela/5">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating || !name.trim()}
                className="rounded-full bg-ciruela px-4 py-2 text-sm font-medium text-oat disabled:opacity-50"
              >
                {creating ? "Creando..." : "Crear materia"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
