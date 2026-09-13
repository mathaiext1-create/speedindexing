import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Removes the stored Google refresh token and resets cached host lanes. */
export async function POST() {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  await db.googleConnection
    .deleteMany({ where: { userId: user.id } })
    .catch(() => undefined);
  await db.hostLane
    .deleteMany({ where: { userId: user.id } })
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}
