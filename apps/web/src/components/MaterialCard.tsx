"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { MaterialStatusChip } from "@/components/StatusChip";
import type { GenerationJob, GenerationKind, Material, MaterialChunk } from "@/lib/types";

interface Props {
  material: Material;
  subjectId: string;
  /** Generación de preguntas en curso (en cola o procesando) para ESTE material, si la hay. */
  generation: GenerationJob | null;
  onGenerate: (material: Material, kind: GenerationKind) => void;
  onRetry: (material: Material) => Promise<void>;
  onDelete: (material: Material) => Promise<void>;
}

const TYPE_LABEL: Record<Material["type"], string> = {
  pdf: "PDF",
  image: "Imagen",
  text: "Texto",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TypeIcon({ type }: { type: Material["type"] }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (type === "image") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="m21 16-5-5-8 8" />
      </svg>
    );
  }
  if (type === "text") {
    return (
      <svg {...common}>
        <path d="M5 6h14M5 12h14M5 18h9" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function MaterialCard({
  material,
  subjectId,
  generation,
  onGenerate,
  onRetry,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [chunks, setChunks] = useState<MaterialChunk[] | null>(null);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const inProgress = material.status === "pendiente" || material.status === "procesando";
  const generating = generation !== null;

  async function toggleText() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setChunksLoading(true);
    setActionError(null);
    try {
      const data = await apiFetch<{ chunks: MaterialChunk[] }>(
        `/subjects/${subjectId}/materials/${material.id}`,
      );
      setChunks(data.chunks);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo cargar el texto");
      setOpen(false);
    } finally {
      setChunksLoading(false);
    }
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const secondaryButton =
    "rounded-full border border-ciruela/20 px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-ciruela/5 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-ciruela/60">
          <TypeIcon type={material.type} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="truncate font-medium">{material.name}</p>
            <MaterialStatusChip status={material.status} />
          </div>

          <p className="mt-0.5 text-xs text-ciruela/55">
            {TYPE_LABEL[material.type]}
            {material.sizeBytes > 0 && ` · ${formatBytes(material.sizeBytes)}`}
            {material.pageCount ? ` · ${material.pageCount} ${material.pageCount === 1 ? "página" : "páginas"}` : ""}
            {` · ${new Date(material.createdAt).toLocaleDateString("es", { day: "numeric", month: "short" })}`}
          </p>

          {material.status === "error" && material.errorMessage && (
            <p className="mt-2 text-sm text-wine">{material.errorMessage}</p>
          )}
          {inProgress && (
            <p className="mt-2 text-sm text-ciruela/60">
              Estamos leyendo tu archivo. Puedes seguir usando la app; esto se actualiza solo.
            </p>
          )}
          {generation && (
            <p role="status" className="mt-2 flex items-center gap-2 text-sm text-ciruela/60">
              <span
                aria-hidden
                className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-ciruela/30 border-t-ciruela"
              />
              <span>
                {generation.status === "pendiente"
                  ? `Tus ${generation.kind} están en cola.`
                  : `Generando ${generation.kind}.`}{" "}
                Puedes seguir usando la app; esto se actualiza solo.
              </span>
            </p>
          )}
        </div>
      </div>

      {confirmingDelete ? (
        <div role="alertdialog" className="mt-3 rounded-xl bg-wine/5 p-3 text-sm">
          <p>
            ¿Borrar <strong>{material.name}</strong>? También se borrarán las preguntas y tarjetas
            generadas a partir de este material.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() =>
                void run(async () => {
                  await onDelete(material);
                }, "No se pudo borrar")
              }
              disabled={busy}
              className="rounded-full bg-wine px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Borrando..." : "Sí, borrar"}
            </button>
            <button onClick={() => setConfirmingDelete(false)} disabled={busy} className={secondaryButton}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {material.status === "listo" && (
            <>
              <button
                onClick={() => onGenerate(material, "preguntas")}
                disabled={generating}
                className="rounded-full bg-turquesa px-3.5 py-1.5 text-sm font-medium text-ciruela transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {generation?.kind === "preguntas"
                  ? generation.status === "pendiente"
                    ? "En cola..."
                    : "Generando..."
                  : "Generar preguntas"}
              </button>
              <button
                onClick={() => onGenerate(material, "tarjetas")}
                disabled={generating}
                className="rounded-full bg-card-blue px-3.5 py-1.5 text-sm font-medium text-ciruela transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {generation?.kind === "tarjetas"
                  ? generation.status === "pendiente"
                    ? "En cola..."
                    : "Generando..."
                  : "Generar tarjetas"}
              </button>
              <button onClick={() => void toggleText()} className={secondaryButton}>
                {open ? "Ocultar texto" : "Ver texto extraído"}
              </button>
            </>
          )}
          {material.status === "error" && (
            <button
              onClick={() => void run(() => onRetry(material), "No se pudo reintentar")}
              disabled={busy}
              className={secondaryButton}
            >
              {busy ? "Reintentando..." : "Reintentar"}
            </button>
          )}
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={material.status === "procesando" || generating}
            title={material.status === "procesando" ? "Espera a que termine de procesarse" : undefined}
            className={`${secondaryButton} text-wine`}
          >
            Borrar
          </button>
        </div>
      )}

      {actionError && (
        <p role="alert" className="mt-2 text-sm text-wine">
          {actionError}
        </p>
      )}

      {open && (
        <div className="mt-3 max-h-80 overflow-y-auto rounded-xl bg-oat p-4 text-sm">
          {chunksLoading || !chunks ? (
            <p className="text-ciruela/60">Cargando texto...</p>
          ) : (
            chunks.map((chunk) => (
              <div key={chunk.id} className="mb-4 last:mb-0">
                {(material.pageCount ?? 1) > 1 && (
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-deep">
                    Página {chunk.page}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-ciruela/80">{chunk.text}</p>
              </div>
            ))
          )}
        </div>
      )}
    </li>
  );
}
