import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { generateIndexNowKey } from "@/lib/engines/indexnow";

export async function GET() {
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;
  const keys = await db.indexNowKey.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ keys });
}

/** Generate a new IndexNow key. */
export async function POST(req: NextRequest) {
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;
  const body = (await req.json().catch(() => ({}))) as { label?: string };
  const key = await db.indexNowKey.create({
    data: { key: generateIndexNowKey(), label: body.label?.trim() || null },
  });
  return NextResponse.json({ key });
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await db.indexNowKey.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
