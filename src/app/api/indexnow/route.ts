import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { generateIndexNowKey } from "@/lib/engines/indexnow";

export async function GET() {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const keys = await db.indexNowKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ keys });
}

/** Generate a new IndexNow key. */
export async function POST(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = (await req.json().catch(() => ({}))) as { label?: string };
  const key = await db.indexNowKey.create({
    data: {
      userId: user.id,
      key: generateIndexNowKey(),
      label: body.label?.trim() || null,
    },
  });
  return NextResponse.json({ key });
}

export async function DELETE(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const owned = await db.indexNowKey.findFirst({
    where: { id, userId: user.id },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.indexNowKey.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
