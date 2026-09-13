// One-shot migration: Neon -> Supabase
// ⚠️ Wipes Supabase tables then copies fresh from Neon (full mirror).
// Run ONLY while production still points at Neon (before the Vercel flip).
// 1) create schema (same DDL as src/lib/bootstrap.ts ensureSchema)
// 2) wipe destination rows, copy all rows preserving IDs
// 3) verify counts on both sides
import { SQL } from "bun";

const src = new SQL(process.env.PROD_DB);
// Supavisor transaction pooler: disable prepared statements (avoids
// "prepared statement ... already exists" collisions across pooled sessions)
const dst = new SQL({ url: process.env.SUPA_DB, prepare: false, max: 1 });

console.log("0) Wiping Supabase tables (fresh mirror)...");
for (const t of ["SubmissionResult", "Submission", "BingConfig", "IndexNowKey", "ServiceAccount", "User"]) {
  await dst.unsafe(`DELETE FROM "${t}"`);
}
console.log("   done");

const TS = "TIMESTAMP(3)";

const DDL = [
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "createdAt" ${TS} NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS "ServiceAccount" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT,
    "label" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "projectId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" ${TS},
    "createdAt" ${TS} NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS "IndexNowKey" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT,
    "key" TEXT NOT NULL UNIQUE,
    "label" TEXT,
    "createdAt" ${TS} NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS "BingConfig" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT,
    "apiKey" TEXT NOT NULL,
    "updatedAt" ${TS} NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "Submission" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT,
    "url" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" ${TS} NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS "SubmissionResult" (
    "id" TEXT PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "message" TEXT,
    "accountLabel" TEXT,
    "createdAt" ${TS} NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionResult_submissionId_fkey"
      FOREIGN KEY ("submissionId") REFERENCES "Submission"("id")
      ON DELETE CASCADE ON UPDATE CASCADE)`,
  `DROP INDEX IF EXISTS "ServiceAccount_clientEmail_key"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAccount_userId_clientEmail_key" ON "ServiceAccount"("userId","clientEmail")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "BingConfig_userId_key" ON "BingConfig"("userId")`,
  `CREATE INDEX IF NOT EXISTS "Submission_createdAt_idx" ON "Submission"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "Submission_host_idx" ON "Submission"("host")`,
  `CREATE INDEX IF NOT EXISTS "Submission_userId_idx" ON "Submission"("userId")`,
  `CREATE INDEX IF NOT EXISTS "SubmissionResult_submissionId_idx" ON "SubmissionResult"("submissionId")`,
  `CREATE INDEX IF NOT EXISTS "SubmissionResult_engine_status_idx" ON "SubmissionResult"("engine","status")`,
];

console.log("1) Creating schema in Supabase...");
for (const q of DDL) {
  try { await dst.unsafe(q); } catch (e) { console.log("  (tolerated)", String(e).slice(0, 80)); }
}
console.log("   done");

const TABLES = [
  ["User", ["id", "email", "passwordHash", "createdAt"]],
  ["ServiceAccount", ["id", "userId", "label", "clientEmail", "privateKey", "projectId", "isActive", "lastUsedAt", "createdAt"]],
  ["IndexNowKey", ["id", "userId", "key", "label", "createdAt"]],
  ["BingConfig", ["id", "userId", "apiKey", "updatedAt"]],
  ["Submission", ["id", "userId", "url", "host", "source", "createdAt"]],
  ["SubmissionResult", ["id", "submissionId", "engine", "status", "httpStatus", "message", "accountLabel", "createdAt"]],
];

console.log("\n2) Copying data...");
for (const [table, cols] of TABLES) {
  const rows = await src.unsafe(`SELECT ${cols.map((c) => `"${c}"`).join(",")} FROM "${table}"`);
  let n = 0;
  for (const row of rows) {
    const collist = cols.map((c) => `"${c}"`).join(",");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
    const values = cols.map((c) => {
      const v = row[c];
      if (v instanceof Date) return v.toISOString();
      return v;
    });
    await dst.unsafe(
      `INSERT INTO "${table}" (${collist}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
      values
    );
    n++;
  }
  console.log(`   ${table}: ${n} rows copied`);
}

console.log("\n3) Verification (source -> dest counts):");
for (const [table] of TABLES) {
  const a = await src.unsafe(`SELECT COUNT(*)::int AS n FROM "${table}"`);
  const b = await dst.unsafe(`SELECT COUNT(*)::int AS n FROM "${table}"`);
  const ok = a[0].n === b[0].n ? "OK" : "MISMATCH!";
  console.log(`   ${table}: ${a[0].n} -> ${b[0].n}  ${ok}`);
}

const svc = await dst.unsafe(`SELECT "label","clientEmail" FROM "ServiceAccount"`);
for (const s of svc) console.log(`\n   Supabase now holds: ${s.label} = ${s.clientEmail}`);

await src.end();
await dst.end();
console.log("\nMIGRATION COMPLETE");
