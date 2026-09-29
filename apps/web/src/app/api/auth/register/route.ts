import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/server/auth/password";
import { AUTH_COOKIE, AUTH_COOKIE_OPTIONS, signSession } from "@/server/auth/jwt";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withRoute } from "@/server/http/safe";

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export const POST = withRoute(async (request: NextRequest) => {
  const parsed = registerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, email, password } = parsed.data;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    return NextResponse.json(
      { error: "Ya existe una cuenta con ese email. ¿Quieres iniciar sesión?", code: "EMAIL_EXISTS" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash })
    .returning({ id: users.id, name: users.name, email: users.email });

  const token = signSession({ userId: user.id });
  const res = NextResponse.json({ user, token }, { status: 201 });
  res.cookies.set(AUTH_COOKIE, token, AUTH_COOKIE_OPTIONS);
  return res;
});
