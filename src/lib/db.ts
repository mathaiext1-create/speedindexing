import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Normalize DATABASE_URL at runtime so Vercel + managed Postgres
 * (Supabase / Neon / Vercel Postgres / RDS) connection strings work
 * out of the box:
 *
 *  - postgres://  → postgresql://        (both schemes accepted, normalize anyway)
 *  - sslmode=require                    (managed providers require TLS)
 *  - pgbouncer=true & connection_limit=1 for transaction-pooler endpoints
 *    (port 6543 / *.pooler.* hosts) → prevents the classic serverless crash
 *    "prepared statement s0 already exists" under concurrent requests.
 *
 * The result is passed via `datasourceUrl` so it overrides the schema's
 * env("DATABASE_URL") — no manual env editing required by the user.
 */
function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let url = raw.trim();

  // Detect common copy/paste mistakes early and say so loudly.
  if (/\[YOUR-?PASSWORD\]|\[YOURPASSWORD\]|YOUR-?PASSWORD/i.test(url)) {
    console.error(
      "[db] DATABASE_URL still contains the [YOUR-PASSWORD] placeholder — " +
        "replace it with the real database password in the Vercel environment variables."
    );
  }

  if (url.startsWith("postgres://")) {
    url = "postgresql://" + url.slice("postgres://".length);
  }
  if (!url.startsWith("postgresql://")) return url; // sqlite / others — use as-is

  try {
    const u = new URL(url);
    const isLocal = /localhost|127\.0\.0\.1/.test(u.hostname);
    const isPooler = u.port === "6543" || /pooler\./i.test(u.hostname);

    if (isPooler) {
      if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
      if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
    }
    if (!isLocal && !u.searchParams.has("sslmode")) {
      u.searchParams.set("sslmode", "require");
    }
    return u.toString();
  } catch {
    return url; // unparseable — let Prisma surface the exact error
  }
}

const datasourceUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
