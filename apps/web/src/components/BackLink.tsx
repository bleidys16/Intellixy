import Link from "next/link";
import type { ReactNode } from "react";

/** Enlace para volver a la pantalla anterior: flecha real (no el carácter "←") y área táctil más grande. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1.5 inline-flex items-center gap-1 rounded-full py-1 pl-1.5 pr-2.5 text-sm font-medium text-teal-deep transition-colors hover:bg-teal-deep/10"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      {children}
    </Link>
  );
}
