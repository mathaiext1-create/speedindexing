// Verify HostLane table exists in prod (Neon) after deploy
import { SQL } from "bun";

const NEON = "postgresql://neondb_owner:npg_9WVm2MnNdLwq@ep-twilight-night-ay6dik7i-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require";
const db = new SQL(NEON, { max: 1, tls: true });

const t = await db`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'HostLane' ORDER BY ordinal_position
`;
console.log("HostLane columns in Neon:", t.length ? "" : "MISSING!");
for (const c of t) console.log(` - ${c.column_name}: ${c.data_type}`);

const rows = await db`SELECT host, lane FROM "HostLane" LIMIT 10`;
console.log("Rows:", rows.length);
for (const r of rows) console.log(` - ${r.host} -> ${r.lane}`);
await db.end();
