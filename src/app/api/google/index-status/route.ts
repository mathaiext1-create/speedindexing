import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { checkIndexStatus } from "@/lib/engines/google";

export const maxDuration = 60;

/**
 * Live "submitted to Google or not?" verification for one URL.
 * Free (zero publish quota): uses the official urlNotifications/metadata
 * endpoint when a service account has permission, with a public
 * site:-search fallback, and always returns a manual verification link.
 */
export async function POST(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  if (!body.url || !/^https?:\/\//i.test(body.url)) {
    return NextResponse.json({ error: "A valid url is required" }, { status: 400 });
  }

  try {
    const status = await checkIndexStatus(body.url, user.id);
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Index status check failed" },
      { status: 500 }
    );
  }
}
