import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/server/auth/password";
import { AUTH_COOKIE, AUTH_COOKIE_OPTIONS, signSession } from "@/server/auth/jwt";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withRoute } from "@/server/http/safe";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = withRoute(async (request: NextRequest) => {
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "El email o la contraseña no coinciden. Revisa tus datos e inténtalo de nuevo.", code: "INVALID_CREDENTIALS" },
      { status: 401 },
    );
  }

  const token = signSession({ userId: user.id });
  const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  res.cookies.set(AUTH_COOKIE, token, AUTH_COOKIE_OPTIONS);
  return res;
});
