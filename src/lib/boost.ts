import { db } from "@/lib/db";
import { runDiscovery } from "@/lib/engines/discovery";

/**
 * Self-repeating Boost.
 *
 * URLs submitted through the Boost lane (no Google Owner permission) are
 * re-fired automatically on a schedule so crawlers keep seeing fresh
 * signals until the URL is indexed:
 *
 *  - Dashboard sweep  — every time the user opens the app (throttled to
 *    once per SWEEP_MIN_INTERVAL_MS per user, server-side).
 *  - Vercel cron      — daily /api/cron/boost re-boosts for ALL users,
 *    so boosting continues even when nobody logs in.
 *
 * A URL is eligible for re-boost when:
 *  - it was boosted within the last BOOST_LIFETIME_DAYS, and
 *  - its most recent Boost fire is older than URL_REBOOST_INTERVAL_MS.
 */

export const SWEEP_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // per-user sweep throttle: 6h
export const URL_REBOOST_INTERVAL_MS = 24 * 60 * 60 * 1000; // per-URL re-fire: 24h
export const BOOST_LIFETIME_DAYS = 14;

export type SweepResult = {
  reboosted: number;
  throttled: boolean;
  nextEligibleAt?: string;
  checked: number;
};

function mapPool<T, R>(
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
  return Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  ).then(() => results);
}

/**
 * Re-fire the Boost engine for one user's stale boosted URLs.
 * Returns how many URLs were re-boosted (0 when throttled).
 */
export async function sweepUser(
  userId: string,
  cap = 15
): Promise<SweepResult> {
  const since = new Date(Date.now() - BOOST_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  const reboostBefore = new Date(Date.now() - URL_REBOOST_INTERVAL_MS);

  // Boosted submissions = those with at least one discovery (Boost) result
  const candidates = await db.submission.findMany({
    where: {
      userId,
      createdAt: { gte: since },
      results: { some: { engine: "discovery" } },
    },
    include: { results: { where: { engine: "discovery" }, orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  // Sweep-level throttle: if the newest boost fire of any URL in this
  // window is younger than SWEEP_MIN_INTERVAL_MS, nothing to do yet.
  const fireTimes = candidates
    .map((s) => s.results[0]?.createdAt)
    .filter((t): t is Date => !!t)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const newestFire = fireTimes[0];
  if (newestFire && new Date(newestFire).getTime() > Date.now() - SWEEP_MIN_INTERVAL_MS) {
    return {
      reboosted: 0,
      throttled: true,
      checked: candidates.length,
      nextEligibleAt: new Date(
        new Date(newestFire).getTime() + SWEEP_MIN_INTERVAL_MS
      ).toISOString(),
    };
  }

  const eligible = candidates
    .filter((s) => {
      const latest = s.results[0]?.createdAt;
      return !latest || new Date(latest) <= reboostBefore;
    })
    .slice(0, cap);

  if (eligible.length === 0) {
    return { reboosted: 0, throttled: false, checked: candidates.length };
  }

  const fired = await mapPool(eligible, 4, async (s) => {
    try {
      const res = await runDiscovery(s.url);
      await db.submissionResult.create({
        data: {
          submissionId: s.id,
          engine: res.engine,
          status: res.status,
          httpStatus: res.httpStatus ?? null,
          message: `Auto re-boost — ${res.message}`,
          accountLabel: res.accountLabel ?? null,
        },
      });
      return true;
    } catch {
      return false;
    }
  });

  return { reboosted: fired.filter(Boolean).length, throttled: false, checked: candidates.length };
}

/** Cron entry point: re-boost for every user with recent boosted URLs. */
export async function sweepAllUsers(capPerUser = 10): Promise<{
  users: number;
  reboosted: number;
}> {
  const since = new Date(Date.now() - BOOST_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db.submission.findMany({
    where: {
      createdAt: { gte: since },
      results: { some: { engine: "discovery" } },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  let reboosted = 0;
  for (const row of rows) {
    if (!row.userId) continue;
    try {
      const r = await sweepUser(row.userId, capPerUser);
      reboosted += r.reboosted;
    } catch {
      /* keep sweeping other users */
    }
  }
  return { users: rows.length, reboosted };
}
