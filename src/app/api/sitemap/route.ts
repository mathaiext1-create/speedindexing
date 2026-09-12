import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";

const MAX_URLS = 1000;

/** Fetch a sitemap (or sitemap index) and extract page URLs. */
async function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    locs.push(m[1]);
    if (locs.length >= MAX_URLS * 2) break;
  }
  return locs;
}

export async function POST(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = (await req.json().catch(() => ({}))) as { sitemapUrl?: string };
  const sitemapUrl = body.sitemapUrl?.trim();
  if (!sitemapUrl || !/^https?:\/\//i.test(sitemapUrl)) {
    return NextResponse.json(
      { error: "Provide a valid sitemap URL (https://…/sitemap.xml)" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(sitemapUrl, {
      headers: { "User-Agent": "SpeedIndexing/1.0 (SitemapFetcher)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Sitemap request failed (HTTP ${res.status})` },
        { status: 400 }
      );
    }
    const xml = await res.text();

    let urls: string[] = [];
    if (/<sitemapindex/i.test(xml)) {
      // Sitemap index → fetch child sitemaps (max 10, depth 1)
      const childSitemaps = (await extractLocs(xml)).filter((u) =>
        /\.xml(\.gz)?$/i.test(u)
      );
      const childLocs = await Promise.all(
        childSitemaps.slice(0, 10).map(async (child) => {
          try {
            const r = await fetch(child, {
              headers: { "User-Agent": "SpeedIndexing/1.0 (SitemapFetcher)" },
              signal: AbortSignal.timeout(15_000),
            });
            return r.ok ? extractLocs(await r.text()) : [];
          } catch {
            return [];
          }
        })
      );
      urls = childLocs.flat();
    } else {
      urls = await extractLocs(xml);
    }

    // Keep only page URLs, dedupe, cap
    const unique = Array.from(
      new Set(
        urls.filter(
          (u) => /^https?:\/\//i.test(u) && !/\.xml(\.gz)?$/i.test(u)
        )
      )
    ).slice(0, MAX_URLS);

    return NextResponse.json({ urls: unique, count: unique.length });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Failed to fetch sitemap",
      },
      { status: 400 }
    );
  }
}
