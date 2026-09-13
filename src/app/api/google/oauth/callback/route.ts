import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  oauthConfigured,
  verifyState,
  resolveOrigin,
  callbackUrl,
  exchangeCodeForTokens,
} from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/**
 * Google redirects back here after consent. We exchange the code for a
 * refresh token (stored on the user's row), forget cached host lanes so the
 * next submit re-probes with the new instant capability, and bounce back to
 * the dashboard.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const googleError = params.get("error");
  const origin = resolveOrigin(req);
  const back = (query: string) => NextResponse.redirect(`${origin}/${query}`);

  const verified = verifyState(params.get("state"));
  if (!verified) {
    return back(
      "?google=error&reason=Could not verify the connect request — please try again"
    );
  }

  const session = await getSessionUser();
  if (!session || session.id !== verified.userId) {
    return back(
      "?google=error&reason=Session changed during connect — log in and press Connect again"
    );
  }

  if (!code) {
    return back(
      `?google=error&reason=${encodeURIComponent(
        googleError
          ? `Google sign-in was cancelled (${googleError})`
          : "No authorization code received"
      )}`
    );
  }

  if (!oauthConfigured()) {
    return back(
      `?google=error&reason=${encodeURIComponent(
        "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set on this deployment"
      )}`
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code, callbackUrl(origin));
    await db.googleConnection.upsert({
      where: { userId: session.id },
      update: {
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt,
        email: tokens.email,
      },
      create: {
        userId: session.id,
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt,
        email: tokens.email,
      },
    });

    // Self-heal: cached "boost" lanes may now be instant — forget them all.
    await db.hostLane
      .deleteMany({ where: { userId: session.id } })
      .catch(() => undefined);

    return back("?google=connected");
  } catch (e) {
    return back(
      `?google=error&reason=${encodeURIComponent(
        e instanceof Error ? e.message : "Token exchange failed"
      )}`
    );
  }
}
