import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { isHubEnabled } from "@/lib/hub";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discovery Hub — freshly submitted URLs",
  description:
    "Public discovery feed of URLs submitted through SpeedIndexing. Crawlers are welcome.",
  robots: { index: true, follow: true },
};

export default async function HubPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (!isHubEnabled()) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">Discovery Hub is disabled</h1>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const perPage = 100;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db.submission.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, url: true, host: true, createdAt: true },
  });

  // Deduplicate by URL (keep the newest submission of each)
  const seen = new Set<string>();
  const items = rows.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const slice = items.slice((page - 1) * perPage, page * perPage);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Discovery Hub</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Freshly submitted URLs waiting to be crawled. Search-engine bots
        re-check this page constantly — feeds:{" "}
        <a className="underline underline-offset-2" href="/hub/rss.xml">RSS</a>{" · "}
        <a className="underline underline-offset-2" href="/hub/sitemap.xml">Sitemap</a>
      </p>

      <ul className="mt-8 space-y-3">
        {slice.length === 0 && (
          <li className="text-sm text-zinc-500">
            Nothing here yet — submit URLs to populate the hub.
          </li>
        )}
        {slice.map((item) => (
          <li key={item.id} className="rounded-lg border border-zinc-800 p-3">
            <a
              href={item.url}
              className="text-sm font-medium text-emerald-400 hover:underline"
            >
              {item.url}
            </a>
            <p className="mt-1 text-xs text-zinc-500">
              {item.host} · added{" "}
              {new Date(item.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
              <Link className="underline underline-offset-2" href={`/hub/u/${item.id}`}>
                details
              </Link>
            </p>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <nav className="mt-8 flex gap-3 text-sm">
          {page > 1 && (
            <Link className="underline underline-offset-2" href={`/hub?page=${page - 1}`}>
              ← Newer
            </Link>
          )}
          {page < totalPages && (
            <Link className="underline underline-offset-2" href={`/hub?page=${page + 1}`}>
              Older →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
