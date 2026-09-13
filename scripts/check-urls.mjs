#!/usr/bin/env node
/** Usage: node check-urls.mjs <url1> [url2 ...]  — prints HTTP status per URL (local + multi-region via check-host.net) */
const urls = process.argv.slice(2);
if (!urls.length) { console.error("no urls given"); process.exit(1); }

async function jget(u, headers = {}) {
  const r = await fetch(u, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(30000) });
  return r.json();
}

// 1. local single check
for (const u of urls) {
  try {
    const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    console.log("local  ", String(r.status).padEnd(4), u);
  } catch (e) {
    console.log("local  ERR ", u, String(e).slice(0, 60));
  }
}

// 2. multi-region
try {
  for (const u of urls) {
    const started = await jget(`https://check-host.net/check-http?host=${encodeURIComponent(u)}&max_nodes=5`);
    if (!started.request_id) { console.log("region: no request_id", JSON.stringify(started).slice(0, 120)); continue; }
    await new Promise((res) => setTimeout(res, 22000));
    const res = await jget(`https://check-host.net/check-result/${started.request_id}`);
    console.log("region ", u);
    for (const [node, r] of Object.entries(res)) {
      const tag = node.split(".")[0].padEnd(8);
      if (Array.isArray(r) && r[0]) console.log(" ", tag, "HTTP", r[0][3], r[0][2]);
      else console.log(" ", tag, "pending");
    }
  }
} catch (e) {
  console.log("region check failed:", String(e).slice(0, 100));
}
