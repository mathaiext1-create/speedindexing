// Create HostLane table in Neon (pre-flip production DB) so the runtime
// cache works immediately on next authenticated request.
import { SQL } from "bun";

const NEON = "postgresql://neondb_owner:npg_9WVm2MnNdLwq@ep-twilight-night-ay6dik7i-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require";
const db = new SQL(NEON, { max: 1, tls: true });

await db`CREATE TABLE IF NOT EXISTS "HostLane" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT,
  "host" TEXT NOT NULL,
  "lane" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
await db`CREATE UNIQUE INDEX IF NOT EXISTS "HostLane_userId_host_key" ON "HostLane"("userId","host")`;
console.log("HostLane table ready in Neon");
await db.end();
