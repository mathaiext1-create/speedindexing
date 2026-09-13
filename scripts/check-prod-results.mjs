// Check latest submission results in PRODUCTION (Neon) DB
import { SQL } from "bun";

const NEON = "postgresql://neondb_owner:npg_9WVm2MnNdLwq@ep-twilight-night-ay6dik7i-pooler.c-5.us-east-2.aws.neon.tech/neondb?options=endpoint%3Dep-twilight-night-ay6dik7i";
const db = new SQL(NEON, { max: 1, tls: true });

const recent = await db`
  SELECT sr.engine, sr.status, sr."httpStatus", left(sr.message, 130) AS msg, sr."createdAt", s.url
  FROM "SubmissionResult" sr JOIN "Submission" s ON s.id = sr."submissionId"
  ORDER BY sr."createdAt" DESC LIMIT 12
`;
console.log("=== 12 MOST RECENT PROD RESULTS (Neon) ===");
for (const r of recent) {
  console.log(`${r.createdAt.toISOString?.() ?? r.createdAt} | ${r.engine.padEnd(9)} | ${r.status.padEnd(7)} | ${r.httpStatus ?? "-"} | ${r.url}`);
  console.log(`   -> ${r.msg}`);
}
await db.end();
