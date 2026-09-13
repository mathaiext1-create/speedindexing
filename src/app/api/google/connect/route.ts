import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { clearHostLane } from "@/lib/engines/google";

const SV_API = "https://www.googleapis.com/siteVerification/v1/webResource";

type WebResource = {
  id?: string;
  owners?: string[];
  site?: { identifier?: string; type?: string };
};

export type ConnectSiteResult = {
  identifier: string;
  added: string[];
  alreadyOwner: string[];
  error?: string;
};

/**
 * ONE-CLICK Google permission setup (the thing competitors hide behind
 * "Connect your site" buttons): given the user's OAuth access token
 * (scope siteverification), this lists every property in their Search
 * Console and adds the user's service-account emails as DELEGATED OWNERS
 * via the official Site Verification API. Fully private — it changes only
 * GSC user management, never the public site.
 */
export async function POST(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = (await req.json().catch(() => ({}))) as {
    accessToken?: string;
  };
  const accessToken = body.accessToken?.trim();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing Google access token" },
      { status: 400 }
    );
  }

  // The emails that need owner access
  const accounts = await db.serviceAccount.findMany({
    where: { isActive: true, userId: user.id },
    select: { clientEmail: true },
  });
  const wanted = accounts.map((a) => a.clientEmail);
  if (wanted.length === 0) {
    return NextResponse.json(
      {
        error:
          "Add a Google service account in the Engines tab first — then connect to grant it access",
      },
      { status: 400 }
    );
  }

  const auth = { Authorization: `Bearer ${accessToken}` };

  // 1) List all properties the user owns/verified in Search Console
  const listRes = await fetch(SV_API, {
    headers: auth,
    signal: AbortSignal.timeout(15_000),
  });
  if (!listRes.ok) {
    const err = (await listRes.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const msg =
      listRes.status === 401 || listRes.status === 403
        ? "Google rejected the connection — please retry the Connect flow and make sure you pick the account that owns your sites in Search Console"
        : err.error?.message || `Site Verification API error (HTTP ${listRes.status})`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  const list = (await listRes.json().catch(() => ({}))) as {
    items?: WebResource[];
  };
  const items = list.items ?? [];
  if (items.length === 0) {
    return NextResponse.json({
      sites: [] as ConnectSiteResult[],
      hint:
        "No verified sites found in this Google account. First add your site in Google Search Console (search.google.com/search-console), then connect again.",
    });
  }

  // 2) Add missing owner emails on each property
  const sites: ConnectSiteResult[] = await Promise.all(
    items.map(async (item): Promise<ConnectSiteResult> => {
      const identifier = item.site?.identifier ?? item.id ?? "unknown";
      const existing = new Set(item.owners ?? []);
      const alreadyOwner = wanted.filter((e) => existing.has(e));
      const missing = wanted.filter((e) => !existing.has(e));

      if (missing.length === 0) {
        return { identifier, added: [], alreadyOwner };
      }
      try {
        const res = await fetch(`${SV_API}/${encodeURIComponent(item.id!)}`, {
          method: "PUT",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...item,
            owners: [...(item.owners ?? []), ...missing],
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          const detail =
            res.status === 403
              ? "you must be an OWNER of this property in Search Console to delegate access"
              : err.error?.message || `HTTP ${res.status}`;
          return {
            identifier,
            added: [],
            alreadyOwner,
            error: detail,
          };
        }
        return { identifier, added: missing, alreadyOwner };
      } catch {
        return {
          identifier,
          added: [],
          alreadyOwner,
          error: "Network error while updating this property",
        };
      }
    })
  );

  const totalAdded = sites.reduce((n, s) => n + s.added.length, 0);

  // Self-heal: any property we touched (or that already had access) may now
  // be instant-laned — forget its cached lane so the next submit re-probes.
  await Promise.all(
    sites
      .filter((s) => !s.error)
      .map((s) => {
        const id = s.identifier;
        const host = id.startsWith("sc-domain:")
          ? id.replace(/^sc-domain:/, "")
          : (() => {
              try {
                return new URL(id).host;
              } catch {
                return id;
              }
            })();
        return clearHostLane(user.id, host);
      })
  );

  return NextResponse.json({
    sites,
    summary: {
      properties: sites.length,
      permissionsAdded: totalAdded,
      allSet:
        totalAdded > 0 &&
        sites.every((s) => !s.error) &&
        sites.every((s) => s.added.length + s.alreadyOwner.length === wanted.length),
    },
  });
}
