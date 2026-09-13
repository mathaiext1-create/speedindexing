// Live diagnosis: test both service accounts against Google Indexing API
// 1) mint JWT access token  2) GET metadata (quota-free)  3) optional real publish
import crypto from "crypto";
import { SQL } from "bun";

const NEON = process.env.PROD_DB;
const sql = new SQL(NEON);

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const META_URL = "https://indexing.googleapis.com/v3/urlNotifications/metadata";
const PUB_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE = "https://www.googleapis.com/auth/indexing";

const accounts = await sql`
  SELECT "label", "clientEmail", "privateKey", "isActive"
  FROM "ServiceAccount" WHERE "isActive" = true ORDER BY "createdAt" ASC`;

const subs = await sql`
  SELECT "url", "host" FROM "Submission" ORDER BY "createdAt" DESC LIMIT 1`;
const testUrl = process.argv[2] || subs[0]?.url;
console.log(`Testing URL: ${testUrl}\n`);

const b64 = (s) => Buffer.from(s).toString("base64url");

async function getToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64(JSON.stringify({
    iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, exp: now + 3600, iat: now,
  }));
  const input = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(input);
  const sig = signer.sign(privateKey.replace(/\\n/g, "\n"), "base64url");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${input}.${sig}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function callApi(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 600) };
}

for (const a of accounts) {
  console.log(`===== ${a.label}: ${a.clientEmail} =====`);
  const tok = await getToken(a.clientEmail, a.privateKey);
  if (!tok.data.access_token) {
    console.log(`TOKEN FAIL ${tok.status}: ${JSON.stringify(tok.data).slice(0, 300)}`);
    continue;
  }
  console.log("Token: OK");

  const enc = encodeURIComponent(testUrl);
  const meta = await callApi(`${META_URL}?url=${enc}`, tok.data.access_token);
  console.log(`METADATA ${meta.status}: ${meta.text}`);

  // Real publish test — submits the URL (this is the user's goal anyway)
  const pub = await fetch(PUB_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok.data.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: testUrl, type: "URL_UPDATED" }),
  });
  const pubText = await pub.text();
  console.log(`PUBLISH ${pub.status}: ${pubText.slice(0, 600)}`);
  console.log("");
}

await sql.end();
