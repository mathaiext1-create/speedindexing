// Read service accounts + users from production Neon DB (read-only)
import { SQL } from "bun";

const url = process.env.PROD_DB;
const sql = new SQL(url);

const accounts = await sql`SELECT "label", "clientEmail", "isActive", "createdAt" FROM "ServiceAccount" ORDER BY "createdAt" ASC`;
const users = await sql`SELECT "email", "createdAt" FROM "User" ORDER BY "createdAt" ASC`;
const subs = await sql`SELECT COUNT(*)::int AS n FROM "Submission"`;

console.log("=== USERS ===");
for (const u of users) console.log(`- ${u.email} (joined ${u.createdAt?.toISOString?.() ?? u.createdAt})`);

console.log("\n=== SERVICE ACCOUNTS ===");
for (const a of accounts) {
  console.log(`- label: ${a.label}`);
  console.log(`  email: ${a.clientEmail}`);
  console.log(`  active: ${a.isActive}  created: ${a.createdAt?.toISOString?.() ?? a.createdAt}`);
}

console.log(`\n=== SUBMISSIONS TOTAL: ${subs[0].n} ===`);
await sql.end();
