import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import {
  oauthConfigured,
  hasGoogleConnection,
  metadataViaUserAccount,
  resolveOrigin,
} from "@/lib/google-oauth";
import { checkGooglePermission, checkIndexStatus } from "@/lib/engines/google";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type DiagStep = {
  id: string;
  label: string;
  /** true = pass · false = blocking problem · null = warning/could not check */
  ok: boolean | null;
  detail: string;
  fixLabel?: string;
  fixUrl?: string;
};

/**
 * THE "why is my URL not indexed?" checklist, executed live:
 *  1. OAuth env keys present?
 *  2. Did the user actually press "Connect my Google account"?
 *  3. Is the connected account an Owner of this site (free metadata probe)?
 *  4. Service accounts (fallback lane) healthy?
 *  5. Does the page load for crawlers?
 *  6. Is a noindex tag forbidding indexing?
 *  7. Does robots.txt block the path?
 *  8. What does Google say about the URL right now?
 */
export async function POST(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  let parsed: URL;
  try {
    parsed = new URL(body.url ?? "");
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".")) {
      throw new Error("bad");
    }
  } catch {
    return NextResponse.json(
      { error: "Provide a valid http(s) URL" },
      { status: 400 }
    );
  }
  const url = parsed.toString();
  const toolOrigin = resolveOrigin(req);
  const steps: DiagStep[] = [];

  // 1. Deployment OAuth configuration
  steps.push({
    id: "oauth-env",
    label: "Google OAuth keys installed",
    ok: oauthConfigured(),
    detail: oauthConfigured()
      ? "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are set on this deployment"
      : "Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET in Vercel → Settings → Environment Variables (add BOTH, then Redeploy). The green setup card lists the 8 steps.",
  });

  // 2. Did the connect click actually happen?
  const connected = await hasGoogleConnection(user.id);
  steps.push({
    id: "oauth-connect",
    label: "Google account connected",
    ok: connected,
    detail: connected
      ? "Your Google account is authorized to submit URLs on your behalf"
      : "You have NOT completed 'Connect my Google account' yet — installing the keys changes nothing until you press the green button and click Allow at Google.",
    fixUrl: connected ? undefined : `${toolOrigin}/?open=connect`,
    fixLabel: connected ? undefined : "Press Connect my Google account",
  });

  // 3. Owner permission of the connected account (free metadata probe)
  if (connected) {
    const meta = await metadataViaUserAccount(url, user.id);
    if (meta && (meta.ok || meta.status === 404)) {
      steps.push({
        id: "owner",
        label: "Your account may submit this site (Owner)",
        ok: true,
        detail: meta.ok
          ? "Verified — Google's API already knows this URL (it was submitted before)"
          : "Verified — your connected account is a Search Console owner of this site. Instant submissions will succeed.",
      });
    } else if (meta && meta.status === 403) {
      steps.push({
        id: "owner",
        label: "Your account may submit this site (Owner)",
        ok: false,
        detail: `Google rejected the probe (403): the connected account is NOT a verified owner of ${parsed.host} in Search Console. Open Search Console with the SAME Google account, Add property (Domain or URL prefix), complete verification, then press Retry. This is Google's hard rule — no tool on earth can skip it.`,
        fixLabel: "Open Search Console",
        fixUrl: "https://search.google.com/search-console",
      });
    } else {
      steps.push({
        id: "owner",
        label: "Your account may submit this site (Owner)",
        ok: null,
        detail:
          "Could not verify right now (transient network/token error) — try again in a minute, or Disconnect + Connect to refresh the saved token.",
      });
    }
  }

  // 4. Service-account fallback lane
  const sas = await db.serviceAccount.findMany({
    where: { isActive: true, userId: user.id },
    take: 3,
    orderBy: { lastUsedAt: "asc" },
  });
  if (!connected && sas.length > 0) {
    for (const sa of sas) {
      const r = await checkGooglePermission(url, sa);
      steps.push({
        id: `sa-${sa.id}`,
        label: `Service account "${sa.label}"`,
        ok: r.ok,
        detail: r.message,
      });
    }
  }

  // 5+6. Page reachable + noindex
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
    });
    steps.push({
      id: "reachable",
      label: "Page loads for crawlers",
      ok: res.ok,
      detail: res.ok
        ? `HTTP ${res.status} — the page is reachable`
        : `HTTP ${res.status} — Google cannot index a page that doesn't load. Fix the server, firewall, or password protection first.`,
      fixUrl: res.ok ? undefined : url,
      fixLabel: res.ok ? undefined : "Open the page in an incognito window",
    });

    const xRobots = res.headers.get("x-robots-tag") || "";
    let noindexed = /noindex/i.test(xRobots);
    if (!noindexed && res.ok) {
      const html = (await res.text()).slice(0, 300_000);
      noindexed = /<meta[^>]+name\s*=\s*["']robots["'][^>]+noindex/i.test(html);
    }
    steps.push({
      id: "noindex",
      label: "No 'noindex' blocking Google",
      ok: !noindexed,
      detail: noindexed
        ? "This page carries a noindex directive (meta tag or X-Robots-Tag header) — Google is FORBIDDEN from indexing it. No submission tool can override this. Remove the tag (or the header) first."
        : "No noindex directive found — Google is allowed to index this page.",
    });
  } catch {
    steps.push({
      id: "reachable",
      label: "Page loads for crawlers",
      ok: false,
      detail:
        "The page did not respond within 10s (timeout / DNS / firewall / SSL). Google cannot index what it cannot fetch — fix the site first.",
      fixUrl: url,
      fixLabel: "Open the page in an incognito window",
    });
  }

  // 7. robots.txt
  try {
    const rres = await fetch(`${parsed.origin}/robots.txt`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (rres.ok) {
      const blocked = robotsBlocks(await rres.text(), parsed.pathname);
      steps.push({
        id: "robots",
        label: "robots.txt allows Google",
        ok: !blocked,
        detail: blocked
          ? `robots.txt has a Disallow rule matching ${parsed.pathname} for all agents — remove it so Googlebot can crawl.`
          : "robots.txt has no blanket Disallow matching this path.",
      });
    } else {
      steps.push({
        id: "robots",
        label: "robots.txt allows Google",
        ok: null,
        detail: `robots.txt returned HTTP ${rres.status} — no robots.txt is fine (everything allowed by default).`,
      });
    }
  } catch {
    steps.push({
      id: "robots",
      label: "robots.txt allows Google",
      ok: null,
      detail: "Could not fetch robots.txt — skipped.",
    });
  }

  // 8. Live Google status
  const st = await checkIndexStatus(url, user.id);
  steps.push({
    id: "google-status",
    label: "Live Google status",
    ok: st.submitted === null ? null : st.submitted,
    detail: st.message,
    fixUrl: st.siteSearchUrl,
    fixLabel: "Open site: search to verify manually",
  });

  return NextResponse.json({ url, steps });
}

/** Minimal robots.txt parser: blanket `User-agent: *` rules vs this path. */
function robotsBlocks(txt: string, path: string): boolean {
  type Group = { agents: string[]; allow: string[]; disallow: string[] };
  const groups: Group[] = [];
  let cur: Group | null = null;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || cur.allow.length || cur.disallow.length) {
        cur = { agents: [], allow: [], disallow: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === "allow" || key === "disallow") && val) {
      cur[key].push(val);
    }
  }
  let blocked = false;
  for (const g of groups) {
    if (!g.agents.includes("*")) continue;
    const dis = g.disallow
      .filter((d) => d === "/" || path.startsWith(d))
      .sort((a, b) => b.length - a.length)[0];
    const allow = g.allow
      .filter((d) => path.startsWith(d))
      .sort((a, b) => b.length - a.length)[0];
    if (dis && (!allow || allow.length < dis.length)) blocked = true;
  }
  return blocked;
}
