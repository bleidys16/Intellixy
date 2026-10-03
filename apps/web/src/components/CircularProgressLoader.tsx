/**
 * Spinner circular (aro + arco animado), para cuando no hay un porcentaje real que mostrar
 * (procesar un archivo, generar con IA): en vez de fingir un avance, el arco gira sin parar.
 */
export function CircularProgressLoader({ className = "h-5 w-5" }: { className?: string }) {
  const circumference = 2 * Math.PI * 45;
  const arc = circumference * 0.25;
  return (
    <svg viewBox="0 0 100 100" className={`shrink-0 animate-spin ${className}`} aria-hidden>
      <circle cx="50" cy="50" r="45" fill="none" strokeWidth="10" className="stroke-ciruela/10" />
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        className="stroke-turquesa"
        strokeDasharray={`${arc} ${circumference}`}
      />
    </svg>
  );
}
