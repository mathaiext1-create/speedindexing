import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { verifyKeyFile } from "@/lib/engines/indexnow";

/** Check that https://host/{key}.txt is live with the right content. */
export async function POST(req: NextRequest) {
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => ({}))) as {
    host?: string;
    keyId?: string;
  };
  if (!body.host) {
    return NextResponse.json({ error: "host required" }, { status: 400 });
  }

  const keyRecord = body.keyId
    ? await db.indexNowKey.findUnique({ where: { id: body.keyId } })
    : await db.indexNowKey.findFirst({ orderBy: { createdAt: "desc" } });
  if (!keyRecord) {
    return NextResponse.json(
      { error: "No IndexNow key generated yet" },
      { status: 400 }
    );
  }

  let host = body.host.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const result = await verifyKeyFile(host, keyRecord.key);
  return NextResponse.json(result);
}
