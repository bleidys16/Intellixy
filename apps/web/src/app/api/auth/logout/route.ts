import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/server/auth/jwt";
import { withRoute } from "@/server/http/safe";

export const POST = withRoute(async () => {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete(AUTH_COOKIE);
  return res;
});
