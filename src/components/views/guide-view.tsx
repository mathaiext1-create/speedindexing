"use client";

import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Cloud,
  Gauge,
  Rocket,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function GuideItem({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="flex items-center gap-2 text-base">
              {icon}
              {title}
              <ChevronDown
                className={cn(
                  "ml-auto h-4 w-4 transition-transform",
                  open && "rotate-180"
                )}
              />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="font-mono text-emerald-400 shrink-0 text-xs mt-0.5">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function GuideView() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-400" />
            How SpeedIndexing works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-3">
          <p>
            When you submit URLs, this tool simultaneously pings three
            official channels that tell search engines &quot;crawl me
            now&quot;: the <strong className="text-foreground">Google Indexing API</strong>{" "}
            (per-URL notification, usually crawled within minutes),{" "}
            <strong className="text-foreground">IndexNow</strong> (the
            shared instant protocol of Bing, Yandex, Naver and Seznam), and the{" "}
            <strong className="text-foreground">Bing Webmaster API</strong>{" "}
            (direct batch push, up to 10k URLs/day).
          </p>
          <p>
            The paid tools you compared do exactly this under the hood — the
            &quot;3–5 minute indexing&quot; comes from the Google Indexing API
            plus a healthy site. Everything here runs on your own domain, with
            your own API quotas, for $0.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="font-normal gap-1.5">
              <Gauge className="h-3 w-3" /> 200 URLs/day per Google service
              account
            </Badge>
            <Badge variant="outline" className="font-normal gap-1.5">
              <Rocket className="h-3 w-3" /> Add accounts to multiply quota
            </Badge>
          </div>
        </CardContent>
      </Card>

      <GuideItem
        title="Setup 1 · Google Indexing API (the fast one)"
        icon={<Rocket className="h-4 w-4 text-emerald-400" />}
        defaultOpen
      >
        <Steps
          items={[
            "Go to console.cloud.google.com and create a project (free).",
            "In APIs & Services → Library, search and enable 'Web Search Indexing API'.",
            "Go to IAM & Admin → Service Accounts → Create service account (no roles needed).",
            "Open the account → Keys → Add key → Create new key → JSON. Download the file.",
            "Engines tab → 'Add service account' → paste the whole JSON file.",
            "LAST STEP — permission: click 'Connect Google — fix all sites' on the Engines tab and we add the permission automatically. Manual alternative: Search Console → Settings → Users and permissions → Add user → paste the robot email → role 'Owner'.",
          ]}
        />
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-2 mt-1">
          <p className="font-medium text-amber-300">
            Why does Google need permission when competitors never ask?
          </p>
          <p>
            They DO ask — it&apos;s just hidden behind a &quot;Connect your
            site&quot; or &quot;Verify&quot; button, and it does exactly the
            same thing: Google only allows the owner of a website to request
            faster crawling. That single rule is what stops anyone from
            spam-indexing sites they don&apos;t own. Tools that need zero
            setup don&apos;t use the Google API at all — they rely on slower,
            less reliable crawler tricks.
          </p>
          <p>
            Adding the robot email as Owner is a PRIVATE Search Console
            setting. It gives nobody access to your site, changes nothing
            public, and can be removed any time. It is one click per site,
            once forever — or zero clicks with the Connect Google button.
          </p>
        </div>
        <p className="text-xs pt-2">
          Tip: each account gives 200 URL notifications/day. Add 2–3 accounts
          from different projects and the tool rotates them automatically when
          one hits its quota.
        </p>
      </GuideItem>

      <GuideItem
        title="Setup 2 · IndexNow (Bing / Yandex / Naver / Seznam)"
        icon={<Zap className="h-4 w-4 text-emerald-400" />}
      >
        <Steps
          items={[
            "Engines tab → 'Generate IndexNow key'.",
            "Download the {key}.txt file it offers.",
            "Upload that file to the ROOT of every site you plan to index — on Vercel just drop it into /public and redeploy. It must be reachable at https://yourdomain.com/{key}.txt.",
            "Use 'Verify' on the Engines tab to confirm the file is live.",
            "That's it — every submission now instantly reaches all four search engines.",
          ]}
        />
        <p className="text-xs pt-2">
          The key file proves to IndexNow that you own the domain, so this one
          file works for unlimited URLs on that domain.
        </p>
      </GuideItem>

      <GuideItem
        title="Setup 3 · Bing Webmaster API (optional, heavy duty)"
        icon={<Cloud className="h-4 w-4 text-emerald-400" />}
      >
        <Steps
          items={[
            "Open bing.com/webmasters and import/verify your site (you can import from Google Search Console in one click).",
            "Settings → API Access → Create API key.",
            "Paste it in the Engines tab → Save → Test.",
            "Bing then accepts 10,000 URLs/day through this tool — great for bulk indexing.",
          ]}
        />
      </GuideItem>

      <GuideItem
        title="Deploying to your Vercel domain"
        icon={<Cloud className="h-4 w-4 text-emerald-400" />}
      >
        <Steps
          items={[
            "Push this project to a GitHub repo (or use the existing one).",
            "On vercel.com → Add New Project → import the repo.",
            "The free SQLite file doesn't persist on serverless, so create a free Postgres at neon.tech (or Vercel Postgres).",
            "In Vercel → Settings → Environment Variables set DATABASE_URL (Neon's POOLED connection string). Optionally set APP_SECRET (any long random string) to harden sign-in sessions.",
            "Deploy — the Prisma provider and database tables are set up automatically on the first build/visit. Nothing to run by hand.",
            "Your tool is now live on your own Vercel domain — visitors create their own accounts (sign up with email + password), and every account sees only its own engines, keys and history.",
          ]}
        />
        <p className="text-xs pt-2">
          The repo auto-detects the database: SQLite locally, PostgreSQL on
          Vercel. Tables are created on first use — no migration commands
          needed.
        </p>
      </GuideItem>

      <GuideItem
        title="What 'instant indexing' really means"
        icon={<BookOpen className="h-4 w-4 text-emerald-400" />}
      >
        <p>
          Submitting tells search engines your URL exists <em>right now</em> —
          how fast they crawl and rank it also depends on your site health:
          unique content, fast pages, internal links and an existing crawl
          history. New domains may still take longer than established ones; the
          notifications themselves arrive instantly.
        </p>
        <p className="text-xs">
          Google's API is officially built for JobPosting & BroadcastEvent
          pages but is the industry-standard trick used by every paid indexer
          for all page types. IndexNow and Bing are fully official for all
          content.
        </p>
      </GuideItem>
    </div>
  );
}
