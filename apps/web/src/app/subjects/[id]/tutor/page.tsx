"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { apiFetch, ApiError, errorMessage, isNotFound } from "@/lib/api";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ListSkeleton } from "@/components/Skeleton";
import { FullPageStatus } from "@/components/FullPageStatus";
import { useSession } from "@/lib/useSession";
import type { TutorConversation } from "@/lib/types";

const MAX_LENGTH = 1000;

export default function TutorHomePage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading, error: sessionError, retry: retrySession } = useSession();
  const router = useRouter();

  const [conversations, setConversations] = useState<TutorConversation[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fallo al cargar (red, servidor): se muestra con "Reintentar". `reloadKey` vuelve a lanzar la carga.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  function reload() {
    setLoadError(null);
    setReloadKey((n) => n + 1);
  }
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch<{ conversations: TutorConversation[] }>(`/subjects/${id}/tutor/conversations`)
      .then((data) => {
        if (!cancelled) setConversations(data.conversations);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isNotFound(err)) router.push(`/subjects/${id}`);
        else setLoadError(errorMessage(err, "No pudimos cargar tus conversaciones"));
      });
    return () => {
      cancelled = true;
    };
  }, [user, id, router, reloadKey]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const data = await apiFetch<{ conversation: TutorConversation }>(`/subjects/${id}/tutor/conversations`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      router.push(`/subjects/${id}/tutor/${data.conversation.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar la pregunta");
      setSending(false);
    }
  }

  async function remove(conversationId: string) {
    try {
      await apiFetch(`/subjects/${id}/tutor/conversations/${conversationId}`, { method: "DELETE" });
      setConversations((prev) => prev?.filter((c) => c.id !== conversationId) ?? prev);
    } catch {
      setError("No se pudo borrar la conversación");
    } finally {
      setConfirmingId(null);
    }
  }

  if (loading || !user) {
    return <FullPageStatus error={sessionError} onRetry={retrySession} />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopNav user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-10 sm:py-8">
        <Link href={`/subjects/${id}`} className="text-sm font-medium text-teal-deep hover:underline">
          ← Volver a la materia
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">Tutor</h1>
        <p className="mt-1 text-sm text-ciruela/65">
          Pregunta lo que no entiendas. Responde con tus apuntes y te muestra de dónde sacó cada dato. Si algo no
          está en tus materiales, te lo dice.
        </p>

        <form onSubmit={(e) => void start(e)} className="mt-5 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <label htmlFor="tutor-question" className="block text-sm font-medium">
            Nueva conversación
          </label>
          <textarea
            id="tutor-question"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_LENGTH}
            rows={3}
            placeholder="¿Qué quieres saber de tus apuntes?"
            className="mt-2 w-full resize-none rounded-xl border border-ciruela/15 bg-oat px-3 py-2.5 text-[15px] outline-none focus:border-turquesa"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="mt-3 min-h-11 w-full rounded-full bg-turquesa px-5 text-sm font-semibold text-ciruela transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {sending ? "Enviando..." : "Preguntar"}
          </button>
          {error && (
            <p role="alert" className="mt-3 text-sm text-wine">
              {error}
            </p>
          )}
        </form>

        <h2 className="mt-8 font-display text-lg font-semibold">Tus conversaciones</h2>
        {loadError ? (
          <ErrorNotice message={loadError} onRetry={reload} className="mt-3" />
        ) : conversations === null ? (
          <div className="mt-3">
            <ListSkeleton rows={2} />
          </div>
        ) : conversations.length === 0 ? (
          <p className="mt-3 text-sm text-ciruela/55">Todavía no has preguntado nada. Empieza arriba.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {conversations.map((c) => (
              <li key={c.id} className="rounded-xl bg-white shadow-sm">
                {confirmingId === c.id ? (
                  <div role="alertdialog" className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                    <span className="flex-1">¿Borrar esta conversación?</span>
                    <button
                      onClick={() => void remove(c.id)}
                      className="min-h-10 rounded-full bg-wine px-4 font-medium text-white"
                    >
                      Sí, borrar
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="min-h-10 rounded-full border border-ciruela/20 px-4 font-medium"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 pr-2">
                    <Link
                      href={`/subjects/${id}/tutor/${c.id}`}
                      className="flex min-h-14 min-w-0 flex-1 flex-col justify-center rounded-xl px-4 py-2.5 transition-colors hover:bg-ciruela/5"
                    >
                      <span className="truncate text-sm font-medium">{c.title}</span>
                      <span className="text-xs text-ciruela/55">
                        {new Date(c.updatedAt).toLocaleDateString("es", { day: "numeric", month: "short" })}
                        {c.messageCount ? ` · ${Math.ceil(c.messageCount / 2)} ${c.messageCount <= 2 ? "pregunta" : "preguntas"}` : ""}
                      </span>
                    </Link>
                    <button
                      onClick={() => setConfirmingId(c.id)}
                      aria-label={`Borrar la conversación «${c.title}»`}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ciruela/45 transition-colors hover:bg-wine/10 hover:text-wine"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
