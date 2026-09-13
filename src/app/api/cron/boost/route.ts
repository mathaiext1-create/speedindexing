import { NextRequest, NextResponse } from "next/server";
import { sweepAllUsers } from "@/lib/boost";

export const maxDuration = 60;

/**
 * Daily cron (vercel.json): self-repeating Boost for ALL users.
 * Vercel injects `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET
 * env var is set — verified when present, otherwise the endpoint is open
 * (it only re-fires already-submitted URLs and is heavily throttled).
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await sweepAllUsers(10);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cron boost failed" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
