"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import type { Subject } from "@/lib/types";

const SUBJECT_COLORS = [
  { hex: "#8CA7F4", card: "bg-card-blue" },
  { hex: "#D98CF4", card: "bg-card-purple" },
];

function cardClassFor(color: string | null) {
  return SUBJECT_COLORS.find((c) => c.hex === color)?.card ?? "bg-card-blue";
}

export default function HomePage() {
  const { user, loading } = useSession();
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SUBJECT_COLORS[0].hex);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      apiFetch<{ subjects: Subject[] }>("/subjects").then((data) => setSubjects(data.subjects));
    }
  }, [user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { subject } = await apiFetch<{ subject: Subject }>("/subjects", {
        method: "POST",
        body: JSON.stringify({ name, color }),
      });
      setSubjects((prev) => [subject, ...prev]);
      setName("");
    } finally {
      setCreating(false);
    }
  }

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-ciruela/50">Cargando...</div>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopNav user={user} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8 sm:px-10">
        <h1 className="font-display text-3xl font-semibold">Hola, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-ciruela/60">Estas son tus materias.</p>

        <form
          onSubmit={handleCreate}
          className="mt-6 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-end"
        >
          <label className="flex-1 text-sm font-medium">
            Nueva materia
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Biología celular"
              className="mt-1 w-full rounded-lg border border-ciruela/15 px-3 py-2 outline-none focus:border-turquesa"
            />
          </label>
          <div className="flex items-center gap-2">
            {SUBJECT_COLORS.map((c) => (
              <button
                type="button"
                key={c.hex}
                onClick={() => setColor(c.hex)}
                aria-label={`Color ${c.hex}`}
                className="h-8 w-8 rounded-full ring-offset-2"
                style={{
                  backgroundColor: c.hex,
                  outline: color === c.hex ? "2px solid #37192C" : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-full bg-ciruela px-5 py-2.5 font-medium text-oat transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creando..." : "Crear materia"}
          </button>
        </form>

        {subjects.length === 0 ? (
          <p className="mt-10 text-center text-ciruela/50">
            Todavía no tenés materias. Creá la primera arriba.
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {subjects.map((subject) => (
              <Link
                key={subject.id}
                href={`/subjects/${subject.id}`}
                className={`rounded-2xl p-5 transition-transform hover:-translate-y-0.5 ${cardClassFor(subject.color)}`}
              >
                <p className="font-display text-lg font-semibold">{subject.name}</p>
                <p className="mt-1 text-sm text-ciruela/60">
                  Creada el {new Date(subject.createdAt).toLocaleDateString("es")}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
