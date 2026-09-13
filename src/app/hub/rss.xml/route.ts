import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { isHubEnabled } from "@/lib/hub";

export const dynamic = "force-dynamic";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** RSS feed of the newest hub URLs — another constantly-polled crawl surface. */
export async function GET() {
  if (!isHubEnabled()) return new NextResponse("Hub disabled", { status: 404 });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db.submission.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, url: true, host: true, createdAt: true },
  });

  const h = await headers();
  const reqHost = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "https";
  const host = reqHost ? `${proto}://${reqHost}` : "";

  const items = rows
    .map(
      (r) => `    <item>
      <title>${escapeXml(r.host)} — new URL</title>
      <link>${host}/hub/u/${r.id}</link>
      <guid isPermaLink="true">${host}/hub/u/${r.id}</guid>
      <pubDate>${new Date(r.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(r.url)}</description>
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>SpeedIndexing Discovery Hub</title>
    <link>${host}/hub</link>
    <description>Freshly submitted URLs waiting to be crawled</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
