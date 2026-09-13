import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { testBingKey } from "@/lib/engines/bing";

export async function GET() {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const config = await db.bingConfig.findFirst({ where: { userId: user.id } });
  return NextResponse.json({
    configured: !!config,
    apiKeyMasked: config
      ? `${config.apiKey.slice(0, 6)}••••••••${config.apiKey.slice(-4)}`
      : null,
    updatedAt: config?.updatedAt ?? null,
  });
}

/** Save Bing Webmaster API key. */
export async function PUT(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = (await req.json().catch(() => ({}))) as { apiKey?: string };
  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "apiKey required" }, { status: 400 });
  }

  const existing = await db.bingConfig.findFirst({
    where: { userId: user.id },
  });
  if (existing) {
    await db.bingConfig.update({ where: { id: existing.id }, data: { apiKey } });
  } else {
    await db.bingConfig.create({ data: { userId: user.id, apiKey } });
  }
  return NextResponse.json({ ok: true });
}

/** Test the saved (or provided) Bing API key. */
export async function POST(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = (await req.json().catch(() => ({}))) as { apiKey?: string };
  const config = await db.bingConfig.findFirst({
    where: { userId: user.id },
  });
  const apiKey = body.apiKey?.trim() || config?.apiKey;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key configured yet" },
      { status: 400 }
    );
  }
  const result = await testBingKey(apiKey);
  return NextResponse.json(result);
}

export async function DELETE() {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  await db.bingConfig.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
