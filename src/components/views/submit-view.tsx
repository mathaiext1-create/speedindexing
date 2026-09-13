"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  Globe,
  Loader2,
  RefreshCw,
  Rocket,
  Rss,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { EngineChip, PipelineStatusChip } from "@/components/engine-chips";
import { GscFixCard } from "@/components/gsc-fix-card";
import {
  api,
  type StatsDto,
  type SubmissionDto,
  type SubmitSummary,
} from "@/lib/types";

const ENGINES = [
  {
    id: "google" as const,
    name: "Google Indexing API",
    desc: "Fastest path into Google — needs at least 1 service account",
  },
  {
    id: "indexnow" as const,
    name: "IndexNow",
    desc: "Instant for Bing, Yandex, Naver & Seznam — needs key file on your site",
  },
  {
    id: "bing" as const,
    name: "Bing Webmaster API",
    desc: "Direct batch submission to Bing — needs API key",
  },
];

export function SubmitView({
  onNavigate,
}: {
  onNavigate: (view: "history" | "engines") => void;
}) {
  const { toast } = useToast();
  const [urlText, setUrlText] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<SubmitSummary | null>(null);
  const [engines, setEngines] = useState({
    google: true,
    indexnow: true,
    bing: false,
  });
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [recent, setRecent] = useState<SubmissionDto[]>([]);
  const [lastSubmitted, setLastSubmitted] = useState<string>("");

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        api<StatsDto>("/api/stats"),
        api<{ submissions: SubmissionDto[] }>(
          "/api/submissions?limit=8&page=1"
        ),
      ]);
      setStats(s);
      setRecent(r.submissions);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const urlCount = useMemo(
    () =>
      urlText
        .split(/[\n,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean).length,
    [urlText]
  );

  async function importSitemap() {
    if (!sitemapUrl.trim()) {
      toast({
        title: "Enter a sitemap URL first",
        variant: "destructive",
      });
      return;
    }
    setImporting(true);
    try {
      const { urls, count } = await api<{ urls: string[]; count: number }>(
        "/api/sitemap",
        {
          method: "POST",
          body: JSON.stringify({ sitemapUrl }),
        }
      );
      if (count === 0) {
        toast({ title: "No URLs found in that sitemap" });
      } else {
        const existing = new Set(
          urlText
            .split(/[\n,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        );
        const merged = Array.from(new Set([...existing, ...urls])).slice(0, 500);
        setUrlText(merged.join("\n"));
        toast({
          title: `Imported ${count} URLs from sitemap`,
          description:
            merged.length >= 500
              ? "Capped at 500 URLs — submit in batches"
              : undefined,
        });
      }
    } catch (e) {
      toast({
        title: "Sitemap import failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  }

  async function doSubmit(raw: string) {
    setSubmitting(true);
    setSummary(null);
    try {
      const { summary: s } = await api<{ summary: SubmitSummary }>(
        "/api/submit",
        {
          method: "POST",
          body: JSON.stringify({ urls: raw, engines }),
        }
      );
      setSummary(s);
      toast({
        title: `Submitted ${s.total} URL${s.total > 1 ? "s" : ""} — watch the results below`,
      });
      refresh();
    } catch (e) {
      toast({
        title: "Submission failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    if (urlCount === 0) {
      toast({ title: "Paste at least one URL", variant: "destructive" });
      return;
    }
    setLastSubmitted(urlText);
    const raw = urlText;
    await doSubmit(raw);
    setUrlText("");
  }

  async function retry(id: string) {
    try {
      await api("/api/submissions/retry", {
        method: "POST",
        body: JSON.stringify({ submissionId: id }),
      });
      toast({ title: "Retried successfully" });
      refresh();
    } catch (e) {
      toast({
        title: "Retry failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  }

  const pipeline = stats?.pipeline;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">URLs submitted</p>
          <p className="text-2xl font-bold mt-1">{stats?.total ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="text-2xl font-bold mt-1">{stats?.today ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Engine success rate</p>
          <p className="text-2xl font-bold mt-1">
            {stats?.successRate != null ? `${stats.successRate}%` : "—"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Google daily quota</p>
          <p className="text-2xl font-bold mt-1">
            {pipeline ? pipeline.googleDailyQuota : "—"}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              URLs/day
            </span>
          </p>
        </Card>
      </div>

      {/* Pipeline status */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Pipeline:</span>
        <PipelineStatusChip
          label="Google API"
          ready={!!pipeline && pipeline.googleAccounts > 0}
          detail={
            pipeline && pipeline.googleAccounts > 0
              ? `${pipeline.googleAccounts} active service account(s)`
              : "Add a service account in Engines"
          }
        />
        <PipelineStatusChip
          label="IndexNow"
          ready={!!pipeline && pipeline.indexnowReady}
          detail={
            pipeline?.indexnowReady
              ? "Key generated — host the key file on your site"
              : "Generate a key in Engines"
          }
        />
        <PipelineStatusChip
          label="Bing API"
          ready={!!pipeline && pipeline.bingReady}
          detail={
            pipeline?.bingReady
              ? "API key connected"
              : "Optional — connect in Engines"
          }
        />
      </div>

      {/* Setup required banner — Google has no service account yet */}
      {pipeline && pipeline.googleAccounts === 0 && (
        <button
          onClick={() => onNavigate("engines")}
          className="w-full text-left rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3 hover:bg-amber-500/15 transition-colors"
        >
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <span className="text-sm">
            <span className="font-medium text-amber-300">
              Finish setup to make Google indexing work (2 minutes)
            </span>
            <span className="block text-muted-foreground mt-1">
              Your URLs are saved, but Google skips them until you connect a
              service account: create it in Google Cloud, then add its email as
              a delegated owner in YOUR Search Console (private — your site
              stays public exactly as it is now). Click here to open the
              step-by-step guide in Engines.
            </span>
          </span>
        </button>
      )}

      {/* Submit card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-emerald-400" />
            Submit URLs for instant indexing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="urls">
                One URL per line
                <Badge variant="secondary" className="ml-2 font-mono">
                  {urlCount} / 500
                </Badge>
              </Label>
            </div>
            <Textarea
              id="urls"
              placeholder={"https://yoursite.com/post-1\nhttps://yoursite.com/post-2\nhttps://vercel.com/..."}
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              className="min-h-40 max-h-96 overflow-y-auto font-mono text-sm"
            />
          </div>

          {/* Sitemap import */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Rss className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Import from sitemap — https://yoursite.com/sitemap.xml"
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="secondary"
              onClick={importSitemap}
              disabled={importing}
              className="sm:w-32"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Import
            </Button>
          </div>

          {/* Engine toggles */}
          <div className="grid gap-3 sm:grid-cols-3">
            {ENGINES.map((e) => (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-tight">{e.name}</p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {e.desc}
                  </p>
                </div>
                <Switch
                  checked={engines[e.id]}
                  onCheckedChange={(v) =>
                    setEngines((prev) => ({ ...prev, [e.id]: v }))
                  }
                  aria-label={`Toggle ${e.name}`}
                />
              </div>
            ))}
          </div>

          <Button
            onClick={submit}
            disabled={submitting || urlCount === 0}
            size="lg"
            className="w-full sm:w-auto brand-glow"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting {urlCount} URL{urlCount > 1 ? "s" : ""}…
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                Index {urlCount || ""} URL{urlCount === 1 ? "" : "s"} now
              </>
            )}
          </Button>

          {/* Summary */}
          {summary && (
            <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
              <p className="text-sm font-medium">
                Batch complete — {summary.total} URL
                {summary.total > 1 ? "s" : ""}
                {summary.duplicatesRemoved > 0 &&
                  ` · ${summary.duplicatesRemoved} duplicate(s) removed`}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary.engines).map(([engine, counts]) => (
                  <Badge
                    key={engine}
                    variant="outline"
                    className="font-normal"
                  >
                    {engine}:{" "}
                    <span className="text-emerald-400 ml-1">
                      {counts.success} ok
                    </span>
                    {counts.failed > 0 && (
                      <span className="text-red-400 ml-1">
                        {counts.failed} failed
                      </span>
                    )}
                    {counts.skipped > 0 && (
                      <span className="text-zinc-400 ml-1">
                        {counts.skipped} skipped
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
              {/* Boosted (no-access) URLs — positive framing, never an error */}
              {!!summary.boosted && summary.boosted > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <Rocket className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <p className="font-medium text-emerald-300">
                      {summary.boosted} URL{summary.boosted > 1 ? "s" : ""}{" "}
                      boosted — submitted to the crawler network
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Google discovers boosted URLs naturally, usually within
                      hours to a few days
                      {summary.boostedHosts && summary.boostedHosts.length > 0
                        ? ` (site${summary.boostedHosts.length > 1 ? "s" : ""}: ${summary.boostedHosts.join(", ")})`
                        : ""}
                      . Unlock the instant lane for a site with the one-time
                      Owner permission below.
                    </p>
                  </div>
                </div>
              )}
              {summary.sampleErrors.length > 0 && (
                <ul className="space-y-1">
                  {summary.sampleErrors.map((err, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-1.5 text-xs text-red-400"
                    >
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      {err}
                    </li>
                  ))}
                </ul>
              )}
              {!!summary.boosted && summary.boosted > 0 && (
                <GscFixCard
                  onRetry={() => lastSubmitted && doSubmit(lastSubmitted)}
                  compact
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent submissions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent submissions</CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onNavigate("history")}>
              View all
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Globe className="h-8 w-8" />
              <p className="text-sm">
                No submissions yet — paste your first URLs above
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">URL</TableHead>
                  <TableHead>Engines</TableHead>
                  <TableHead className="hidden sm:table-cell">When</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-0">
                      <p className="truncate text-sm" title={s.url}>
                        {s.url}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {s.results.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        ) : (
                          s.results.map((r) => (
                            <EngineChip key={r.id} result={r} />
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => retry(s.id)}
                        title="Retry failed engines"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ClearHistoryIcon() {
  return <Trash2 className="h-4 w-4" />;
}
