"use client";

import { useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { Material } from "@/lib/types";

type Mode = "file" | "text";

interface Props {
  subjectId: string;
  onCreated: (material: Material) => void;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

export function MaterialUploader({ subjectId, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>("file");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setErrors([]);
    setBusy(true);
    const failures: string[] = [];
    // De a uno: así el orden de la lista es el de la selección y un error no frena el resto.
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      try {
        const { material } = await apiFetch<{ material: Material }>(
          `/subjects/${subjectId}/materials/upload`,
          { method: "POST", body: form },
        );
        onCreated(material);
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof ApiError ? err.message : "no se pudo subir"}`);
      }
    }
    setErrors(failures);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSaveText(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setBusy(true);
    try {
      const { material } = await apiFetch<{ material: Material }>(
        `/subjects/${subjectId}/materials/text`,
        { method: "POST", body: JSON.stringify({ name: name.trim() || "Texto pegado", text }) },
      );
      onCreated(material);
      setName("");
      setText("");
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : "No se pudo guardar el texto"]);
    } finally {
      setBusy(false);
    }
  }

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setMode(value)}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        mode === value ? "bg-ciruela text-oat" : "text-ciruela/70 hover:bg-ciruela/5"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div role="tablist" aria-label="Cómo añadir material" className="flex gap-2">
        {tab("file", "Subir archivo")}
        {tab("text", "Pegar texto")}
      </div>

      {mode === "file" ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) void uploadFiles(Array.from(e.dataTransfer.files));
          }}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-turquesa bg-card-turquoise/40" : "border-ciruela/20 hover:border-turquesa"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            disabled={busy}
            onChange={(e) => void uploadFiles(Array.from(e.target.files ?? []))}
            className="sr-only"
          />
          <span className="font-medium">
            {busy ? "Subiendo..." : "Arrastra tus archivos aquí o haz clic para elegirlos"}
          </span>
          <span className="mt-1 text-sm text-ciruela/60">
            PDF o imagen (PNG, JPG, WebP). Las fotos de apuntes también sirven.
          </span>
        </label>
      ) : (
        <form onSubmit={handleSaveText} className="mt-4">
          <label className="block text-sm font-medium">
            Nombre del material (opcional)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Apuntes de clase 3"
              className="mt-1 w-full rounded-lg border border-ciruela/15 px-3 py-2 outline-none focus:border-turquesa"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Tu texto
            <textarea
              required
              minLength={50}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder="Pega aquí tus apuntes, un resumen o cualquier texto de estudio..."
              className="mt-1 w-full rounded-lg border border-ciruela/15 px-3 py-2 outline-none focus:border-turquesa"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-full bg-ciruela px-5 py-2.5 font-medium text-oat transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Guardando..." : "Guardar texto"}
          </button>
        </form>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 flex flex-col gap-1 text-sm text-wine">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
