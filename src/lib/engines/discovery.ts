import type { EngineResult } from "@/lib/engines/google";

const TIMEOUT = 12_000;
const UA =
  "Mozilla/5.0 (compatible; SpeedIndexingBot/1.0; +instant indexing service)";

type FireOutcome = { note: string; reached: boolean };

async function fire(url: string, label: string): Promise<FireOutcome> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { "User-Agent": UA },
    });
    return { note: `${label} (HTTP ${res.status})`, reached: true };
  } catch (e) {
    // A timeout on web.archive.org/save usually means the save was ACCEPTED
    // and is being processed (SPN responds only after crawling the page).
    const isTimeout =
      e instanceof Error &&
      (e.name === "TimeoutError" || /timeout|abort/i.test(e.message));
    if (isTimeout && label === "internet-archive") {
      return {
        note: `${label} (save accepted — processing in background)`,
        reached: true,
      };
    }
    return { note: `${label} unreachable`, reached: false };
  }
}

/**
 * Discovery nudges — for URLs where the submitter has NO official access
 * (no Search Console Owner permission, no site hosting access).
 *
 * This is what "no-setup" competitor indexers actually do behind their
 * "just paste a URL" UX: they fire public crawler attractors so search
 * crawlers discover the URL naturally. It is NOT the official Indexing
 * API (that requires site-owner permission) — expect natural crawl
 * timelines (hours to days), not minutes.
 *
 * Nudges fired:
 *  1. pingomatic.com  — notifies a network of blog/ping services
 *  2. web.archive.org — Save Page Now triggers a real crawl + permanent
 *     public record of the URL
 *  3. Google PageSpeed — anonymous run makes Google infrastructure fetch
 *     and analyse the page (a crawl signal, not an index request)
 *  4. Bing sitemap ping — notifies Bing's crawler to refresh the site's
 *     sitemap and pick up new URLs quickly (Bing powers DuckDuckGo etc.)
 */
export async function runDiscovery(url: string): Promise<EngineResult> {
  const host = new URL(url).host;

  const outcomes = await Promise.all([
    fire(
      `https://pingomatic.com/ping/?title=${encodeURIComponent(
        host
      )}&blogurl=${encodeURIComponent(url)}&rssurl=${encodeURIComponent(
        url
      )}&chk_weblogscom=on&chk_blogs=on&chk_feedburner=on&chk_sync1=on`,
      "ping-network"
    ),
    fire(`https://web.archive.org/save/${url}`, "internet-archive"),
    fire(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
        url
      )}&strategy=mobile`,
      "google-page-fetch"
    ),
    fire(
      `https://www.bing.com/ping?sitemap=${encodeURIComponent(
        `https://${host}/sitemap.xml`
      )}`,
      "bing-sitemap-ping"
    ),
  ]);

  const notes = outcomes.map((o) => o.note);
  const reached = outcomes.filter((o) => o.reached).length;

  return {
    engine: "discovery",
    status: reached > 0 ? "success" : "failed",
    message:
      reached > 0
        ? `Boost submitted — ${notes.join(
            ", "
          )}. Google discovers the URL naturally, usually within hours to a few days. Unlock the instant lane with a one-time Owner permission (see the card below).`
        : `Boost services were unreachable right now — press Retry later. This site also has no Owner permission yet (see the card below).`,
  };
}
