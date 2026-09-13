import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import {
  oauthConfigured,
  oauthClientId,
  buildState,
  resolveOrigin,
  callbackUrl,
  INDEXING_SCOPE,
} from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/**
 * Kicks off "Sign in with Google" — redirects the user to Google's consent
 * screen requesting the Indexing API scope with offline access (refresh
 * token), so submissions work forever after ONE approval.
 */
export async function GET(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const origin = req.nextUrl.origin;

  if (!oauthConfigured()) {
    return NextResponse.redirect(`${origin}/?google=error&reason=${encodeURIComponent(
      "Google connect is not configured on this deployment yet — add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET (see the setup steps in the permission card)"
    )}`);
  }

  const params = new URLSearchParams({
    client_id: oauthClientId()!,
    redirect_uri: callbackUrl(resolveOrigin(req)),
    response_type: "code",
    scope: INDEXING_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: buildState(user.id),
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
