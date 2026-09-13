import { NextResponse } from "next/server";

/**
 * Public runtime config for the browser (no secrets — a Google OAuth
 * client ID is public by design). Read at runtime so the user can add
 * GOOGLE_OAUTH_CLIENT_ID in Vercel env vars without a rebuild.
 */
export async function GET() {
  return NextResponse.json({
    googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || null,
  });
}
