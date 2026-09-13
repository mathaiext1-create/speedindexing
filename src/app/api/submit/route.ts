import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { runSubmission, type EngineFlags } from "@/lib/submit";

// Allow long batches on Vercel (Hobby supports up to 60s with fluid compute)
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = (await req.json().catch(() => ({}))) as {
    urls?: string;
    engines?: Partial<EngineFlags>;
  };
  const engines: EngineFlags = {
    google: body.engines?.google ?? true,
    indexnow: body.engines?.indexnow ?? true,
    bing: body.engines?.bing ?? false,
  };
  if (!body.urls || !body.urls.trim()) {
    return NextResponse.json(
      { error: "Paste at least one URL" },
      { status: 400 }
    );
  }

  try {
    const origin =
      req.headers.get("x-forwarded-host") || req.headers.get("host")
        ? `${req.headers.get("x-forwarded-proto") || "https"}://${
            req.headers.get("x-forwarded-host") || req.headers.get("host")
          }`
        : null;
    const { summary } = await runSubmission(
      body.urls,
      engines,
      user.id,
      "manual",
      origin
    );
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Submission failed" },
      { status: 400 }
    );
  }
}
