"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { TutorAnswer } from "@/components/TutorAnswer";
import type { TutorConversation, TutorMessage } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;
const MAX_LENGTH = 1000;
const WELCOME_MESSAGE =
  "Pregúntale lo que no entiendas. Responde con tus apuntes y te muestra de dónde sacó cada dato.";

/** Chat del tutor, embebido en la pestaña (no navega a otra página). */
export function TutorChat({ subjectId }: { subjectId: string }) {
  const [conversations, setConversations] = useState<TutorConversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TutorMessage[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLLIElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Conversaciones de la materia, una vez; se abre la más reciente si hay.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ conversations: TutorConversation[] }>(`/subjects/${subjectId}/tutor/conversations`)
      .then((data) => {
        if (cancelled) return;
        setConversations(data.conversations);
        if (data.conversations.length > 0) setActiveId(data.conversations[0].id);
      })
      .catch(() => setConversations([]));
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  // Mensajes de la conversación activa (se limpian al cambiar de conversación en startNew/select).
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    apiFetch<{ messages: TutorMessage[] }>(`/subjects/${subjectId}/tutor/conversations/${activeId}`)
      .then((data) => !cancelled && setMessages(data.messages))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [subjectId, activeId]);

  // Mientras el tutor responde se consulta cada pocos segundos.
  const pending = messages?.some((m) => m.status === "pendiente" || m.status === "procesando") ?? false;
  useEffect(() => {
    if (!activeId || !pending) return;
    const timer = window.setInterval(() => {
      apiFetch<{ messages: TutorMessage[] }>(`/subjects/${subjectId}/tutor/conversations/${activeId}`)
        .then((data) => setMessages(data.messages))
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [subjectId, activeId, pending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!showHistory) return;
    function onPointerDown(e: PointerEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setShowHistory(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showHistory]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || sending || pending) return;
    setSending(true);
    setError(null);
    const question = text;
    setText("");
    try {
      if (activeId) {
        const data = await apiFetch<{ messages: TutorMessage[] }>(
          `/subjects/${subjectId}/tutor/conversations/${activeId}/messages`,
          { method: "POST", body: JSON.stringify({ message: question }) },
        );
        setMessages((prev) => [...(prev ?? []), ...data.messages]);
      } else {
        const data = await apiFetch<{ conversation: TutorConversation; messages: TutorMessage[] }>(
          `/subjects/${subjectId}/tutor/conversations`,
          { method: "POST", body: JSON.stringify({ message: question }) },
        );
        setConversations((prev) => [data.conversation, ...(prev ?? [])]);
        setMessages(data.messages);
        setActiveId(data.conversation.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar la pregunta");
      setText(question);
    } finally {
      setSending(false);
    }
  }

  async function retry(message: TutorMessage) {
    if (!activeId) return;
    setError(null);
    try {
      const data = await apiFetch<{ message: TutorMessage }>(
        `/subjects/${subjectId}/tutor/conversations/${activeId}/messages/${message.id}/retry`,
        { method: "POST" },
      );
      setMessages((prev) => prev?.map((m) => (m.id === message.id ? data.message : m)) ?? prev);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reintentar");
    }
  }

  async function removeConversation(conversationId: string) {
    try {
      await apiFetch(`/subjects/${subjectId}/tutor/conversations/${conversationId}`, { method: "DELETE" });
      setConversations((prev) => prev?.filter((c) => c.id !== conversationId) ?? prev);
      if (activeId === conversationId) {
        setActiveId(null);
        setMessages(null);
      }
    } catch {
      setError("No se pudo borrar la conversación");
    } finally {
      setConfirmingId(null);
    }
  }

  function startNew() {
    setActiveId(null);
    setMessages(null);
    setShowHistory(false);
  }

  const activeConversation = conversations?.find((c) => c.id === activeId) ?? null;
  const lastId = messages?.at(-1)?.id;

  return (
    <div className="flex h-[32rem] max-h-[70vh] flex-col rounded-2xl bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-ciruela/10 px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ciruela/70">
          {activeConversation?.title ?? "Nueva conversación"}
        </span>
        <div ref={historyRef} className="relative flex shrink-0 items-center gap-1">
          {conversations && conversations.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              aria-label="Ver conversaciones anteriores"
              aria-expanded={showHistory}
              className="grid h-9 w-9 place-items-center rounded-full text-ciruela/60 hover:bg-ciruela/5"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                <path d="M12 8v4l3 2" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={startNew}
            aria-label="Nueva conversación"
            className="grid h-9 w-9 place-items-center rounded-full text-ciruela/60 hover:bg-ciruela/5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          {showHistory && (
            <div className="absolute right-0 top-11 z-20 max-h-72 w-64 overflow-y-auto rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-ciruela/10">
              {conversations?.map((c) => (
                <div key={c.id} className="flex items-center gap-1">
                  {confirmingId === c.id ? (
                    <div className="flex flex-1 items-center gap-1 px-2 py-1.5 text-xs">
                      <span className="flex-1">¿Borrar?</span>
                      <button
                        type="button"
                        onClick={() => void removeConversation(c.id)}
                        className="rounded-full bg-wine px-2 py-1 font-medium text-white"
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="rounded-full border border-ciruela/20 px-2 py-1 font-medium"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveId(c.id);
                          setMessages(null);
                          setShowHistory(false);
                        }}
                        className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-sm ${
                          c.id === activeId ? "bg-ciruela/10 font-medium" : "hover:bg-ciruela/5"
                        }`}
                      >
                        {c.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(c.id)}
                        aria-label={`Borrar «${c.title}»`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ciruela/40 hover:bg-wine/10 hover:text-wine"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ol className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {!activeId && (
          <li className="flex justify-start">
            <div className="w-full max-w-[95%] rounded-2xl rounded-bl-md bg-oat px-4 py-3 text-[15px]">
              {WELCOME_MESSAGE}
            </div>
          </li>
        )}
        {messages?.map((m) =>
          m.role === "user" ? (
            <li key={m.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ciruela px-4 py-2.5 text-[15px] text-white">
                {m.content}
              </p>
            </li>
          ) : (
            <li key={m.id} className="flex justify-start">
              <div className="w-full max-w-[95%] rounded-2xl rounded-bl-md bg-oat px-4 py-3 text-[15px]">
                <TutorAnswer message={m} onRetry={m.id === lastId ? () => void retry(m) : undefined} />
              </div>
            </li>
          ),
        )}
        <li ref={bottomRef} aria-hidden />
      </ol>

      <form onSubmit={(e) => void send(e)} className="border-t border-ciruela/10 px-4 py-3">
        {error && (
          <div role="alert" className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-wine/10 px-3 py-2 text-sm text-wine">
            <span>{error}</span>
            {error.toLowerCase().includes("larga") && (
              <button
                type="button"
                onClick={startNew}
                className="shrink-0 rounded-full bg-wine px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                Nueva conversación
              </button>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="tutor-inline-question" className="sr-only">
            Tu pregunta
          </label>
          <textarea
            id="tutor-inline-question"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            maxLength={MAX_LENGTH}
            rows={1}
            placeholder={pending ? "El tutor está respondiendo…" : "Pregunta algo sobre tus apuntes…"}
            disabled={pending}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-ciruela/15 bg-oat px-4 py-2.5 text-[15px] outline-none focus:border-turquesa disabled:opacity-60"
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
    </div>
  );
}
