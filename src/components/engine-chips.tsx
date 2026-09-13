"use client";

import { CheckCircle2, XCircle, MinusCircle, Zap } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EngineName, SubmissionResultDto } from "@/lib/types";

const ENGINE_LABEL: Record<EngineName, string> = {
  google: "Google",
  indexnow: "IndexNow",
  bing: "Bing",
  discovery: "Discovery",
};

const STATUS_STYLE = {
  success: {
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    ring: "border-emerald-500/30 bg-emerald-500/10",
    Icon: CheckCircle2,
  },
  failed: {
    dot: "bg-red-400",
    text: "text-red-400",
    ring: "border-red-500/30 bg-red-500/10",
    Icon: XCircle,
  },
  skipped: {
    dot: "bg-zinc-500",
    text: "text-zinc-400",
    ring: "border-zinc-500/30 bg-zinc-500/10",
    Icon: MinusCircle,
  },
} as const;

export function EngineChip({ result }: { result: SubmissionResultDto }) {
  const style = STATUS_STYLE[result.status] ?? STATUS_STYLE.skipped;
  const label = ENGINE_LABEL[result.engine] ?? result.engine;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium cursor-help",
              style.ring,
              style.text
            )}
          >
            <style.Icon className="h-3 w-3" />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 text-xs">
          <p className="font-semibold mb-0.5">
            {label} — {result.status}
            {result.httpStatus ? ` (HTTP ${result.httpStatus})` : ""}
          </p>
          {result.message && <p>{result.message}</p>}
          {result.accountLabel && (
            <p className="mt-1 text-zinc-400">via {result.accountLabel}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function PipelineStatusChip({
  label,
  ready,
  detail,
}: {
  label: string;
  ready: boolean;
  detail?: string;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              ready
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
            )}
          >
            <Zap className="h-3 w-3" />
            {label}
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                ready ? "bg-emerald-400" : "bg-zinc-500"
              )}
            />
          </span>
        </TooltipTrigger>
        {detail && (
          <TooltipContent side="bottom" className="max-w-64 text-xs">
            {detail}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
