import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";
import { ensureSchema } from "@/lib/bootstrap";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Create a new SaaS account and sign in. */
export async function POST(req: NextRequest) {
  await ensureSchema();

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address" },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists — sign in instead" },
      { status: 409 }
    );
  }

  const user = await db.user.create({
    data: { email, passwordHash: hashPassword(password) },
  });

  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
  setSessionCookie(res, user.id);
  return res;
}
