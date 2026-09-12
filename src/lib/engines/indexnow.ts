import crypto from "crypto";
import { db } from "@/lib/db";
import type { EngineResult } from "./google";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";

/** IndexNow keys are 32-char hex tokens. */
export function generateIndexNowKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

function explainIndexNowStatus(status: number): string {
  switch (status) {
    case 200:
      return "Accepted — key is valid, URLs delivered to search engines";
    case 202:
      return "Accepted — key file pending validation, first URLs may be delayed until the key is verified";
    case 400:
      return "Bad request — invalid URL format";
    case 403:
      return "Key not valid — the key file was not found on the domain (upload it to the site root first)";
    case 422:
      return "URLs don't match the key — make sure the key file is live on this exact domain and URLs belong to it";
    case 429:
      return "Too many requests — slow down, the endpoint is rate limiting";
    default:
      return `HTTP ${status}`;
  }
}

/**
 * Submit URLs to IndexNow (Bing, Yandex, Seznam, Naver) in batches per host.
 * Returns a result row per input URL (same order).
 */
export async function submitToIndexNow(
  urls: string[]
): Promise<Map<string, EngineResult>> {
  const results = new Map<string, EngineResult>();
  if (urls.length === 0) return results;

  const keyRecord = await db.indexNowKey.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!keyRecord) {
    for (const url of urls) {
      results.set(url, {
        engine: "indexnow",
        status: "skipped",
        message: "No IndexNow key generated yet",
      });
    }
    return results;
  }

  // Group URLs by host — one batch request per host
  const groups = new Map<string, string[]>();
  for (const url of urls) {
    try {
      const host = new URL(url).host;
      const list = groups.get(host) ?? [];
      list.push(url);
      groups.set(host, list);
    } catch {
      results.set(url, {
        engine: "indexnow",
        status: "failed",
        message: "Invalid URL",
      });
    }
  }

  for (const [host, hostUrls] of groups) {
    try {
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host,
          key: keyRecord.key,
          urlList: hostUrls.slice(0, 10_000),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const ok = res.status === 200 || res.status === 202;
      const message = explainIndexNowStatus(res.status);
      for (const url of hostUrls) {
        results.set(url, {
          engine: "indexnow",
          status: ok ? "success" : "failed",
          httpStatus: res.status,
          message: ok ? `${message} (${host})` : `${message} — host: ${host}`,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error";
      for (const url of hostUrls) {
        results.set(url, {
          engine: "indexnow",
          status: "failed",
          message,
        });
      }
    }
  }

  return results;
}

/** Verify the key file is live on a target domain: GET https://host/{key}.txt */
export async function verifyKeyFile(
  host: string,
  key: string
): Promise<{ ok: boolean; httpStatus?: number; message: string }> {
  try {
    const res = await fetch(`https://${host}/${key}.txt`, {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "SpeedIndexing-Verifier/1.0" },
    });
    const body = await res.text();
    if (res.ok && body.trim() === key) {
      return {
        ok: true,
        httpStatus: res.status,
        message: "Key file verified — IndexNow submissions will work for this domain",
      };
    }
    if (res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        message: `Key file exists but content mismatch — it must contain exactly: ${key}`,
      };
    }
    return {
      ok: false,
      httpStatus: res.status,
      message: `Key file not reachable at https://${host}/${key}.txt (HTTP ${res.status})`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}
