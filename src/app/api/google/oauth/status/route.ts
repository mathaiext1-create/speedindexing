import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { oauthConfigured, resolveOrigin, callbackUrl } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/** Connection state for the "Sign in with Google" instant lane. */
export async function GET(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const conn = await db.googleConnection
    .findUnique({ where: { userId: user.id } })
    .catch(() => null);

  return NextResponse.json({
    configured: oauthConfigured(),
    connected: Boolean(conn),
    email: conn?.email ?? null,
    /** Exact redirect URI to paste into the Google Cloud OAuth client. */
    redirectUri: callbackUrl(resolveOrigin(req)),
    origin: resolveOrigin(req),
  });
}
