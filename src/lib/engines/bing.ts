import { db } from "@/lib/db";
import type { EngineResult } from "./google";

const BING_ENDPOINT = "https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch";

/**
 * Submit URLs to Bing via the Webmaster API (SubmitUrlBatch).
 * Requires the site to be verified in Bing Webmaster Tools and an API key.
 * Batch limit: 1000 URLs per call, 10,000/day quota.
 */
export async function submitToBing(
  urls: string[]
): Promise<Map<string, EngineResult>> {
  const results = new Map<string, EngineResult>();
  if (urls.length === 0) return results;

  const config = await db.bingConfig.findFirst();
  if (!config) {
    for (const url of urls) {
      results.set(url, {
        engine: "bing",
        status: "skipped",
        message: "Bing Webmaster API key not configured",
      });
    }
    return results;
  }

  const groups = new Map<string, string[]>();
  for (const url of urls) {
    try {
      const host = new URL(url).host;
      const origin = new URL(url).origin;
      const list = groups.get(origin) ?? [];
      list.push(url);
      groups.set(origin, list);
      void host;
    } catch {
      results.set(url, {
        engine: "bing",
        status: "failed",
        message: "Invalid URL",
      });
    }
  }

  for (const [siteUrl, siteUrls] of groups) {
    for (let i = 0; i < siteUrls.length; i += 1000) {
      const chunk = siteUrls.slice(i, i + 1000);
      try {
        const res = await fetch(
          `${BING_ENDPOINT}?apikey=${encodeURIComponent(config.apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              siteUrl,
              urlList: chunk,
            }),
            signal: AbortSignal.timeout(15_000),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          d?: unknown;
          ErrorCode?: number;
          Message?: string;
        };
        const ok = res.ok && data.ErrorCode === undefined;
        const message = ok
          ? `Submitted to Bing Webmaster (${siteUrl})`
          : data.Message || `Bing error (HTTP ${res.status})`;
        for (const url of chunk) {
          results.set(url, {
            engine: "bing",
            status: ok ? "success" : "failed",
            httpStatus: res.status,
            message,
          });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Network error";
        for (const url of chunk) {
          results.set(url, {
            engine: "bing",
            status: "failed",
            message,
          });
        }
      }
    }
  }

  return results;
}

/** Validate the Bing API key by calling the GetUser endpoint. */
export async function testBingKey(
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://ssl.bing.com/webmaster/api.svc/json/GetUser?apikey=${encodeURIComponent(
        apiKey
      )}`,
      { signal: AbortSignal.timeout(12_000) }
    );
    const data = (await res.json().catch(() => ({}))) as {
      d?: { Email?: string };
      ErrorCode?: number;
      Message?: string;
    };
    if (res.ok && data.ErrorCode === undefined) {
      return {
        ok: true,
        message: `Connected${data.d?.Email ? ` as ${data.d.Email}` : ""} — API key valid`,
      };
    }
    return {
      ok: false,
      message: data.Message || `Invalid API key (HTTP ${res.status})`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}
