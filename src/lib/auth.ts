import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSchema } from "@/lib/bootstrap";

const COOKIE_NAME = "si_session";
const SESSION_DAYS = 30;

/* ---------------- password hashing (scrypt, zero dependencies) ---------------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/* ---------------- session tokens (uid.exp.hmac) ---------------- */

/** HMAC secret used for session tokens (also reused for OAuth state signing). */
export function getSessionSecret(): string {
  // Prefer an explicit secret; otherwise derive one that is stable per
  // deployment but not hardcoded (changing DATABASE_URL rotates sessions).
  return (
    process.env.APP_SECRET ||
    crypto
      .createHash("sha256")
      .update(`speedindexing:${process.env.DATABASE_URL || "local"}`)
      .digest("hex")
  );
}

const getSecret = getSessionSecret;

export function createSessionToken(userId: string, days = SESSION_DAYS): string {
  const exp = Date.now() + days * 24 * 60 * 60 * 1000;
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(`${userId}.${exp}`)
    .digest("hex");
  return `${userId}.${exp}.${sig}`;
}

export function verifySessionToken(
  token: string | undefined
): { userId: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  if (!userId || !expStr || !sig) return null;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(`${userId}.${expStr}`)
    .digest("hex");
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  if (Number(expStr) <= Date.now()) return null;
  return { userId };
}

export function setSessionCookie(res: NextResponse, userId: string): void {
  res.cookies.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

/* ---------------- request helpers ---------------- */

export type SessionUser = { id: string; email: string };

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const session = verifySessionToken(store.get(COOKIE_NAME)?.value);
  if (!session) return null;
  await ensureSchema();
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true },
  });
  return user ?? null;
}

/**
 * Returns the session user, or a 401 NextResponse the caller should return.
 * Usage:
 *   const user = await guard();
 *   if (user instanceof NextResponse) return user;
 */
export async function guard(): Promise<NextResponse | SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — please sign in" },
      { status: 401 }
    );
  }
  return user;
}

export const SESSION_COOKIE = COOKIE_NAME;
