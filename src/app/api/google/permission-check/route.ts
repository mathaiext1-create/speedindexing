import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { checkGooglePermission } from "@/lib/engines/google";

/**
 * Check whether the user's active service accounts have Search Console
 * owner permission for a given site — without consuming any quota.
 */
export async function POST(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const raw = body.url?.trim();
  if (!raw) {
    return NextResponse.json(
      { error: "Enter your site URL first" },
      { status: 400 }
    );
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const accounts = await db.serviceAccount.findMany({
    where: { isActive: true, userId: user.id },
    orderBy: { lastUsedAt: "asc" },
  });
  if (accounts.length === 0) {
    return NextResponse.json(
      {
        error:
          "No active service account — add one in the Engines tab first",
      },
      { status: 400 }
    );
  }

  const results = await Promise.all(
    accounts.map(async (a) => ({
      label: a.label,
      clientEmail: a.clientEmail,
      ...(await checkGooglePermission(url.toString(), {
        id: a.id,
        label: a.label,
        clientEmail: a.clientEmail,
        privateKey: a.privateKey,
      })),
    }))
  );

  return NextResponse.json({ url: url.toString(), results });
}
