"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Pull service-account emails out of stored engine error messages. */
export function extractServiceEmails(messages: string[]): string[] {
  const emails = new Set<string>();
  const re = /[\w.+-]+@[\w.-]+\.iam\.gserviceaccount\.com/g;
  for (const m of messages) {
    (m.match(re) ?? []).forEach((e) => emails.add(e));
  }
  return [...emails];
}

/** Minimal typing for the Google Identity Services script. */
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: {
              access_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google script — check your connection"));
    document.head.appendChild(s);
  });
}

type ConnectSiteResult = {
  identifier: string;
  added: string[];
  alreadyOwner: string[];
  error?: string;
};

type PermissionResult = {
  label: string;
  clientEmail: string;
  ok: boolean;
  message: string;
};

/* ------------------------------------------------------------------ */
/* the card                                                            */
/* ------------------------------------------------------------------ */

export function GscFixCard({
  emails: emailsProp,
  onRetry,
  compact = false,
}: {
  /** Service-account emails that need owner access. Fetched automatically if omitted. */
  emails?: string[];
  /** Called when the user wants to retry a failed batch. */
  onRetry?: () => void;
  /** Slimmer layout for embedding inside other cards. */
  compact?: boolean;
}) {
  const { toast } = useToast();
  const [emails, setEmails] = useState<string[]>(emailsProp ?? []);
  const [clientId, setClientId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectResults, setConnectResults] = useState<{
    sites: ConnectSiteResult[];
    hint?: string;
  } | null>(null);
  const [checkUrl, setCheckUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<PermissionResult[] | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (emailsProp && emailsProp.length > 0) {
      setEmails(emailsProp);
      return;
    }
    api<{ accounts: { clientEmail: string }[] }>("/api/service-accounts")
      .then((d) =>
        setEmails(d.accounts.map((a) => a.clientEmail))
      )
      .catch(() => {});
  }, [emailsProp]);

  useEffect(() => {
    api<{ googleOAuthClientId: string | null }>("/api/config")
      .then((d) => setClientId(d.googleOAuthClientId))
      .catch(() => setClientId(null));
  }, []);

  /** One-click: connect Google account → auto-add owner on every property. */
  const connectGoogle = useCallback(async () => {
    if (!clientId) return;
    setConnecting(true);
    setConnectResults(null);
    try {
      await loadGisScript();
      const accessToken = await new Promise<string>((resolve, reject) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/siteverification",
          callback: (resp) => {
            if (resp.access_token) resolve(resp.access_token);
            else
              reject(
                new Error(
                  resp.error_description ||
                    resp.error ||
                    "Google sign-in was cancelled"
                )
              );
          },
        });
        client.requestAccessToken();
      });
      const data = await api<{
        sites: ConnectSiteResult[];
        hint?: string;
      }>("/api/google/connect", {
        method: "POST",
        body: JSON.stringify({ accessToken }),
      });
      setConnectResults(data);
      const fixed = data.sites.filter((s) => !s.error).length;
      if (data.sites.length > 0) {
        toast({
          title: `Connected — ${fixed} of ${data.sites.length} site(s) updated`,
          description:
            "Google can now index your URLs. Press Retry on the failed batch or submit again.",
        });
      }
    } catch (e) {
      toast({
        title: "Google connect failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  }, [clientId, toast]);

  async function checkPermission() {
    if (!checkUrl.trim()) {
      toast({ title: "Type your site URL first", variant: "destructive" });
      return;
    }
    setChecking(true);
    setCheckResults(null);
    try {
      const data = await api<{ results: PermissionResult[] }>(
        "/api/google/permission-check",
        { method: "POST", body: JSON.stringify({ url: checkUrl }) }
      );
      setCheckResults(data.results);
    } catch (e) {
      toast({
        title: "Check failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setChecking(false);
    }
  }

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 1500);
  }

  /** Ready-made message the user can send a client who owns the site. */
  const clientMessage = useCallback(() => {
    const robot = emails[0] ?? "<your-robot-email>";
    return [
      "Hi! To turn on instant Google indexing for your website, I need one small (private) permission from your Google account. It takes 2 minutes:",
      "",
      "1. Open https://search.google.com/search-console and log in with the Google account that owns your site",
      "2. Select your website",
      "3. Bottom-left: Settings → Users and permissions → Add user",
      `4. Email: ${robot}  |  Role: Owner  →  Add`,
      "",
      "This is a private technical setting so I can push your pages to Google instantly. Nothing becomes public and your site data stays private.",
      "",
      "If your site is not in Search Console yet: click “Add property” → choose “Domain” → follow the DNS steps it shows, then do the 4 steps above.",
      "",
      "Once done, just tell me — every page for your site will reach Google in minutes from then on.",
    ].join("\n");
  }, [emails]);

  function copyClientMessage() {
    navigator.clipboard.writeText(clientMessage());
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 1500);
  }

  return (
    <div
      className={`rounded-lg border border-amber-500/40 bg-amber-500/5 ${
        compact ? "p-3" : "p-4"
      } space-y-3`}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-medium text-amber-300">
            Unlock the instant lane for boosted sites — one-time, ~1 minute
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Boosted URLs are already on their way — Google crawls them
            naturally. For <em>instant</em> indexing, Google only lets the{" "}
            <em>owner</em> of a website use the fast API (that is
            Google&apos;s anti-spam rule, not ours). The site owner adds your
            own private &quot;robot account&quot; as a helper inside their
            Search Console.
            <span className="text-amber-200/90 font-medium">
              {" "}
              Nothing becomes public — the site and its data stay 100% private.
            </span>
          </p>
        </div>
      </div>

      {/* Robot emails */}
      {emails.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            This robot email needs Owner access (tap to copy):
          </p>
          <div className="flex flex-wrap gap-2">
            {emails.map((e) => (
              <button
                key={e}
                onClick={() => copyEmail(e)}
                className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-xs hover:bg-muted/70 transition-colors"
                title="Copy email"
              >
                {copiedEmail === e ? (
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-emerald-400" />
                )}
                {copiedEmail === e ? "Copied!" : e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Option 1 — automatic */}
      <div className="rounded-md border bg-background/60 p-3 space-y-2">
        <p className="text-xs font-medium">
          Option 1 — Automatic (recommended): connect Google and we add the
          permission for you
        </p>
        {clientId ? (
          <Button
            onClick={connectGoogle}
            disabled={connecting}
            size="sm"
            className="brand-glow"
          >
            {connecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {connecting ? "Connecting…" : "Connect Google — fix all sites"}
          </Button>
        ) : (
          <Collapsible open={setupOpen} onOpenChange={setSetupOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="font-normal">
                One-time setup needed — show me how (3 min)
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${setupOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <ol className="space-y-1.5 text-xs text-muted-foreground">
                {[
                  "Open console.cloud.google.com (same project as your service account).",
                  "Enable the 'Site Verification API': APIs & Services → Library → search 'Site Verification API' → Enable.",
                  "Google Auth Platform → OAuth consent screen → type External → fill only the app name → add your own Google email under 'Test users' → Save.",
                  "Credentials → Create credentials → OAuth client ID → type 'Web application'.",
                  "Under 'Authorized JavaScript origins' add: " + (origin || "your site URL") + " → Create.",
                  "Copy the Client ID (ends with .apps.googleusercontent.com).",
                  "In Vercel → your project → Settings → Environment Variables → add GOOGLE_OAUTH_CLIENT_ID with that value → redeploy once. Then this button activates for everyone.",
                ].map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-emerald-400 shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:underline mt-2"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Google Cloud credentials
              </a>
            </CollapsibleContent>
          </Collapsible>
        )}

        {connectResults && (
          <div className="space-y-1.5 pt-1">
            {connectResults.sites.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {connectResults.hint}
              </p>
            ) : (
              connectResults.sites.map((s) => (
                <p
                  key={s.identifier}
                  className={`text-xs flex items-start gap-1.5 ${
                    s.error ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {s.error ? (
                    <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  )}
                  <span className="font-mono">{s.identifier}</span>
                  <span>
                    {s.error
                      ? ` — ${s.error}`
                      : s.added.length > 0
                        ? ` — added access for ${s.added.join(", ")}`
                        : s.alreadyOwner.length > 0
                          ? " — already has access"
                          : ""}
                  </span>
                </p>
              ))
            )}
          </div>
        )}
      </div>

      {/* Option 2 — manual */}
      <div className="rounded-md border bg-background/60 p-3 space-y-2">
        <p className="text-xs font-medium">
          Option 2 — Manual (2 minutes, no Google connect needed)
        </p>
        <ol className="space-y-1.5 text-xs text-muted-foreground">
          {[
            "Open Google Search Console and select the website (search.google.com/search-console).",
            "Bottom-left: Settings → 'Users and permissions'.",
            "Click 'Add user' → paste the robot email (above) → choose role 'Owner' → Add.",
            "Come back here and press Retry. Done — works for every future URL of that site.",
          ].map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono text-emerald-400 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <a
          href="https://search.google.com/search-console/users"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open Search Console users page
        </a>
      </div>

      {/* Option 3 — agency mode: client owns the site */}
      <div className="rounded-md border bg-background/60 p-3 space-y-2">
        <p className="text-xs font-medium">
          Client&apos;s site (you have no access)? Send them this message —
          2 minutes for them, instant indexing forever
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          No tool can index a site without owner permission — Google blocks it
          for everyone (competitors included). The client you billed adds one
          email as Owner and every future URL of that site goes through the
          official fast path automatically.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={copyClientMessage}>
            {copiedMsg ? (
              <BadgeCheck className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copiedMsg ? "Copied — paste it to your client" : "Copy client message"}
          </Button>
          <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                Preview
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${previewOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground leading-relaxed">
                {clientMessage()}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Verify */}
      <div className="rounded-md border bg-background/60 p-3 space-y-2">
        <p className="text-xs font-medium">
          Not sure it worked? Check permission for a site
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="https://yoursite.com/any-page"
            value={checkUrl}
            onChange={(e) => setCheckUrl(e.target.value)}
            className="flex-1 h-8 text-xs"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={checkPermission}
            disabled={checking}
            className="sm:w-28"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Check
          </Button>
        </div>
        {checkResults && (
          <div className="space-y-1">
            {checkResults.map((r) => (
              <p
                key={r.label}
                className={`text-xs flex items-start gap-1.5 ${
                  r.ok ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {r.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                )}
                {r.message}
              </p>
            ))}
          </div>
        )}
      </div>

      {onRetry && (
        <Button onClick={onRetry} size="sm" variant="secondary">
          Retry the failed URLs
        </Button>
      )}
    </div>
  );
}

/** Detects that a Google failure is the fixable GSC-permission case. */
export function isGscPermissionError(messages: string[]): boolean {
  return messages.some(
    (m) =>
      /Permission needed/i.test(m) ||
      /gserviceaccount\.com/i.test(m) ||
      (/403/i.test(m) && /permission|denied/i.test(m))
  );
}

export function GscErrorBadge() {
  return (
    <Badge variant="outline" className="text-amber-400 border-amber-500/40">
      fixable
    </Badge>
  );
}
