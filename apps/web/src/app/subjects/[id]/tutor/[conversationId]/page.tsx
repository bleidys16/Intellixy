"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { TutorAnswer } from "@/components/TutorAnswer";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import type { TutorConversation, TutorMessage } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;
const MAX_LENGTH = 1000;

export default function TutorChatPage() {
  const { id, conversationId } = useParams<{ id: string; conversationId: string }>();
  const { user, loading } = useSession();
  const router = useRouter();

  const [conversation, setConversation] = useState<TutorConversation | null>(null);
  const [messages, setMessages] = useState<TutorMessage[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLLIElement>(null);

  const base = `/subjects/${id}/tutor/conversations/${conversationId}`;

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    // Se ignora la respuesta de una carga anterior (React ejecuta el efecto dos veces en desarrollo).
    let cancelled = false;
    apiFetch<{ conversation: TutorConversation; messages: TutorMessage[] }>(base)
      .then((data) => {
        if (cancelled) return;
        setConversation(data.conversation);
        setMessages(data.messages);
      })
      .catch(() => {
        if (!cancelled) router.push(`/subjects/${id}/tutor`);
      });
    return () => {
      cancelled = true;
    };
  }, [user, base, id, router]);

  // Mientras el tutor responde se consulta la conversación cada pocos segundos.
  const pending = messages?.some((m) => m.status === "pendiente" || m.status === "procesando") ?? false;
  useEffect(() => {
    if (!user || !pending) return;
    const timer = window.setInterval(() => {
      apiFetch<{ messages: TutorMessage[] }>(base)
        .then((data) => setMessages(data.messages))
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [user, base, pending]);

  // Siempre se ve el último mensaje.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || sending || pending) return;
    setSending(true);
    setError(null);
    try {
      const data = await apiFetch<{ messages: TutorMessage[] }>(`${base}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      setMessages((prev) => [...(prev ?? []), ...data.messages]);
      setText("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar la pregunta");
    } finally {
      setSending(false);
    }
  }

  async function retry(message: TutorMessage) {
    setError(null);
    try {
      const data = await apiFetch<{ message: TutorMessage }>(`${base}/messages/${message.id}/retry`, {
        method: "POST",
      });
      setMessages((prev) => prev?.map((m) => (m.id === message.id ? data.message : m)) ?? prev);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reintentar");
    }
  }

  if (loading || !user || !messages) {
    return <div className="flex flex-1 items-center justify-center text-ciruela/50">Cargando...</div>;
  }

  const lastId = messages.at(-1)?.id;

  return (
    <div className="flex flex-1 flex-col">
      <TopNav user={user} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-5 sm:px-10">
        <div className="flex items-center gap-3">
          <Link href={`/subjects/${id}/tutor`} className="shrink-0 text-sm font-medium text-teal-deep hover:underline">
            ← Conversaciones
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-right text-sm text-ciruela/60">{conversation?.title}</h1>
        </div>

        <ol className="mt-4 flex flex-1 flex-col gap-4 pb-4">
          {messages.map((m) =>
            m.role === "user" ? (
              <li key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ciruela px-4 py-2.5 text-[15px] text-white">
                  {m.content}
                </p>
              </li>
            ) : (
              <li key={m.id} className="flex justify-start">
                <div className="w-full max-w-[95%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[15px] shadow-sm">
                  <TutorAnswer message={m} onRetry={m.id === lastId ? () => void retry(m) : undefined} />
                </div>
              </li>
            ),
          )}
          {/* Ancla del auto-scroll: el margen evita que la barra de escritura fija tape el último mensaje. */}
          <li ref={bottomRef} aria-hidden className="scroll-mb-32" />
        </ol>

        <form
          onSubmit={(e) => void send(e)}
          className="sticky bottom-0 -mx-4 border-t border-ciruela/10 bg-oat px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-10 sm:px-10"
        >
          {error && (
            <p role="alert" className="mb-2 rounded-xl bg-wine/10 px-3 py-2 text-sm text-wine">
              {error}
            </p>
          )}
          <div className="flex items-end gap-2">
            <label htmlFor="tutor-message" className="sr-only">
              Tu pregunta
            </label>
            <textarea
              id="tutor-message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Enter envía; Shift+Enter hace un salto de línea.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              maxLength={MAX_LENGTH}
              rows={1}
              placeholder={pending ? "El tutor está respondiendo…" : "Pregunta algo sobre tus apuntes…"}
              disabled={pending}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-ciruela/15 bg-white px-4 py-2.5 text-[15px] outline-none focus:border-turquesa disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || pending || !text.trim()}
              aria-label="Enviar pregunta"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-turquesa text-ciruela transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
