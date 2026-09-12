import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/bootstrap";

const COOKIE_NAME = "si_session";
const SESSION_DAYS = 30;

export function getAppPassword(): string {
  return process.env.APP_PASSWORD || "speedindex";
}

function getSecret(): string {
  // Derived from the password so changing the password invalidates old sessions
  return crypto
    .createHash("sha256")
    .update(`speedindexing:${getAppPassword()}`)
    .digest("hex");
}

export function createSessionToken(days = SESSION_DAYS): string {
  const exp = Date.now() + days * 24 * 60 * 60 * 1000;
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(String(exp))
    .digest("hex");
  return `${exp}.${sig}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  if (!expStr || !sig) return false;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(expStr)
    .digest("hex");
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return false;
  }
  return Number(expStr) > Date.now();
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value);
}

/** Returns a 401 response if unauthenticated, otherwise null. */
export async function guard(): Promise<NextResponse | null> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Fresh deployments (e.g. Vercel + Neon) get their tables on first request
  await ensureSchema();
  return null;
}

export const SESSION_COOKIE = COOKIE_NAME;
