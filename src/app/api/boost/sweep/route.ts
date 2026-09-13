import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { sweepUser } from "@/lib/boost";

export const maxDuration = 60;

/**
 * Automatic Boost sweep — called when the user opens the dashboard.
 * Server-side throttled to once per 6h; re-fires the Boost engine for
 * every eligible URL (last fired > 24h ago, within the 14-day window).
 */
export async function POST() {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  try {
    const result = await sweepUser(user.id, 15);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Boost sweep failed" },
      { status: 500 }
    );
  }
}
