/** Aviso de error con botón para reintentar. Va en el lugar del contenido que no se pudo cargar. */
export function ErrorNotice({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col gap-3 rounded-xl bg-wine/10 px-4 py-3 text-sm text-wine sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-10 shrink-0 rounded-full border border-wine/40 px-4 font-medium transition-colors hover:bg-wine/10"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
