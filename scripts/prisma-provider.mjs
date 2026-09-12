import fs from "node:fs";

/**
 * Picks the Prisma provider from DATABASE_URL so the same codebase runs on:
 *  - local / sandbox:  DATABASE_URL=file:./db/custom.db      -> sqlite
 *  - Vercel / Neon:    DATABASE_URL=postgres://...           -> postgresql
 * Runs automatically on postinstall and before every build.
 */
const schemaPath = new URL("../prisma/schema.prisma", import.meta.url);
const url = process.env.DATABASE_URL || "";
const provider = url.startsWith("postgres") ? "postgresql" : "sqlite";

let schema = fs.readFileSync(schemaPath, "utf8");
schema = schema.replace(
  /provider\s*=\s*"(sqlite|postgresql)"/,
  `provider = "${provider}"`
);
fs.writeFileSync(schemaPath, schema);
console.log(`[prisma-provider] using ${provider} (from DATABASE_URL)`);
