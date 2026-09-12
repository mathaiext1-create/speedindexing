import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { runSubmission, type EngineFlags } from "@/lib/submit";

export const maxDuration = 60;

/** Re-run a past submission — deletes old engine results and resubmits. */
export async function POST(req: NextRequest) {
  const unauthorized = await guard();
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => ({}))) as {
    submissionId?: string;
    engines?: Partial<EngineFlags>;
  };
  if (!body.submissionId) {
    return NextResponse.json({ error: "submissionId required" }, { status: 400 });
  }

  const submission = await db.submission.findUnique({
    where: { id: body.submissionId },
    include: { results: true },
  });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  // Default: retry engines that previously failed or were skipped
  let engines: EngineFlags;
  if (body.engines) {
    engines = {
      google: body.engines.google ?? false,
      indexnow: body.engines.indexnow ?? false,
      bing: body.engines.bing ?? false,
    };
  } else {
    const failedEngines = new Set(
      submission.results
        .filter((r) => r.status !== "success")
        .map((r) => r.engine)
    );
    engines = {
      google: failedEngines.has("google"),
      indexnow: failedEngines.has("indexnow"),
      bing: failedEngines.has("bing"),
    };
    if (!engines.google && !engines.indexnow && !engines.bing) {
      engines = { google: true, indexnow: true, bing: false };
    }
  }

  await db.submissionResult.deleteMany({
    where: { submissionId: submission.id },
  });

  try {
    const { summary } = await runSubmission(
      submission.url,
      engines,
      "retry"
    );
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Retry failed" },
      { status: 400 }
    );
  }
}
