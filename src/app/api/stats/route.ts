import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

export async function GET() {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [total, today, groupByEngine, activeAccounts, keyCount, bingConfig] =
    await Promise.all([
      db.submission.count({ where: { userId: user.id } }),
      db.submission.count({
        where: { userId: user.id, createdAt: { gte: startOfDay } },
      }),
      db.submissionResult.groupBy({
        by: ["engine", "status"],
        where: { submission: { userId: user.id } },
        _count: { _all: true },
      }),
      db.serviceAccount.count({ where: { isActive: true, userId: user.id } }),
      db.indexNowKey.count({ where: { userId: user.id } }),
      db.bingConfig.findFirst({ where: { userId: user.id } }),
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
