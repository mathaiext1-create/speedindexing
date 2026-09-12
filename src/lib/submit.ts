import { db } from "@/lib/db";
import { submitToGoogle, type EngineResult } from "@/lib/engines/google";
import { submitToIndexNow } from "@/lib/engines/indexnow";
import { submitToBing } from "@/lib/engines/bing";

export const MAX_URLS_PER_BATCH = 500;

export type EngineFlags = {
  google: boolean;
  indexnow: boolean;
  bing: boolean;
};

export type SubmitSummary = {
  total: number;
  duplicatesRemoved: number;
  engines: Record<string, { success: number; failed: number; skipped: number }>;
  sampleErrors: string[];
};

/** Parse raw textarea input into validated, deduped URLs. */
export function parseUrls(raw: string): {
  urls: string[];
  duplicatesRemoved: number;
  errors: string[];
} {
  const candidates = raw
    .split(/[\n,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const urls: string[] = [];
  const errors: string[] = [];
  let duplicatesRemoved = 0;

  for (const candidate of candidates) {
    let normalized = candidate;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    try {
      const u = new URL(normalized);
      if (!u.hostname.includes(".") || u.hostname.endsWith(".")) {
        throw new Error("invalid hostname");
      }
      const clean = u.toString();
      if (seen.has(clean)) {
        duplicatesRemoved++;
        continue;
      }
      seen.add(clean);
      urls.push(clean);
    } catch {
      errors.push(`Invalid URL skipped: ${candidate.slice(0, 120)}`);
    }
    if (urls.length >= MAX_URLS_PER_BATCH) {
      errors.push(
        `Batch limit reached (${MAX_URLS_PER_BATCH} URLs) — submit the rest in another batch`
      );
      break;
    }
  }

  return { urls, duplicatesRemoved, errors };
}

/** Small promise pool with bounded concurrency. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

export async function runSubmission(
  raw: string,
  engines: EngineFlags,
  source: "manual" | "sitemap" | "retry" = "manual"
): Promise<{ summary: SubmitSummary; submissionIds: string[] }> {
  const { urls, duplicatesRemoved, errors } = parseUrls(raw);
  if (urls.length === 0) {
    throw new Error(
      errors.length > 0
        ? errors.join(" · ")
        : "No valid URLs found — paste one URL per line"
    );
  }

  // Persist submissions
  const submissions = await Promise.all(
    urls.map((url) =>
      db.submission.create({
        data: {
          url,
          host: new URL(url).host,
          source,
        },
      })
    )
  );

  const resultRows: {
    submissionId: string;
    engine: string;
    status: string;
    httpStatus?: number;
    message?: string;
    accountLabel?: string;
  }[] = [];

  const summary: SubmitSummary = {
    total: urls.length,
    duplicatesRemoved,
    engines: {},
    sampleErrors: [...errors],
  };

  const enginesToRun = Object.entries(engines)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);

  for (const name of enginesToRun) {
    summary.engines[name] = { success: 0, failed: 0, skipped: 0 };
  }

  // --- Google: per-URL calls with rotation, bounded concurrency ---
  if (engines.google) {
    const googleResults = await mapPool(urls, 6, (url) => submitToGoogle(url));
    googleResults.forEach((result: EngineResult, idx: number) => {
      resultRows.push({
        submissionId: submissions[idx].id,
        engine: result.engine,
        status: result.status,
        httpStatus: result.httpStatus,
        message: result.message,
        accountLabel: result.accountLabel,
      });
      summary.engines.google[result.status]++;
      if (
        result.status === "failed" &&
        summary.sampleErrors.length < 5 &&
        result.message
      ) {
        summary.sampleErrors.push(`Google · ${result.message}`);
      }
    });
  }

  // --- IndexNow: batched per host ---
  if (engines.indexnow) {
    const indexNowResults = await submitToIndexNow(urls);
    for (const [url, result] of indexNowResults) {
      const submission = submissions[urls.indexOf(url)];
      if (!submission) continue;
      resultRows.push({
        submissionId: submission.id,
        engine: result.engine,
        status: result.status,
        httpStatus: result.httpStatus,
        message: result.message,
        accountLabel: result.accountLabel,
      });
      summary.engines.indexnow[result.status]++;
      if (
        result.status === "failed" &&
        summary.sampleErrors.length < 5 &&
        result.message
      ) {
        summary.sampleErrors.push(`IndexNow · ${result.message}`);
      }
    }
  }

  // --- Bing Webmaster: batched per site ---
  if (engines.bing) {
    const bingResults = await submitToBing(urls);
    for (const [url, result] of bingResults) {
      const submission = submissions[urls.indexOf(url)];
      if (!submission) continue;
      resultRows.push({
        submissionId: submission.id,
        engine: result.engine,
        status: result.status,
        httpStatus: result.httpStatus,
        message: result.message,
        accountLabel: result.accountLabel,
      });
      summary.engines.bing[result.status]++;
      if (
        result.status === "failed" &&
        summary.sampleErrors.length < 5 &&
        result.message
      ) {
        summary.sampleErrors.push(`Bing · ${result.message}`);
      }
    }
  }

  if (resultRows.length > 0) {
    await db.submissionResult.createMany({
      data: resultRows.map((r) => ({
        submissionId: r.submissionId,
        engine: r.engine,
        status: r.status,
        httpStatus: r.httpStatus ?? null,
        message: r.message ?? null,
        accountLabel: r.accountLabel ?? null,
      })),
    });
  }

  return { summary, submissionIds: submissions.map((s) => s.id) };
}
