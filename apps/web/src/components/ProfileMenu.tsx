"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, clearToken } from "@/lib/api";
import type { User } from "@/lib/types";

/** Avatar con inicial del nombre; al abrirlo muestra nombre, email y cerrar sesión. */
export function ProfileMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    clearToken();
    router.push("/login");
    router.refresh();
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Cuenta de ${user.name}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-ciruela text-sm font-semibold text-oat transition-opacity hover:opacity-90"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-20 w-56 rounded-xl bg-white p-2 shadow-lg ring-1 ring-ciruela/10"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-ciruela/60">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-ciruela/10" />
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-wine hover:bg-wine/5"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
