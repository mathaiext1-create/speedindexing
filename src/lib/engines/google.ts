import crypto from "crypto";
import { db } from "@/lib/db";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INDEXING_URL =
  "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE = "https://www.googleapis.com/auth/indexing";

export type EngineResult = {
  engine: "google" | "indexnow" | "bing";
  status: "success" | "failed" | "skipped";
  httpStatus?: number;
  message: string;
  accountLabel?: string;
};

type Account = {
  id: string;
  label: string;
  clientEmail: string;
  privateKey: string;
};

// In-memory access-token cache (per serverless instance)
const tokenCache = new Map<string, { token: string; exp: number }>();

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Sign a service-account JWT (RS256) and exchange it for an OAuth2 access
 * token. Implemented with node:crypto so no extra dependency is required.
 */
export async function getAccessToken(account: {
  clientEmail: string;
  privateKey: string;
}): Promise<string> {
  const cached = tokenCache.get(account.clientEmail);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
    })
  );
  const signatureInput = `${header}.${claim}`;

  let signature: string;
  try {
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(signatureInput);
    signature = signer.sign(
      account.privateKey.replace(/\\n/g, "\n"),
      "base64url"
    );
  } catch {
    throw new Error(
      "Invalid private_key in service account JSON — re-paste the whole file"
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signatureInput}.${signature}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `Token exchange failed (HTTP ${res.status})`
    );
  }
  tokenCache.set(account.clientEmail, {
    token: data.access_token,
    exp: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

/** Quick connectivity/credential test used by the Engines page. */
export async function testServiceAccount(
  account: Account
): Promise<{ ok: boolean; message: string }> {
  try {
    await getAccessToken(account);
    return {
      ok: true,
      message: "Credentials valid — access token issued by Google",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

function friendlyGoogleError(
  status: number,
  msg: string,
  clientEmail?: string
): string {
  if (status === 403 && /permission|denied|forbidden/i.test(msg)) {
    const email = clientEmail ? ` Robot email: ${clientEmail}.` : "";
    return (
      "Permission needed — one-time setup: open Google Search Console, select this site, " +
      "go to Settings → Users and permissions → Add user, and add the robot email below as Owner, " +
      "then press Retry." +
      email +
      " This is a PRIVATE setting — it does NOT make your site public."
    );
  }
  if (status === 429 || /quota/i.test(msg))
    return "Daily quota exceeded for this service account (200/day default) — add more accounts to rotate";
  if (status === 401)
    return "Authentication failed — token rejected, re-test the service account";
  if (status === 400)
    return `Bad request — ${msg} (check the URL is valid and publicly reachable)`;
  return msg || `HTTP ${status}`;
}

/**
 * Proactively check whether a service account has Search Console owner
 * permission for a given site URL, WITHOUT consuming a submission.
 * Uses the urlNotifications/metadata endpoint: 200/404 ⇒ access OK,
 * 403 ⇒ owner delegation missing.
 */
export async function checkGooglePermission(
  url: string,
  account: Account
): Promise<{ ok: boolean; message: string }> {
  try {
    const token = await getAccessToken(account);
    const res = await fetch(
      `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${encodeURIComponent(url)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (res.ok) {
      return {
        ok: true,
        message: `Permission OK — ${account.label} can index this site`,
      };
    }
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const raw = data.error?.message || `HTTP ${res.status}`;
    if (res.status === 404)
      return {
        ok: true,
        message: `Permission OK — ${account.label} can index this site (URL not submitted before)`,
      };
    if (res.status === 403)
      return {
        ok: false,
        message:
          friendlyGoogleError(403, raw, account.clientEmail) +
          ` [${account.label}]`,
      };
    return { ok: false, message: friendlyGoogleError(res.status, raw, account.clientEmail) };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}

/**
 * Submit one URL to the Google Indexing API.
 * Rotates through active service accounts; on quota errors it tries the next.
 */
export async function submitToGoogle(
  url: string,
  userId: string
): Promise<EngineResult> {
  const accounts = await db.serviceAccount.findMany({
    where: { isActive: true, userId },
    orderBy: { lastUsedAt: "asc" },
  });

  if (accounts.length === 0) {
    return {
      engine: "google",
      status: "skipped",
      message: "No service account configured",
    };
  }

  let lastError = "Unknown error";
  for (const account of accounts) {
    try {
      const token = await getAccessToken(account);
      const res = await fetch(INDEXING_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, type: "URL_UPDATED" }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json().catch(() => ({}))) as {
        urlNotificationMetadata?: {
          latestUpdate?: { notifyTime?: string };
        };
        error?: { message?: string; status?: string };
      };

      if (res.ok) {
        // Rotate: bump this account to the back of the queue
        await db.serviceAccount.update({
          where: { id: account.id },
          data: { lastUsedAt: new Date() },
        });
        return {
          engine: "google",
          status: "success",
          httpStatus: res.status,
          message: `Submitted — Google queued it${
            data.urlNotificationMetadata?.latestUpdate?.notifyTime
              ? ` at ${data.urlNotificationMetadata.latestUpdate.notifyTime}`
              : ""
          }`,
          accountLabel: account.label,
        };
      }

      const raw = data.error?.message || `HTTP ${res.status}`;
      lastError = friendlyGoogleError(res.status, raw, account.clientEmail);
      // Quota exhausted on this account → rotate to the next one
      if (res.status === 429 || (res.status === 403 && /quota/i.test(raw))) {
        continue;
      }
      return {
        engine: "google",
        status: "failed",
        httpStatus: res.status,
        message: lastError,
        accountLabel: account.label,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Network error";
      continue;
    }
  }

  return {
    engine: "google",
    status: "failed",
    message: `${lastError} (tried ${accounts.length} account${
      accounts.length > 1 ? "s" : ""
    })`,
  };
}
