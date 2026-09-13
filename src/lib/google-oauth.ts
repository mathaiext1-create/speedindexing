import crypto from "crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionSecret } from "@/lib/auth";

/**
 * "Sign in with Google" for the Indexing API — the mechanism paid instant
 * indexers use behind their one-click connect buttons.
 *
 * The user authorizes this app ONCE (scope: indexing). We store the OAuth
 * refresh token, and from then on every URL is published to the official
 * Google Indexing API through the user's OWN Google account — the account
 * that is already the verified owner of their site in Search Console.
 * No service accounts, no robot emails, no manual permission juggling.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const PUBLISH_URL =
  "https://indexing.googleapis.com/v3/urlNotifications:publish";
const METADATA_URL =
  "https://indexing.googleapis.com/v3/urlNotifications/metadata";

/** openid+email so we can show which account is connected; indexing to submit. */
export const INDEXING_SCOPE =
  "openid email https://www.googleapis.com/auth/indexing";

/* ---------------- env / config ---------------- */

export function oauthClientId(): string | null {
  return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || null;
}

export function oauthClientSecret(): string | null {
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || null;
}

/** True when the full server-side connect flow is configured. */
export function oauthConfigured(): boolean {
  return Boolean(oauthClientId() && oauthClientSecret());
}

/** Deployment origin (APP_URL wins, else forwarded headers, else request). */
export function resolveOrigin(req: NextRequest): string {
  const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) {
    const proto =
      req.headers.get("x-forwarded-proto") ||
      (host.startsWith("localhost") || host.startsWith("127.")
        ? "http"
        : "https");
    return `${proto}://${host}`;
  }
  return req.nextUrl.origin;
}

export function callbackUrl(origin: string): string {
  return `${origin}/api/google/oauth/callback`;
}

/* ---------------- signed state (CSRF protection) ---------------- */

function sign(value: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

export function buildState(userId: string): string {
  const body = `${userId}|${Date.now()}`;
  return Buffer.from(`${body}|${sign(body)}`).toString("base64url");
}

export function verifyState(
  state: string | null | undefined
): { userId: string } | null {
  if (!state) return null;
  try {
    const parts = Buffer.from(state, "base64url").toString().split("|");
    const [userId, ts, sig] = parts;
    if (!userId || !ts || !sig) return null;
    const expected = sign(`${userId}|${ts}`);
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return null;
    }
    if (Date.now() - Number(ts) > 10 * 60_000) return null; // 10-minute window
    return { userId };
  } catch {
    return null;
  }
}

/* ---------------- token plumbing ---------------- */

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(params: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json().catch(() => ({}))) as TokenResponse;
}

function decodeEmail(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1] ?? "", "base64").toString()
    );
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export type ExchangedTokens = {
  refreshToken: string;
  accessToken: string;
  expiresAt: Date;
  email: string | null;
};

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<ExchangedTokens> {
  const data = await tokenRequest(
    new URLSearchParams({
      code,
      client_id: oauthClientId() ?? "",
      client_secret: oauthClientSecret() ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    })
  );
  if (!data.access_token || !data.refresh_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        "Google did not return a refresh token — please retry and make sure you click Allow"
    );
  }
  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + ((data.expires_in ?? 3600) - 120) * 1000),
    email: decodeEmail(data.id_token),
  };
}

async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const data = await tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: oauthClientId() ?? "",
      client_secret: oauthClientSecret() ?? "",
      grant_type: "refresh_token",
    })
  );
  if (!data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        "Google token refresh failed — please press Connect Google again"
    );
  }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + ((data.expires_in ?? 3600) - 120) * 1000),
  };
}

export type GoogleUserToken = { accessToken: string; email: string | null };

/**
 * A valid access token for the user's connected Google account, refreshing
 * it transparently. Returns null when no connection exists.
 */
export async function getValidUserToken(
  userId: string
): Promise<GoogleUserToken | null> {
  const conn = await db.googleConnection.findUnique({ where: { userId } });
  if (!conn) return null;
  if (
    conn.accessToken &&
    conn.expiresAt &&
    new Date(conn.expiresAt).getTime() > Date.now() + 60_000
  ) {
    return { accessToken: conn.accessToken, email: conn.email };
  }
  const refreshed = await refreshAccessToken(conn.refreshToken);
  await db.googleConnection
    .update({
      where: { userId },
      data: { accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt },
    })
    .catch(() => undefined);
  return { accessToken: refreshed.accessToken, email: conn.email };
}

export async function hasGoogleConnection(userId: string): Promise<boolean> {
  try {
    return (
      (await db.googleConnection.count({ where: { userId } })) > 0
    );
  } catch {
    return false;
  }
}

/* ---------------- Indexing API through the user's account ---------------- */

export type UserPublishResult = {
  ok: boolean;
  httpStatus?: number;
  kind: "success" | "permission" | "quota" | "auth" | "error";
  message: string;
};

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Publish one URL via the user's own connected Google account.
 * Returns null when the user has no connection (caller falls back to
 * service accounts / boost).
 */
export async function publishViaUserAccount(
  url: string,
  userId: string
): Promise<UserPublishResult | null> {
  let token: GoogleUserToken | null = null;
  try {
    token = await getValidUserToken(userId);
  } catch {
    token = null;
  }
  if (!token) return null;

  try {
    const res = await fetch(PUBLISH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, type: "URL_UPDATED" }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      urlNotificationMetadata?: { latestUpdate?: { notifyTime?: string } };
      error?: { message?: string };
    };

    if (res.ok) {
      const when = data.urlNotificationMetadata?.latestUpdate?.notifyTime;
      return {
        ok: true,
        httpStatus: res.status,
        kind: "success",
        message:
          `Submitted to the Google Indexing API through your connected Google account${
            token.email ? ` (${token.email})` : ""
          }${when ? ` — acknowledged at ${when}` : ""}. ` +
          "Google typically crawls within minutes to hours — press Check to verify.",
      };
    }

    const raw = data.error?.message || `HTTP ${res.status}`;
    if (res.status === 403) {
      if (/quota/i.test(raw)) {
        return {
          ok: false,
          httpStatus: res.status,
          kind: "quota",
          message:
            "Daily Google Indexing API quota reached for today — URLs keep going through the Boost engine; try again tomorrow.",
        };
      }
      return {
        ok: false,
        httpStatus: res.status,
        kind: "permission",
        message:
          `Permission needed — Google says ${token.email ?? "your connected account"} is not a verified Owner of ${safeHost(url)} yet. ` +
          "Open search.google.com/search-console with that SAME Google account, make sure the property exists and is verified (Add property → follow the steps), then press Retry.",
      };
    }
    if (res.status === 401) {
      return {
        ok: false,
        httpStatus: res.status,
        kind: "auth",
        message:
          "Google rejected the saved connection — press Disconnect, then Connect Google again.",
      };
    }
    return {
      ok: false,
      httpStatus: res.status,
      kind: "error",
      message: raw,
    };
  } catch (e) {
    return {
      ok: false,
      kind: "error",
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}

/**
 * Free metadata probe via the user's account (zero publish quota).
 * 200 = submitted before · 404 = never submitted · 403 = no permission ·
 * null = no connection or transient failure.
 */
export async function metadataViaUserAccount(
  url: string,
  userId: string
): Promise<{ ok: boolean; status: number; latest?: { notifyTime?: string; type?: string } } | null> {
  let token: GoogleUserToken | null = null;
  try {
    token = await getValidUserToken(userId);
  } catch {
    token = null;
  }
  if (!token) return null;

  try {
    const res = await fetch(
      `${METADATA_URL}?url=${encodeURIComponent(url)}`,
      {
        headers: { Authorization: `Bearer ${token.accessToken}` },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        urlNotificationMetadata?: {
          latestUpdate?: { notifyTime?: string; type?: string };
        };
      };
      return {
        ok: true,
        status: 200,
        latest: data.urlNotificationMetadata?.latestUpdate,
      };
    }
    return { ok: false, status: res.status };
  } catch {
    return null;
  }
}
