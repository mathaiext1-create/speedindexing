import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { isHubEnabled } from "@/lib/hub";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discovery Hub — URL details",
  robots: { index: true, follow: true },
};

export default async function HubDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isHubEnabled()) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">Discovery Hub is disabled</h1>
      </main>
    );
  }

  const { id } = await params;
  const submission = await db.submission.findUnique({
    where: { id },
    select: { id: true, url: true, host: true, createdAt: true },
  });

  if (!submission) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-zinc-400">
          This URL is not in the hub. <Link href="/hub" className="underline">Back to the hub</Link>.
        </p>
      </main>
    );
  }

  const path = (() => {
    try {
      const u = new URL(submission.url);
      return `${u.pathname}${u.search}` || "/";
    } catch {
      return "/";
    }
  })();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-xs uppercase tracking-wide text-zinc-500">
        <Link href="/hub" className="underline underline-offset-2">Discovery Hub</Link>
        {" "}/ {submission.host}
      </p>
      <h1 className="mt-3 text-xl font-semibold break-words">
        {submission.host} — {path}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-300">
        The page{" "}
        <a
          href={submission.url}
          className="font-medium text-emerald-400 underline underline-offset-2"
        >
          {submission.url}
        </a>{" "}
        was submitted for indexing via SpeedIndexing on{" "}
        {new Date(submission.createdAt).toISOString().slice(0, 10)}. It is
        listed here so search-engine crawlers can discover and index it
        quickly. Visit the link above to read the original content published
        by {submission.host}.
      </p>
      <p className="mt-6 text-xs text-zinc-500">
        Added {new Date(submission.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
        <Link href="/hub" className="underline underline-offset-2">all recent URLs</Link>
      </p>
    </main>
  );
}
