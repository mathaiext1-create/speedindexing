// Show recent submission results + all service account rows (any state)
import { SQL } from "bun";
const sql = new SQL(process.env.PROD_DB);

console.log("=== ALL SERVICE ACCOUNT ROWS ===");
const sas = await sql`SELECT "label","clientEmail","isActive","createdAt" FROM "ServiceAccount" ORDER BY "createdAt" ASC`;
for (const a of sas) console.log(`- ${a.label} | ${a.clientEmail} | active=${a.isActive}`);

console.log("\n=== 10 MOST RECENT SUBMISSION RESULTS ===");
const rows = await sql`
  SELECT r."httpStatus" AS st, r.engine, r.status, r."accountLabel" AS acc,
         LEFT(r.message, 120) AS msg, s.url, r."createdAt"
  FROM "SubmissionResult" r JOIN "Submission" s ON s.id = r."submissionId"
  ORDER BY r."createdAt" DESC LIMIT 10`;
for (const r of rows)
  console.log(`[${r.createdAt?.toISOString?.()}] ${r.engine}/${r.status}/${r.st} via ${r.acc ?? "-"} :: ${r.url}\n   ${r.msg ?? ""}`);

console.log("\n=== DISTINCT HOSTS SUBMITTED ===");
const hosts = await sql`SELECT DISTINCT host FROM "Submission"`;
console.log(hosts.map((h) => h.host).join(", "));
await sql.end();
