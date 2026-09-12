import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Toggle active state (own accounts only). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await guard();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { isActive?: boolean };

  const owned = await db.serviceAccount.findFirst({
    where: { id, userId: user.id },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const account = await db.serviceAccount.update({
    where: { id },
    data: { isActive: body.isActive ?? true },
  });
  return NextResponse.json({ ok: true, isActive: account.isActive });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const user = await guard();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;

  const owned = await db.serviceAccount.findFirst({
    where: { id, userId: user.id },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.serviceAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
