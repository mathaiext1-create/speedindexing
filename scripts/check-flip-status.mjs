// Compare latest rows in Neon vs Supabase to detect if the flip happened
import { SQL } from "bun";

const NEON = "postgresql://neondb_owner:npg_9WVm2MnNdLwq@ep-twilight-night-ay6dik7i-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require";
const SUPA = "postgresql://postgres.ncptsbsedrmhofytbing:ZA12I3D4%2F%7Cspeedindexing%2B%40@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require";

const neon = new SQL(NEON, { max: 1, tls: true });
const supa = new SQL(SUPA, { prepare: false, max: 1 });

const n = await neon`SELECT COUNT(*)::int AS n, MAX("createdAt") AS latest FROM "Submission"`;
const s = await supa`SELECT COUNT(*)::int AS n, MAX("createdAt") AS latest FROM "Submission"`;

console.log(`Neon    : ${n[0].n} submissions, latest ${n[0].latest?.toISOString?.() ?? n[0].latest}`);
console.log(`Supabase: ${s[0].n} submissions, latest ${s[0].latest?.toISOString?.() ?? s[0].latest}`);
console.log(new Date().toISOString() + " = now");

await neon.end();
await supa.end();
