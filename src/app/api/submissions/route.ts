import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(5, Number(sp.get("limit") ?? "20")));
  const q = sp.get("q")?.trim() ?? "";
  const engine = sp.get("engine") ?? "";
  const status = sp.get("status") ?? "";

  const where: Record<string, unknown> = { userId: user.id };
  if (q) where.url = { contains: q };

  if (engine || status) {
    const resultFilter: Record<string, unknown> = {};
    if (engine) resultFilter.engine = engine;
    if (status) resultFilter.status = status;
    where.results = { some: resultFilter };
  }

  const [total, submissions] = await Promise.all([
    db.submission.count({ where }),
    db.submission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { results: true },
    }),
  ]);

  return NextResponse.json({ total, page, limit, submissions });
}

/** Clear ALL of the current user's history. */
export async function DELETE() {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  await db.submissionResult.deleteMany({
    where: { submission: { userId: user.id } },
  });
  await db.submission.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
