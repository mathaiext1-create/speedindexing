import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * One-look deployment diagnostic: does the app reach its database?
 * Shows the masked connection target so a wrong DATABASE_URL in Vercel
 * is immediately visible (no credentials are ever returned).
 */
export async function GET() {
  const raw = process.env.DATABASE_URL || "";
  let target = "not set";
  const provider = raw.startsWith("postgres") ? "postgresql" : raw ? "sqlite" : "—";

  if (raw) {
    if (raw.startsWith("postgres")) {
      try {
        const u = new URL(raw);
        target = `${u.hostname}${u.port ? `:${u.port}` : ""}/${u.pathname.slice(1)}`;
      } catch {
        target = "unparseable URL — check for [YOUR-PASSWORD] placeholders";
      }
    } else {
      target = raw.replace(/file:/, "sqlite:");
    }
  }

  let dbOk = false;
  let dbError: string | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message : "unknown error";
  }

  return NextResponse.json(
    {
      status: dbOk ? "ok" : "degraded",
      database: {
        connected: dbOk,
        provider,
        target,
        error: dbError,
      },
      time: new Date().toISOString(),
    },
    { status: 200 }
  );
}
