import { db } from "@/lib/db";

/**
 * Creates tables on first use so a fresh deployment (e.g. Vercel + Neon
 * Postgres free tier) works with zero manual migration steps.
 * Idempotent: CREATE TABLE IF NOT EXISTS on both SQLite and PostgreSQL.
 * Also runs tolerant ALTERs so pre-SaaS databases gain the User/userId
 * columns without manual intervention.
 */
let ready: Promise<void> | null = null;

async function tryExec(sql: string): Promise<void> {
  try {
    await db.$executeRawUnsafe(sql);
  } catch {
    // Tolerated: column/index/table already exists (sqlite/pg wording varies)
  }
}

export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const url = process.env.DATABASE_URL || "";
    const isPg = url.startsWith("postgres");
    const ts = isPg ? "TIMESTAMP(3)" : "DATETIME";
    const now = "CURRENT_TIMESTAMP";

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT PRIMARY KEY,
        "email" TEXT NOT NULL UNIQUE,
        "passwordHash" TEXT NOT NULL,
        "createdAt" ${ts} NOT NULL DEFAULT ${now}
      )`);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ServiceAccount" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT,
        "label" TEXT NOT NULL,
        "clientEmail" TEXT NOT NULL,
        "privateKey" TEXT NOT NULL,
        "projectId" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "lastUsedAt" ${ts},
        "createdAt" ${ts} NOT NULL DEFAULT ${now}
      )`);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "IndexNowKey" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT,
        "key" TEXT NOT NULL UNIQUE,
        "label" TEXT,
        "createdAt" ${ts} NOT NULL DEFAULT ${now}
      )`);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BingConfig" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT,
        "apiKey" TEXT NOT NULL,
        "updatedAt" ${ts} NOT NULL
      )`);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Submission" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT,
        "url" TEXT NOT NULL,
        "host" TEXT NOT NULL,
        "source" TEXT NOT NULL DEFAULT 'manual',
        "createdAt" ${ts} NOT NULL DEFAULT ${now}
      )`);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SubmissionResult" (
        "id" TEXT PRIMARY KEY,
        "submissionId" TEXT NOT NULL,
        "engine" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "httpStatus" INTEGER,
        "message" TEXT,
        "accountLabel" TEXT,
        "createdAt" ${ts} NOT NULL DEFAULT ${now},
        CONSTRAINT "SubmissionResult_submissionId_fkey"
          FOREIGN KEY ("submissionId") REFERENCES "Submission"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )`);

    // --- tolerant upgrades for databases created before the SaaS update ---
    for (const table of ["ServiceAccount", "IndexNowKey", "BingConfig", "Submission"]) {
      await tryExec(`ALTER TABLE "${table}" ADD COLUMN "userId" TEXT`);
    }

    // Per-user uniqueness for service accounts (replaces global email unique)
    if (isPg) {
      await tryExec(`DROP INDEX IF EXISTS "ServiceAccount_clientEmail_key"`);
      await tryExec(
        `CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAccount_userId_clientEmail_key" ON "ServiceAccount"("userId","clientEmail")`
      );
      await tryExec(`CREATE UNIQUE INDEX IF NOT EXISTS "BingConfig_userId_key" ON "BingConfig"("userId")`);
    } else {
      await tryExec(
        `CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAccount_userId_clientEmail_key" ON "ServiceAccount"("userId","clientEmail")`
      );
      await tryExec(`CREATE UNIQUE INDEX IF NOT EXISTS "BingConfig_userId_key" ON "BingConfig"("userId")`);
    }

    await tryExec(
      `CREATE INDEX IF NOT EXISTS "Submission_createdAt_idx" ON "Submission"("createdAt")`
    );
    await tryExec(
      `CREATE INDEX IF NOT EXISTS "Submission_host_idx" ON "Submission"("host")`
    );
    await tryExec(
      `CREATE INDEX IF NOT EXISTS "Submission_userId_idx" ON "Submission"("userId")`
    );
    await tryExec(
      `CREATE INDEX IF NOT EXISTS "SubmissionResult_submissionId_idx" ON "SubmissionResult"("submissionId")`
    );
    await tryExec(
      `CREATE INDEX IF NOT EXISTS "SubmissionResult_engine_status_idx" ON "SubmissionResult"("engine", "status")`
    );
  })().catch((e) => {
    ready = null; // allow retry on next request
    throw e;
  });

  return ready;
}
