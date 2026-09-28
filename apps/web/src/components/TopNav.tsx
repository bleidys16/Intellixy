import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ProfileMenu } from "@/components/ProfileMenu";
import type { User } from "@/lib/types";

export function TopNav({ user }: { user: User }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 sm:px-10">
      <Link href="/" aria-label="Intellixy, ir al inicio">
        <Logo className="h-8" />
      </Link>
      <ProfileMenu user={user} />
    </header>
  );
}
