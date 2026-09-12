"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  KeyRound,
  Loader2,
  PlugZap,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { api, type IndexNowKeyDto, type ServiceAccountDto } from "@/lib/types";

type BingInfo = {
  configured: boolean;
  apiKeyMasked: string | null;
};

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2 text-xs text-muted-foreground">
          <span className="font-mono text-emerald-400 shrink-0">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function EnginesView() {
  return (
    <div className="space-y-6">
      <GoogleSection />
      <IndexNowSection />
      <BingSection />
    </div>
  );
}

/* ---------------- Google ---------------- */

function GoogleSection() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<ServiceAccountDto[]>([]);
  const [json, setJson] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ accounts: ServiceAccountDto[] }>(
        "/api/service-accounts"
      );
      setAccounts(data.accounts);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!json.trim()) {
      toast({ title: "Paste the service-account JSON first", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const { test } = await api<{
        test: { ok: boolean; message: string };
      }>("/api/service-accounts", {
        method: "POST",
        body: JSON.stringify({ json, label }),
      });
      setJson("");
      setLabel("");
      setOpen(false);
      toast({
        title: test.ok
          ? "Service account added & verified"
          : "Service account added, but the credential test failed",
        description: test.message,
        variant: test.ok ? "default" : "destructive",
      });
      load();
    } catch (e) {
      toast({
        title: "Could not add service account",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  }

  async function test(id: string) {
    setTestingId(id);
    try {
      const result = await api<{ ok: boolean; message: string }>(
        `/api/service-accounts/${id}/test`,
        { method: "POST" }
      );
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          message: e instanceof Error ? e.message : "Test failed",
        },
      }));
    } finally {
      setTestingId(null);
    }
  }

  async function toggle(account: ServiceAccountDto) {
    await api(`/api/service-accounts/${account.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !account.isActive }),
    });
    load();
  }

  async function remove(id: string) {
    await api(`/api/service-accounts/${id}`, { method: "DELETE" });
    load();
  }

  const activeCount = accounts.filter((a) => a.isActive).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <PlugZap className="h-5 w-5 text-emerald-400" />
          Google Indexing API
          <Badge variant="secondary" className="font-normal">
            {activeCount} active · {activeCount * 200} URLs/day
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="secondary" size="sm">
              <Plus className="h-4 w-4" />
              Add service account
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="sa-json">
                Paste the full service-account JSON key file
              </Label>
              <Textarea
                id="sa-json"
                placeholder='{ "type": "service_account", "project_id": "…", "private_key": "…", "client_email": "…" }'
                value={json}
                onChange={(e) => setJson(e.target.value)}
                className="min-h-32 max-h-64 overflow-y-auto font-mono text-xs"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Optional label (e.g. main-project)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="flex-1"
              />
              <Button onClick={add} disabled={adding} className="sm:w-36">
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Save & test
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <StepList
                steps={[
                  "Open console.cloud.google.com → create/select a project",
                  "Enable the 'Web Search Indexing API' (APIs & Services → Library)",
                  "IAM & Admin → Service Accounts → Create → Keys → Add key (JSON)",
                  "Open Google Search Console → Settings → Users and permissions",
                  "Add the service-account email (…@…iam.gserviceaccount.com) as DELEGATED owner",
                ]}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No service accounts yet — without one, Google submissions are
            skipped.
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {accounts.map((a) => {
              const t = testResults[a.id];
              return (
                <div
                  key={a.id}
                  className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2">
                      {a.label}
                      {!a.isActive && (
                        <Badge variant="outline" className="text-zinc-400 font-normal">
                          paused
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate font-mono">
                      {a.clientEmail}
                    </p>
                    {t && (
                      <p
                        className={`text-xs mt-1 flex items-center gap-1 ${t.ok ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {t.ok ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {t.message}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={a.isActive}
                      onCheckedChange={() => toggle(a)}
                      aria-label="Toggle account"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => test(a.id)}
                      disabled={testingId === a.id}
                    >
                      {testingId === a.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(a.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- IndexNow ---------------- */

function IndexNowSection() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<IndexNowKeyDto[]>([]);
  const [generating, setGenerating] = useState(false);
  const [host, setHost] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ keys: IndexNowKeyDto[] }>("/api/indexnow");
      setKeys(data.keys);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeKey = keys[0];

  async function generate() {
    setGenerating(true);
    try {
      await api("/api/indexnow", { method: "POST", body: JSON.stringify({}) });
      toast({ title: "New IndexNow key generated" });
      load();
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function removeKey(id: string) {
    await api(`/api/indexnow?id=${id}`, { method: "DELETE" });
    load();
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: "Key copied to clipboard" });
  }

  async function verify() {
    if (!host.trim()) {
      toast({ title: "Enter your domain first", variant: "destructive" });
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await api<{ ok: boolean; message: string }>(
        "/api/indexnow/verify",
        { method: "POST", body: JSON.stringify({ host }) }
      );
      setVerifyResult(result);
    } catch (e) {
      setVerifyResult({
        ok: false,
        message: e instanceof Error ? e.message : "Verification failed",
      });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <KeyRound className="h-5 w-5 text-emerald-400" />
          IndexNow
          <span className="text-xs font-normal text-muted-foreground">
            Bing · Yandex · Naver · Seznam
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeKey ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 rounded-lg border bg-muted/30 px-3 py-2 font-mono text-sm break-all">
                {activeKey.key}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyKey(activeKey.key)}
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Copied!" : "Copy"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generate}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  New
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeKey(activeKey.id)}
                  title="Delete key"
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Verify key file on your domain — yoursite.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="secondary"
                onClick={verify}
                disabled={verifying}
                className="sm:w-28"
              >
                {verifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Verify
              </Button>
            </div>
            {verifyResult && (
              <p
                className={`text-xs flex items-start gap-1.5 ${verifyResult.ok ? "text-emerald-400" : "text-red-400"}`}
              >
                {verifyResult.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                )}
                {verifyResult.message}
              </p>
            )}

            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <StepList
                steps={[
                  `Create a file named ${activeKey.key}.txt in the ROOT of every site you want to index`,
                  "The file content must be exactly the key (one line)",
                  "For Vercel sites: drop the file in your /public folder and redeploy",
                  "Submit URLs below — IndexNow covers Bing, Yandex, Naver and Seznam at once",
                ]}
              />
              <Separator />
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(activeKey.key)}`}
                download={`${activeKey.key}.txt`}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                Download {activeKey.key}.txt (ready to upload)
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Generate a key, then host the key file on the sites you want to
              index.
            </p>
            <Button onClick={generate} disabled={generating}>
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Generate IndexNow key
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Bing ---------------- */

function BingSection() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [info, setInfo] = useState<BingInfo | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<BingInfo>("/api/bing");
      setInfo(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!apiKey.trim()) {
      toast({ title: "Paste your Bing API key first", variant: "destructive" });
      return;
    }
    setBusy("save");
    try {
      await api("/api/bing", {
        method: "PUT",
        body: JSON.stringify({ apiKey }),
      });
      setApiKey("");
      toast({ title: "Bing API key saved" });
      load();
    } catch (e) {
      toast({
        title: "Failed to save",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      const result = await api<{ ok: boolean; message: string }>("/api/bing", {
        method: "POST",
        body: apiKey.trim() ? JSON.stringify({ apiKey }) : "{}",
      });
      toast({
        title: result.ok ? "Bing connected" : "Bing test failed",
        description: result.message,
        variant: result.ok ? "default" : "destructive",
      });
    } catch (e) {
      toast({
        title: "Test failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    await api("/api/bing", { method: "DELETE" });
    setInfo({ configured: false, apiKeyMasked: null });
    toast({ title: "Bing API key removed" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <PlugZap className="h-5 w-5 text-emerald-400" />
          Bing Webmaster API
          <Badge
            variant="secondary"
            className={info?.configured ? "font-normal" : "font-normal text-zinc-400"}
          >
            {info?.configured ? `connected ${info.apiKeyMasked}` : "optional"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            type="password"
            placeholder="Bing Webmaster API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1"
          />
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy === "save"} className="sm:w-24">
              {busy === "save" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={test}
              disabled={busy === "test"}
              className="sm:w-24"
            >
              {busy === "test" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Test"
              )}
            </Button>
            {info?.configured && (
              <Button variant="ghost" onClick={remove} title="Remove key">
                <Trash2 className="h-4 w-4 text-red-400" />
              </Button>
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <StepList
            steps={[
              "Open bing.com/webmasters and verify your site",
              "Go to Settings → API Access → create an API key",
              "Paste the key here — batch submissions then use up to 10,000 URLs/day",
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}
