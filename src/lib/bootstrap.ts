import { db } from "@/lib/db";

/**
 * Creates tables on first use so a fresh deployment (e.g. Vercel + Neon
 * Postgres free tier) works with zero manual migration steps.
 * Idempotent: CREATE TABLE IF NOT EXISTS on both SQLite and PostgreSQL.
 */
let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const url = process.env.DATABASE_URL || "";
    const isPg = url.startsWith("postgres");
    const ts = isPg ? "TIMESTAMP(3)" : "DATETIME";
    const now = isPg ? "CURRENT_TIMESTAMP" : "CURRENT_TIMESTAMP";

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ServiceAccount" (
        "id" TEXT PRIMARY KEY,
        "label" TEXT NOT NULL,
        "clientEmail" TEXT NOT NULL UNIQUE,
        "privateKey" TEXT NOT NULL,
        "projectId" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "lastUsedAt" ${ts},
        "createdAt" ${ts} NOT NULL DEFAULT ${now}
      )`);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "IndexNowKey" (
        "id" TEXT PRIMARY KEY,
        "key" TEXT NOT NULL UNIQUE,
        "label" TEXT,
        "createdAt" ${ts} NOT NULL DEFAULT ${now}
      )`);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BingConfig" (
        "id" TEXT PRIMARY KEY,
        "apiKey" TEXT NOT NULL,
        "updatedAt" ${ts} NOT NULL
      )`);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Submission" (
        "id" TEXT PRIMARY KEY,
        "url" TEXT NOT NULL,
        "host" TEXT NOT NULL,
        "source" TEXT NOT NULL DEFAULT 'manual',
        "createdAt" ${ts} NOT NULL DEFAULT ${now}
      )`);

    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Submission_createdAt_idx" ON "Submission"("createdAt")`
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Submission_host_idx" ON "Submission"("host")`
    );

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

    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "SubmissionResult_submissionId_idx" ON "SubmissionResult"("submissionId")`
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "SubmissionResult_engine_status_idx" ON "SubmissionResult"("engine", "status")`
    );
  })().catch((e) => {
    ready = null; // allow retry on next request
    throw e;
  });

  return ready;
}
