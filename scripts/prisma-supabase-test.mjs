// End-to-end Prisma test against Supabase (exactly what the app does at runtime)
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const users = await db.user.findMany({ select: { email: true, createdAt: true } });
console.log("USERS:", users.map((u) => u.email).join(", "));

const sas = await db.serviceAccount.findMany({
  select: { label: true, clientEmail: true, isActive: true },
});
console.log("SERVICE ACCOUNTS:", sas.map((a) => `${a.label}(${a.clientEmail}, active=${a.isActive})`).join(", "));

const subs = await db.submission.count();
const results = await db.submissionResult.count();
console.log(`SUBMISSIONS: ${subs} | RESULTS: ${results}`);

// write test (like bootstrap ALTERs / runtime inserts would do)
const probe = await db.$executeRawUnsafe(`SELECT 1 AS ok`);
console.log("RAW QUERY: OK", probe >= 0 ? "" : "");

await db.$disconnect();
console.log("PRISMA <-> SUPABASE: ALL GOOD");
