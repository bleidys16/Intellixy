"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";

export function TopNav({ user }: { user: User }) {
  const router = useRouter();

  async function handleLogout() {
    await apiFetch("/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between px-6 py-4 sm:px-10">
      <Link href="/" className="font-display text-xl font-semibold">
        Inte<span className="text-turquesa">ll</span>ixy
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-ciruela/70">{user.name}</span>
        <button onClick={handleLogout} className="font-medium text-teal-deep hover:underline">
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
