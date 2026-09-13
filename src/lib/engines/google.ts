import crypto from "crypto";
import { db } from "@/lib/db";
import {
  publishViaUserAccount,
  metadataViaUserAccount,
} from "@/lib/google-oauth";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INDEXING_URL =
  "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE = "https://www.googleapis.com/auth/indexing";

export type EngineResult = {
  engine: "google" | "indexnow" | "bing" | "discovery";
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
 * Per-host lane classification. For every unique host decide whether the
 * official instant lane is possible (robot is a verified Owner) or the URL
 * should go straight to the Boost lane (no permission).
 *
 * Uses the free urlNotifications/metadata GET — it consumes ZERO publish
 * quota. Results are cached in the HostLane table for 24h so repeated
 * submissions never re-probe or burn publish calls on a guaranteed 403.
 *
 * Returns a Map: host -> "instant" | "boost" | "unknown"
 * ("unknown" = probe failed transiently → caller should still try publish).
 */
export async function classifyHosts(
  hosts: string[],
  userId: string
): Promise<Map<string, "instant" | "boost" | "unknown">> {
  const result = new Map<string, "instant" | "boost" | "unknown">();
  const FRESH_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const unique = [...new Set(hosts)];
  const stale: string[] = [];

  await Promise.all(
    unique.map(async (host) => {
      try {
        const row = await db.hostLane.findUnique({
          where: { userId_host: { userId, host } },
        });
        if (row && now - new Date(row.checkedAt).getTime() < FRESH_MS) {
          result.set(host, row.lane === "instant" ? "instant" : "boost");
        } else {
          stale.push(host);
        }
      } catch {
        stale.push(host);
      }
    })
  );

  if (stale.length === 0) return result;

  const accounts = await db.serviceAccount.findMany({
    where: { isActive: true, userId },
    orderBy: { lastUsedAt: "asc" },
    take: 1,
  });

  await Promise.all(
    stale.map(async (host) => {
      // Preferred probe: the user's OWN connected Google account (one-click
      // instant lane). Its metadata response reflects the owner permission
      // of the account that actually verified the site.
      const viaUser = await metadataViaUserAccount(
        `https://${host}/`,
        userId
      );
      if (viaUser) {
        if (viaUser.ok || viaUser.status === 404) {
          result.set(host, "instant");
          await upsertHostLane(userId, host, "instant");
          return;
        }
        if (viaUser.status === 403) {
          result.set(host, "boost");
          await upsertHostLane(userId, host, "boost");
          return;
        }
        // 401/5xx → transient, fall through to the service-account probe
      }

      // No service account → instant lane impossible; boost only.
      if (accounts.length === 0) {
        result.set(host, "boost");
        return;
      }
      const account = accounts[0];
      try {
        const token = await getAccessToken(account);
        const res = await fetch(
          `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${encodeURIComponent(
            `https://${host}/`
          )}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15_000),
          }
        );
        if (res.ok || res.status === 404) {
          result.set(host, "instant");
          await upsertHostLane(userId, host, "instant");
        } else if (res.status === 403) {
          result.set(host, "boost");
          await upsertHostLane(userId, host, "boost");
        } else {
          result.set(host, "unknown"); // transient — don't cache
        }
      } catch {
        result.set(host, "unknown"); // network issue — don't cache
      }
    })
  );

  return result;
}

/** Cache a host's lane (best-effort — never throws). */
export async function upsertHostLane(
  userId: string,
  host: string,
  lane: "instant" | "boost"
): Promise<void> {
  try {
    await db.hostLane.upsert({
      where: { userId_host: { userId, host } },
      update: { lane, checkedAt: new Date() },
      create: { userId, host, lane },
    });
  } catch {
    /* cache is best-effort */
  }
}

/** Forget a host's cached lane (used after Connect Google fixes permission). */
export async function clearHostLane(userId: string, host: string): Promise<void> {
  try {
    await db.hostLane.deleteMany({ where: { userId, host } });
  } catch {
    /* best-effort */
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
  // --- Lane 0: the user's OWN connected Google account ------------------
  // This is the one-click path competitors use: the account that verified
  // the site in Search Console publishes directly. No robot emails.
  const viaUser = await publishViaUserAccount(url, userId);
  if (viaUser) {
    if (viaUser.ok) {
      return {
        engine: "google",
        status: "success",
        httpStatus: viaUser.httpStatus,
        message: viaUser.message,
        accountLabel: "Your Google account",
      };
    }
    // Permission wall → handled by submit.ts (auto-routes to Boost).
    // Other kinds (auth/quota/error) → surface immediately unless service
    // accounts exist as a fallback lane.
    const saFallback =
      (await db.serviceAccount.count({ where: { isActive: true, userId } })) > 0;
    if (!saFallback) {
      return {
        engine: "google",
        status: "failed",
        httpStatus: viaUser.httpStatus,
        message: viaUser.message,
        accountLabel: "Your Google account",
      };
    }
    // else: fall through and let service accounts try.
  }

  const accounts = await db.serviceAccount.findMany({
    where: { isActive: true, userId },
    orderBy: { lastUsedAt: "asc" },
  });

  if (accounts.length === 0) {
    return {
      engine: "google",
      status: "skipped",
      message:
        "Not submitted to the Google Indexing API — no service account and no connected Google account yet. " +
        "Press Connect Google in the permission card (ONE sign-in = instant lane) or add a service account in Engines. " +
        "The URL was auto-routed to the Boost engine (crawler attractors).",
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

export type IndexStatus = {
  /** true = submitted & acknowledged · false = never submitted · null = could not verify */
  submitted: boolean | null;
  when?: string;
  via: "api" | "search" | "none";
  message: string;
  siteSearchUrl: string;
};

/**
 * Live "did Google actually get this URL?" check.
 *
 * 1. Primary: the FREE urlNotifications/metadata endpoint (zero quota) —
 *    returns the last acknowledged submission time for the URL.
 * 2. Fallback (no permission / no account): best-effort `site:` search probe.
 * 3. If Google blocks the probe (common from datacenter IPs) → honest
 *    "unknown" with a one-click manual verification link.
 */
export async function checkIndexStatus(
  url: string,
  userId: string
): Promise<IndexStatus> {
  const siteSearchUrl = `https://www.google.com/search?q=site:${encodeURIComponent(
    url
  )}&filter=0`;

  // --- 1. Official metadata endpoint (free, no publish quota) ----------
  // 1a. The user's OWN connected Google account (one-click instant lane)
  const userMeta = await metadataViaUserAccount(url, userId);
  if (userMeta?.ok) {
    return {
      submitted: true,
      when: userMeta.latest?.notifyTime,
      via: "api",
      message: `Confirmed by Google — your connected account's Indexing API history shows this URL${
        userMeta.latest?.type ? ` (type: ${userMeta.latest.type})` : ""
      }. Google typically crawls it shortly after.`,
      siteSearchUrl,
    };
  }
  if (userMeta && userMeta.status === 404) {
    return {
      submitted: false,
      via: "api",
      message:
        "Verified via Google API with your connected account: this URL has never been submitted through the Indexing API. Press Retry to submit it now.",
      siteSearchUrl,
    };
  }
  // 1b. Service accounts
  const accounts = await db.serviceAccount.findMany({
    where: { isActive: true, userId },
    orderBy: { lastUsedAt: "asc" },
    take: 1,
  });

  if (accounts.length > 0) {
    try {
      const token = await getAccessToken(accounts[0]);
      const res = await fetch(
        `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${encodeURIComponent(url)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          urlNotificationMetadata?: {
            latestUpdate?: { notifyTime?: string; type?: string };
          };
        };
        const latest = data.urlNotificationMetadata?.latestUpdate;
        return {
          submitted: true,
          when: latest?.notifyTime,
          via: "api",
          message: `Confirmed by Google — the Indexing API acknowledged this URL${
            latest?.type ? ` (type: ${latest.type})` : ""
          }. Google typically crawls it shortly after.`,
          siteSearchUrl,
        };
      }
      if (res.status === 404) {
        return {
          submitted: false,
          via: "api",
          message:
            "Verified via Google API: this URL has never been submitted through the Indexing API. Press Retry to submit it now.",
          siteSearchUrl,
        };
      }
      // 403 / other → fall through to the public search probe
    } catch {
      /* fall through to search probe */
    }
  }

  // --- 2. Best-effort public `site:` search probe ---
  try {
    const res = await fetch(siteSearchUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (res.ok) {
      const html = await res.text();
      if (/\/sorry\//i.test(html) || /unusual traffic|captcha/i.test(html)) {
        // blocked — return honest unknown
      } else if (/did not match any documents|no results found/i.test(html)) {
        return {
          submitted: false,
          via: "search",
          message:
            "Verified via public search: Google does not list this URL yet. Press Retry to submit it, then check again in 24-48h.",
          siteSearchUrl,
        };
      } else if (/results? for|about .* results|id=\"search\"/i.test(html)) {
        return {
          submitted: true,
          via: "search",
          message:
            "Verified via public search: Google lists this URL — it is in Google's index.",
          siteSearchUrl,
        };
      }
    }
  } catch {
    /* fall through */
  }

  // --- 3. Honest unknown with manual link ---
  return {
    submitted: null,
    via: "none",
    message:
      "Automated verification was blocked by Google from this server (normal for datacenter IPs). Open the manual site: search to confirm in one click.",
    siteSearchUrl,
  };
}
