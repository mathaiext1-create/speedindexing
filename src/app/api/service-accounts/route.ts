import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { testServiceAccount } from "@/lib/engines/google";

export async function GET() {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const accounts = await db.serviceAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      clientEmail: true,
      projectId: true,
      isActive: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ accounts });
}

/** Add a service account by pasting the raw JSON key file. */
export async function POST(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = (await req.json().catch(() => ({}))) as {
    json?: string;
    label?: string;
  };
  if (!body.json?.trim()) {
    return NextResponse.json(
      { error: "Paste the service-account JSON file content" },
      { status: 400 }
    );
  }

  let parsed: {
    client_email?: string;
    private_key?: string;
    project_id?: string;
  };
  try {
    parsed = JSON.parse(body.json);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON — paste the full service-account key file" },
      { status: 400 }
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    return NextResponse.json(
      {
        error:
          "Missing client_email or private_key — this doesn't look like a Google service-account key file",
      },
      { status: 400 }
    );
  }

  const existing = await db.serviceAccount.findFirst({
    where: { userId: user.id, clientEmail: parsed.client_email },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This service account is already added" },
      { status: 409 }
    );
  }

  const count = await db.serviceAccount.count({ where: { userId: user.id } });
  const account = await db.serviceAccount.create({
    data: {
      userId: user.id,
      label: body.label?.trim() || `SA-${count + 1}`,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
      projectId: parsed.project_id ?? null,
    },
  });

  // Immediately verify credentials work
  const test = await testServiceAccount({
    id: account.id,
    label: account.label,
    clientEmail: account.clientEmail,
    privateKey: account.privateKey,
  });

  return NextResponse.json({
    account: { id: account.id, label: account.label },
    test,
  });
}
