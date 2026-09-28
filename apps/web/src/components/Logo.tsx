import Image from "next/image";

/**
 * Logo completo de Intellixy (versión transparente, para fondos claros como Oat Milk).
 * El SVG se sirve tal cual, sin optimizar: es vectorial y escala sin pérdida.
 */
export function Logo({ className = "h-7" }: { className?: string }) {
  return (
    <Image
      src="/brand/intellixy-wordmark.svg"
      alt="Intellixy"
      width={2648}
      height={827}
      unoptimized
      priority
      className={`w-auto ${className}`}
    />
  );
}
