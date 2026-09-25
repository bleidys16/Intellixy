import type { TutorMessage } from "@/lib/types";

/** Convierte los marcadores [1] o [1, 2] del texto en etiquetas visibles que remiten a la lista de fuentes. */
function withMarkers(text: string) {
  return text.split(/(\[\d+(?:\s*,\s*\d+)*\])/g).map((part, i) =>
    /^\[\d/.test(part) ? (
      <sup key={i} className="mx-0.5 rounded bg-turquesa/30 px-1 text-[11px] font-semibold text-teal-deep">
        {part.slice(1, -1)}
      </sup>
    ) : (
      part
    ),
  );
}

function General({ text, partial }: { text: string; partial: boolean }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-ciruela/25 bg-oat px-3 py-2.5 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ciruela/60">
        {partial ? "Además, en general" : "Lo que sé en general"}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-ciruela/85">{text}</p>
      <p className="mt-2 text-xs text-ciruela/55">
        Esto no viene de tus apuntes y no está verificado: compruébalo antes de estudiarlo.
      </p>
    </div>
  );
}

/** Lo que se encontró en internet: siempre aparte de los apuntes, con enlaces a las páginas reales. */
function Web({ web, partial }: { web: NonNullable<TutorMessage["web"]>; partial: boolean }) {
  return (
    <div className="mt-3 rounded-xl border border-soft-blue/60 bg-card-blue/40 px-3 py-2.5 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ciruela/60">
        {partial ? "Además, en internet" : "Lo que encontré en internet"}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-ciruela/85">{web.answer}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {web.sources.map((s) => (
          <li key={s.url} className="min-w-0 text-xs">
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="block truncate font-medium text-teal-deep underline-offset-2 hover:underline"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ciruela/55">
        Esto no viene de tus apuntes: es un resumen de internet. Compruébalo antes de estudiarlo.
      </p>
    </div>
  );
}

/** Una respuesta del tutor: respaldada con fuentes, "no aparece en tus apuntes", o sin verificar. */
export function TutorAnswer({ message, onRetry }: { message: TutorMessage; onRetry?: () => void }) {
  if (message.status === "pendiente" || message.status === "procesando") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-ciruela/60">
        <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-ciruela/30 border-t-ciruela" />
        El tutor está buscando en tus apuntes y en internet…
      </p>
    );
  }

  if (message.status === "error") {
    return (
      <div role="alert">
        <p className="text-sm text-wine">{message.errorMessage ?? "No se pudo generar la respuesta"}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 min-h-10 rounded-full border border-ciruela/20 px-4 text-sm font-medium transition-colors hover:bg-ciruela/5"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  }

  if (message.outcome === "grounded") {
    return (
      <div>
        <p className="whitespace-pre-wrap leading-relaxed">{withMarkers(message.content)}</p>
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ciruela/60">Fuentes</p>
          <ol className="mt-1.5 flex flex-col gap-2">
            {message.citations.map((c) => (
              <li key={c.ref} className="flex gap-2 text-xs">
                <span className="mt-0.5 h-fit rounded bg-turquesa/30 px-1.5 py-0.5 font-semibold text-teal-deep">
                  {c.ref}
                </span>
                <span className="min-w-0 flex-1 border-l-2 border-turquesa pl-2 italic text-ciruela/75">
                  “{c.quote}”
                  <span className="mt-0.5 block font-medium not-italic text-ciruela/85">
                    {c.materialName}
                    {c.materialType === "pdf" ? `, p. ${c.page}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        {message.web && <Web web={message.web} partial />}
        {message.general && <General text={message.general} partial />}
      </div>
    );
  }

  // "not_in_material" y "unverified": el texto del modelo no se muestra; se dice claramente y se ofrece lo general.
  return (
    <div>
      <p className="rounded-xl bg-yuzu/50 px-3 py-2.5 text-sm font-medium">
        {message.outcome === "unverified"
          ? "No pude respaldar esta respuesta con tus apuntes, así que no te la muestro."
          : "Esto no aparece en tus apuntes."}
      </p>
      {message.web && <Web web={message.web} partial={false} />}
      {message.general ? (
        <General text={message.general} partial={false} />
      ) : message.web ? null : (
        <p className="mt-2 text-sm text-ciruela/65">
          Tampoco tengo una respuesta general fiable. Prueba a subir material sobre este tema.
        </p>
      )}
    </div>
  );
}
