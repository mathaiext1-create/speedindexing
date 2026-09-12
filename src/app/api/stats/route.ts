import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

export async function GET() {
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [total, today, groupByEngine, activeAccounts, keyCount, bingConfig] =
    await Promise.all([
      db.submission.count(),
      db.submission.count({ where: { createdAt: { gte: startOfDay } } }),
      db.submissionResult.groupBy({
        by: ["engine", "status"],
        _count: { _all: true },
      }),
      db.serviceAccount.count({ where: { isActive: true } }),
      db.indexNowKey.count(),
      db.bingConfig.findFirst(),
    ]);

  const engines: Record<
    string,
    { success: number; failed: number; skipped: number }
  > = {};
  for (const row of groupByEngine) {
    engines[row.engine] ??= { success: 0, failed: 0, skipped: 0 };
    engines[row.engine][row.status as "success" | "failed" | "skipped"] =
      row._count._all;
  }

  const success = Object.values(engines).reduce((a, e) => a + e.success, 0);
  const failed = Object.values(engines).reduce((a, e) => a + e.failed, 0);

  return NextResponse.json({
    total,
    today,
    engines,
    successRate: success + failed > 0 ? Math.round((success / (success + failed)) * 100) : null,
    pipeline: {
      googleAccounts: activeAccounts,
      googleDailyQuota: activeAccounts * 200,
      indexnowReady: keyCount > 0,
      bingReady: !!bingConfig,
    },
  });
}
