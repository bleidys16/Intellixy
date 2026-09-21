"use client";

import { useId, useState } from "react";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  minLength?: number;
  /** Clases de margen del contenedor, p. ej. "mt-4". */
  className?: string;
}

/** Campo de contraseña con el "ojito" para mostrarla u ocultarla (el botón es accesible con teclado). */
export function PasswordInput({ label, value, onChange, autoComplete, minLength, className = "mt-4" }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-ciruela/15 py-2 pl-3 pr-12 outline-none focus:border-turquesa"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-lg text-ciruela/55 transition-colors hover:text-ciruela focus-visible:outline-2 focus-visible:outline-turquesa"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {visible ? (
              <>
                <path d="M3 3l18 18" />
                <path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 8.5 4 9.5 6a12 12 0 0 1-2.4 3.1M6.6 6.7A12.4 12.4 0 0 0 2.5 12c1 2 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-.9" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </>
            ) : (
              <>
                <path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
