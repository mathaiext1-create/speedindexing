import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Toggle active state. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { isActive?: boolean };
  const account = await db.serviceAccount.update({
    where: { id },
    data: { isActive: body.isActive ?? true },
  });
  return NextResponse.json({ ok: true, isActive: account.isActive });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;
  const { id } = await ctx.params;
  await db.serviceAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
