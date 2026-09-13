import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { isHubEnabled } from "@/lib/hub";

export const dynamic = "force-dynamic";

/** Sitemap of the Discovery Hub detail pages (last 7 days, ≤1000 URLs). */
export async function GET() {
  if (!isHubEnabled()) return new NextResponse("Hub disabled", { status: 404 });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db.submission.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { id: true, url: true, createdAt: true },
  });

  const seen = new Set<string>();
  const urls = rows.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  const h = await headers();
  const reqHost = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "https";
  const host = reqHost ? `${proto}://${reqHost}` : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${host}/hub/u/${u.id}</loc>
    <lastmod>${new Date(u.createdAt).toISOString()}</lastmod>
    <changefreq>daily</changefreq>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
