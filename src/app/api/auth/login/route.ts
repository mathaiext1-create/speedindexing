import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { ensureSchema } from "@/lib/bootstrap";

/** Sign in with email + password. */
export async function POST(req: NextRequest) {
  await ensureSchema();

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Wrong email or password" },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
  setSessionCookie(res, user.id);
  return res;
}
