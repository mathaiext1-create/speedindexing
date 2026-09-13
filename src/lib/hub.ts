import { db } from "@/lib/db";
import { submitToGoogle, classifyHosts } from "@/lib/engines/google";

/**
 * Discovery Hub — the competitor mechanism, made honest.
 *
 * Every submitted URL is published on the tool's OWN domain:
 *   /hub          — list of recently submitted URLs (public, crawlable)
 *   /hub/u/<id>   — a dedicated crawlable page per URL (dofollow link)
 *   /hub/sitemap.xml — sitemap of hub pages (pinged to Bing on submit)
 *   /hub/rss.xml  — RSS feed of the newest URLs
 *
 * Why this works: the hub lives on a domain the TOOL OWNER controls and
 * can verify once in Search Console. Google crawls a stable, frequently
 * updated hub constantly, so every URL listed there gets discovered
 * fast — even when the END USER never sets up any permissions. If a
 * service account IS an Owner of the tool domain, each hub page is also
 * pushed directly through the Google Indexing API (legal — it's our
 * domain), which is exactly how "no-setup" competitor indexers achieve
 * near-instant discovery.
 */

export function isHubEnabled(): boolean {
  const flag = (process.env.HUB_PUBLIC ?? "on").toLowerCase();
  return !["off", "false", "0", "no"].includes(flag);
}

/** Best-known public origin of this deployment (Vercel-aware). */
export function hubOrigin(): string | null {
  const explicit =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;
  if (!explicit) return null;
  const withScheme = /^https?:\/\//i.test(explicit)
    ? explicit
    : `https://${explicit}`;
  try {
    return new URL(withScheme).origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function hubUrlFromRequest(req: { headers: { get(name: string): string | null } }, path = "/hub"): string | null {
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host) return hubOrigin();
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}${path}`;
}

// Throttle the Bing sitemap ping to once per hour per serverless instance
let lastBingHubPing = 0;

/** Ping Bing's ever-working sitemap ping with the hub sitemap. */
async function pingBingHub(origin: string): Promise<void> {
  if (Date.now() - lastBingHubPing < 60 * 60 * 1000) return;
  lastBingHubPing = Date.now();
  try {
    await fetch(
      `https://www.bing.com/ping?sitemap=${encodeURIComponent(`${origin}/hub/sitemap.xml`)}`,
      { signal: AbortSignal.timeout(8_000) }
    );
  } catch {
    /* best-effort */
  }
}

export type HubPublishResult = {
  hubPageUrl: string | null;
  googlePush: "submitted" | "skipped" | "failed" | "disabled";
  note: string;
};

/**
 * Publish one URL to the Discovery Hub and push the hub page through
 * the Indexing API when the tool domain is instant-laned for this user.
 * Never throws — hub is an amplifier, not a critical path.
 */
export async function publishToHub(
  submissionId: string,
  targetUrl: string,
  userId: string,
  origin: string | null
): Promise<HubPublishResult> {
  if (!isHubEnabled() || !origin) {
    return { hubPageUrl: null, googlePush: "disabled", note: "hub disabled" };
  }

  const hubPageUrl = `${origin}/hub/u/${submissionId}`;
  void pingBingHub(origin);

  // Push the hub page via the Indexing API when we own the hub domain.
  // classifyHosts uses the FREE metadata probe and caches the lane 24h,
  // so this costs zero quota on domains we don't own.
  try {
    const lanes = await classifyHosts([new URL(hubPageUrl).host], userId);
    if ((lanes.get(new URL(hubPageUrl).host) ?? "unknown") === "instant") {
      const res = await submitToGoogle(hubPageUrl, userId);
      if (res.status === "success") {
        return {
          hubPageUrl,
          googlePush: "submitted",
          note: "Published to the Discovery Hub and pushed to Google via the Indexing API",
        };
      }
      return {
        hubPageUrl,
        googlePush: "failed",
        note: "Published to the Discovery Hub — Indexing API push will retry automatically",
      };
    }
  } catch {
    /* lane probe failed — hub page is still published */
  }

  return {
    hubPageUrl,
    googlePush: "skipped",
    note: "Published to the Discovery Hub — crawlers will pick it up from there",
  };
}
