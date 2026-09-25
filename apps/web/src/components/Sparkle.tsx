/**
 * La estrella de la marca (el destello del isotipo). Sello de "tema dominado" y destello junto a las
 * recomendaciones. Decorativa: quien la use debe dar el significado con texto.
 */
export function Sparkle({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="297.5 -272.5 85 85" fill="currentColor" aria-hidden className={className}>
      <path d="M 340.0 -272.5 Q 355.3 -245.3 382.5 -230.0 Q 355.3 -214.7 340.0 -187.5 Q 324.7 -214.7 297.5 -230.0 Q 324.7 -245.3 340.0 -272.5 Z" />
    </svg>
  );
}
