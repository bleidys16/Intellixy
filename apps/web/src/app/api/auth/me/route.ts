import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withRoute } from "@/server/http/safe";

export const GET = withRoute(async (request: NextRequest) => {
  const userId = requireAuth(request);
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, email: true },
  });
  return NextResponse.json({ user });
});
