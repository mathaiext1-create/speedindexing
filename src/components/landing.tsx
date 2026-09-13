"use client";

import {
  ArrowRight,
  BookOpen,
  Cloud,
  Gauge,
  KeyRound,
  Lock,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuthScreen } from "@/components/auth-screen";
import type { UserDto } from "@/lib/types";

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const ENGINES = [
  {
    icon: <Rocket className="h-5 w-5 text-emerald-400" />,
    name: "Google Indexing API",
    tag: "the fast one",
    desc: "Notifies Google the moment you publish or update a page — the same official API paid indexers use. Typical crawl in minutes, 200 URLs/day per connected account.",
  },
  {
    icon: <Zap className="h-5 w-5 text-emerald-400" />,
    name: "IndexNow",
    tag: "4 engines at once",
    desc: "One hosted key file instantly pings Bing, Yandex, Naver and Seznam for every URL you submit. Zero per-URL cost, unlimited sites.",
  },
  {
    icon: <Cloud className="h-5 w-5 text-emerald-400" />,
    name: "Bing Webmaster API",
    tag: "heavy duty",
    desc: "Direct batch push of up to 10,000 URLs/day straight into Bing — perfect for sitemaps, migrations and bulk publishing days.",
  },
];

const STEPS = [
  {
    title: "Create your free account",
    desc: "Email and password — nothing else. Your URLs, keys and history stay in your private workspace.",
  },
  {
    title: "Connect engines once (2 min)",
    desc: "Paste your Google service-account JSON, generate an IndexNow key, optionally add a Bing API key. The built-in guide walks you through every click.",
  },
  {
    title: "Paste URLs — watch it happen",
    desc: "Drop up to 500 URLs (or import a sitemap), hit submit, and see per-engine results live. Anything that fails gets a one-tap fix and retry.",
  },
];

export function Landing({ onAuthed }: { onAuthed: (user: UserDto) => void }) {
  return (
    <div className="flex-1 flex flex-col">
      {/* ---- Nav ---- */}
      <header className="sticky top-0 z-30 border-b bg-background/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="brand-glow flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="h-5 w-5" />
            </div>
            <span className="font-bold tracking-tight text-lg">SpeedIndexing</span>
          </div>
          <nav className="ml-6 hidden md:flex items-center gap-1 text-sm text-muted-foreground">
            <button onClick={() => scrollTo("engines")} className="px-3 py-2 rounded-md hover:text-foreground hover:bg-muted/50 transition-colors">
              Engines
            </button>
            <button onClick={() => scrollTo("how")} className="px-3 py-2 rounded-md hover:text-foreground hover:bg-muted/50 transition-colors">
              How it works
            </button>
            <button onClick={() => scrollTo("safe")} className="px-3 py-2 rounded-md hover:text-foreground hover:bg-muted/50 transition-colors">
              Is my site safe?
            </button>
          </nav>
          <div className="ml-auto">
            <Button size="sm" onClick={() => scrollTo("start")} className="brand-glow">
              Sign in / Get started
            </Button>
          </div>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden">
        {/* glow background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(600px 300px at 20% 0%, rgba(16,185,129,0.12), transparent 70%), radial-gradient(500px 260px at 85% 10%, rgba(16,185,129,0.07), transparent 70%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-4 pt-14 pb-16 md:pt-24 md:pb-24 grid gap-12 lg:grid-cols-[1.15fr_0.85fr] items-center">
          <div className="space-y-7">
            <Badge
              variant="outline"
              className="gap-1.5 border-emerald-500/40 text-emerald-400 font-normal"
            >
              <Sparkles className="h-3.5 w-3.5" />
              3 official engines · one click · your own keys
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Get your URLs on{" "}
              <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-300 bg-clip-text text-transparent">
                Google in minutes
              </span>
              , not weeks.
            </h1>
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-xl">
              SpeedIndexing pushes every new page straight into the Google
              Indexing API, IndexNow and Bing Webmaster the moment you hit
              submit — the exact official channels behind the paid indexing
              tools, running on your own free quotas for{" "}
              <span className="text-foreground font-medium">$0</span>.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" onClick={() => scrollTo("start")} className="brand-glow text-base">
                Start free — index your first URL
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="secondary" onClick={() => scrollTo("how")} className="text-base">
                See how it works
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> No credit card
              </span>
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-emerald-400" /> Your own API keys
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-emerald-400" /> Private workspace per account
              </span>
            </div>
            <div className="flex flex-wrap gap-6 pt-2 border-t border-border/60">
              <div>
                <p className="text-2xl font-bold">~5 min</p>
                <p className="text-xs text-muted-foreground">typical Google crawl after submit</p>
              </div>
              <div>
                <p className="text-2xl font-bold">500</p>
                <p className="text-xs text-muted-foreground">URLs per batch</p>
              </div>
              <div>
                <p className="text-2xl font-bold">10,020+</p>
                <p className="text-xs text-muted-foreground">URLs/day combined capacity</p>
              </div>
            </div>
          </div>

          {/* Auth card */}
          <div id="start" className="flex justify-center lg:justify-end scroll-mt-24">
            <AuthScreen onSuccess={onAuthed} />
          </div>
        </div>
      </section>

      {/* ---- Engines ---- */}
      <section id="engines" className="border-t bg-muted/20 scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20 space-y-10">
          <div className="space-y-3 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              Three official channels, fired together
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              One submit button fans out to every engine and shows a live
              result per URL — successes, failures and fixes, all in one place.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {ENGINES.map((e) => (
              <div
                key={e.name}
                className="rounded-xl border bg-card p-6 space-y-3 hover:border-emerald-500/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                    {e.icon}
                  </div>
                  <Badge variant="secondary" className="font-normal text-xs">
                    {e.tag}
                  </Badge>
                </div>
                <h3 className="font-semibold">{e.name}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{e.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section id="how" className="scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20 space-y-10">
          <div className="space-y-3 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              Live in under five minutes
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No code, no servers to manage. The setup is one-time — after that
              it&apos;s just paste and submit.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-xl border bg-card p-6 space-y-3 relative overflow-hidden">
                <span className="absolute -top-3 -right-1 text-7xl font-bold text-emerald-500/10 select-none">
                  {i + 1}
                </span>
                <p className="font-mono text-xs text-emerald-400">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Badge variant="outline" className="gap-1.5 font-normal">
              <Gauge className="h-3.5 w-3.5 text-emerald-400" /> 200 URLs/day per Google account — add more to scale
            </Badge>
            <Badge variant="outline" className="gap-1.5 font-normal">
              <BookOpen className="h-3.5 w-3.5 text-emerald-400" /> Step-by-step guide built into the app
            </Badge>
          </div>
        </div>
      </section>

      {/* ---- Privacy / safety ---- */}
      <section id="safe" className="border-t bg-muted/20 scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] items-center">
          <div className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
              <ShieldCheck className="h-6 w-6 text-emerald-400" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              &quot;Is my site safe?&quot; — Yes. 100% private.
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connecting a website only <em>proves to Google that you own
              it</em> — through private API keys and a Search Console setting
              that only you can see. Nothing on your site is published,
              changed, or opened to anyone. Your visitors see exactly the same
              site as before.
            </p>
          </div>
          <div className="space-y-3">
            {[
              {
                icon: <Lock className="h-4 w-4 text-emerald-400" />,
                title: "No public access, ever",
                desc: "Search Console and API keys are private dashboards. Other people cannot see, use or submit anything for your domains.",
              },
              {
                icon: <KeyRound className="h-4 w-4 text-emerald-400" />,
                title: "Your keys, your account",
                desc: "API keys live only inside your workspace. The tool never shares them, and every account sees only its own data.",
              },
              {
                icon: <Trash2 className="h-4 w-4 text-emerald-400" />,
                title: "Revoke in one click",
                desc: "Pause or delete any connected engine at any time — access disappears instantly. You stay in full control.",
              },
            ].map((p) => (
              <div key={p.title} className="flex gap-3 rounded-xl border bg-card p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                  {p.icon}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Final CTA ---- */}
      <section className="relative overflow-hidden border-t">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(500px 260px at 50% 100%, rgba(16,185,129,0.10), transparent 70%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20 text-center space-y-6">
          <h2 className="text-2xl md:text-4xl font-bold tracking-tight">
            Your next article could be on Google tonight.
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Create a free account, connect one engine, and submit your first
            batch in the next five minutes.
          </p>
          <Button size="lg" onClick={() => scrollTo("start")} className="brand-glow text-base">
            Create my free account
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="mt-auto border-t py-6">
        <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} SpeedIndexing · instant indexing for your sites</p>
          <p>Google Indexing API · IndexNow (Bing, Yandex, Naver, Seznam) · Bing Webmaster API</p>
        </div>
      </footer>
    </div>
  );
}
