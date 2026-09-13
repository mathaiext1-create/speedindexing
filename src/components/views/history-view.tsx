"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { EngineChip } from "@/components/engine-chips";
import { api, type SubmissionDto } from "@/lib/types";

type IndexStatusDto = {
  submitted: boolean | null;
  when?: string;
  via: "api" | "search" | "none";
  message: string;
  siteSearchUrl: string;
};

export function HistoryView() {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<SubmissionDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [engine, setEngine] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, IndexStatusDto>>({});
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (q.trim()) params.set("q", q.trim());
      if (engine !== "all") params.set("engine", engine);
      if (status !== "all") params.set("status", status);
      const data = await api<{ total: number; submissions: SubmissionDto[] }>(
        `/api/submissions?${params}`
      );
      setSubmissions(data.submissions);
      setTotal(data.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [page, q, engine, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function retry(id: string) {
    setRetryingId(id);
    try {
      await api("/api/submissions/retry", {
        method: "POST",
        body: JSON.stringify({ submissionId: id }),
      });
      toast({ title: "Resubmitted successfully" });
      load();
    } catch (e) {
      toast({
        title: "Retry failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setRetryingId(null);
    }
  }

  async function checkStatus(s: SubmissionDto) {
    setCheckingId(s.id);
    try {
      const status = await api<IndexStatusDto>("/api/google/index-status", {
        method: "POST",
        body: JSON.stringify({ url: s.url }),
      });
      setChecks((prev) => ({ ...prev, [s.id]: status }));
    } catch (e) {
      toast({
        title: "Status check failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCheckingId(null);
    }
  }

  async function clearAll() {
    try {
      await api("/api/submissions", { method: "DELETE" });
      toast({ title: "History cleared" });
      setPage(1);
      load();
    } catch (e) {
      toast({
        title: "Failed to clear history",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>Submission history</CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes all submissions and their engine
                    results. Your service accounts and keys are kept.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clearAll}>
                    Delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search URL…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={engine}
            onValueChange={(v) => {
              setEngine(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-36">
              <SelectValue placeholder="Engine" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All engines</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="indexnow">IndexNow</SelectItem>
              <SelectItem value="bing">Bing</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : submissions.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">
            Nothing here yet — submissions will appear after your first batch.
          </p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-64">URL</TableHead>
                  <TableHead className="min-w-56">Engine results</TableHead>
                  <TableHead className="hidden md:table-cell whitespace-nowrap">
                    Date
                  </TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s) => {
                  const check = checks[s.id];
                  return (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-0">
                      <p className="truncate text-sm" title={s.url}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="hover:text-emerald-400 hover:underline"
                        >
                          {s.url}
                        </a>
                      </p>
                      <p className="text-xs text-muted-foreground">{s.host}</p>
                      {check && (
                        <p
                          className={
                            "mt-1 inline-flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[11px] " +
                            (check.submitted === true
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : check.submitted === false
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400")
                          }
                          title={check.message}
                        >
                          {check.submitted === true
                            ? `In Google — verified${check.when ? ` · ${new Date(check.when).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}`
                            : check.submitted === false
                              ? "Not submitted to Google yet — press Retry"
                              : "Could not auto-verify"}
                          <a
                            href={check.siteSearchUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="ml-1 underline underline-offset-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            verify
                          </a>
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {s.results.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          s.results.map((r) => (
                            <EngineChip key={r.id} result={r} />
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => checkStatus(s)}
                          disabled={checkingId === s.id}
                          title="Check live Google submission status (free, no quota)"
                        >
                          {checkingId === s.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => retry(s.id)}
                          disabled={retryingId === s.id}
                          title="Resubmit this URL"
                        >
                          {retryingId === s.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total} URLs
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
