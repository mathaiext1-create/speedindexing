import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { testBingKey } from "@/lib/engines/bing";

export async function GET() {
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;
  const config = await db.bingConfig.findFirst();
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
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;
  const body = (await req.json().catch(() => ({}))) as { apiKey?: string };
  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "apiKey required" }, { status: 400 });
  }
  await db.bingConfig.upsert({
    where: { id: "bing" },
    update: { apiKey },
    create: { id: "bing", apiKey },
  });
  return NextResponse.json({ ok: true });
}

/** Test the saved (or provided) Bing API key. */
export async function POST(req: NextRequest) {
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;
  const body = (await req.json().catch(() => ({}))) as { apiKey?: string };
  const config = await db.bingConfig.findFirst();
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
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;
  await db.bingConfig.deleteMany({});
  return NextResponse.json({ ok: true });
}
