import Link from "next/link";
import { Logo } from "@/components/Logo";

/** Páginas que no existen. */
export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto h-9" />
        <h1 className="mt-8 font-display text-2xl font-semibold">No encontramos esta página</h1>
        <p className="mt-2 text-sm text-ciruela/60">
          Puede que el enlace esté mal escrito o que lo que buscas ya no exista.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-ciruela px-6 text-sm font-semibold text-oat transition-opacity hover:opacity-90"
        >
          Ir a mis materias
        </Link>
      </div>
    </div>
  );
}
