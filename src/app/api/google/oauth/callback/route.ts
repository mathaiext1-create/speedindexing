import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  oauthConfigured,
  verifyState,
  resolveOrigin,
  callbackUrl,
  exchangeCodeForTokens,
  publishViaUserAccount,
} from "@/lib/google-oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Map Google's OAuth error codes to what the user should actually do. */
const FRIENDLY_ERRORS: Record<string, string> = {
  access_denied:
    "You clicked Cancel at Google — OR your OAuth app is in Testing mode and this Google email is not added as a Test user. Fix: Google Cloud → OAuth consent screen → Test users → add your email, then connect again.",
  admin_policy_enforced:
    "Your Google Workspace admin blocks unverified apps — connect with a personal @gmail.com account instead.",
  org_internal:
    "Your OAuth consent screen is set to 'Internal' — change it to External in Google Auth Platform, then connect again.",
};

/**
 * Google redirects back here after consent. We exchange the code for a
 * refresh token (stored on the user's row), then INSTANTLY re-submit the
 * user's recent URLs through the Indexing API — so connecting produces
 * visible "ok" results within seconds, not after manual retries.
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
    const friendly = googleError
      ? FRIENDLY_ERRORS[googleError] ??
        `Google sign-in did not finish (${googleError})`
      : "No authorization code received";
    return back(`?google=error&reason=${encodeURIComponent(friendly)}`);
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

    // ---- INSTANT WIN: auto-submit the most recent URLs right now ----------
    // The user just authorized us; firing the first submissions immediately
    // proves the lane works and matches the "connected in 1 minute" feeling
    // competitors sell — without any manual retry.
    try {
      const recent = await db.submission.findMany({
        where: {
          userId: session.id,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, url: true },
      });
      await Promise.allSettled(
        recent.map(async (s) => {
          const res = await publishViaUserAccount(s.url, session.id);
          if (!res) return;
          await db.submissionResult
            .create({
              data: {
                submissionId: s.id,
                engine: "google",
                status: res.ok ? "success" : "failed",
                httpStatus: res.httpStatus ?? null,
                message: res.ok
                  ? res.message
                  : `Instant retry after connect — ${res.message}`,
                accountLabel: "Your Google account",
              },
            })
            .catch(() => undefined);
        })
      );
    } catch {
      /* best-effort — never block the redirect */
    }

    return back("?google=connected");
  } catch (e) {
    return back(
      `?google=error&reason=${encodeURIComponent(
        e instanceof Error ? e.message : "Token exchange failed"
      )}`
    );
  }
}
