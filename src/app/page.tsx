"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  History,
  Loader2,
  LogOut,
  PlugZap,
  Rocket,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/types";
import { SubmitView } from "@/components/views/submit-view";
import { HistoryView } from "@/components/views/history-view";
import { EnginesView } from "@/components/views/engines-view";
import { GuideView } from "@/components/views/guide-view";

type View = "submit" | "history" | "engines" | "guide";

const NAV: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: "submit", label: "Submit", icon: <Rocket className="h-4 w-4" /> },
  { id: "history", label: "History", icon: <History className="h-4 w-4" /> },
  { id: "engines", label: "Engines", icon: <PlugZap className="h-4 w-4" /> },
  { id: "guide", label: "Guide", icon: <BookOpen className="h-4 w-4" /> },
];

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    if (!password) return;
    setLoading(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      onSuccess();
    } catch {
      toast({
        title: "Wrong password",
        description: "This is your personal indexing tool — set the password in the APP_PASSWORD environment variable.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 space-y-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="brand-glow flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">SpeedIndexing</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Your private instant URL indexing tool
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Access password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              autoFocus
            />
            <Button onClick={login} disabled={loading || !password} className="w-full">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Unlock tool"
              )}
            </Button>
          </div>
          <p className="text-xs text-center text-muted-foreground">
            Default password: <code className="text-emerald-400">speedindex</code>{" "}
            — change it via the APP_PASSWORD env var
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("submit");

  useEffect(() => {
    let cancelled = false;
    api<{ authenticated: boolean }>("/api/auth/session")
      .then((d) => {
        if (!cancelled) setAuthed(d.authenticated);
      })
      .catch(() => {
        if (!cancelled) setAuthed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setAuthed(false);
  }

  if (authed === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen onSuccess={() => setAuthed(true)} />;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="brand-glow flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="h-4 w-4" />
            </div>
            <span className="font-bold tracking-tight hidden sm:block">
              SpeedIndexing
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="ml-4 hidden sm:flex items-center gap-1" aria-label="Main">
            {NAV.map((item) => (
              <Button
                key={item.id}
                variant={view === item.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView(item.id)}
                className={cn(
                  "gap-1.5",
                  view === item.id && "text-emerald-400"
                )}
              >
                {item.icon}
                {item.label}
              </Button>
            ))}
          </nav>

          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={logout} title="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav
          className="sm:hidden flex overflow-x-auto px-2 pb-2 gap-1"
          aria-label="Mobile"
        >
          {NAV.map((item) => (
            <Button
              key={item.id}
              variant={view === item.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView(item.id)}
              className={cn(
                "gap-1.5 shrink-0",
                view === item.id && "text-emerald-400"
              )}
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6">
        {view === "submit" && <SubmitView onNavigate={() => setView("history")} />}
        {view === "history" && <HistoryView />}
        {view === "engines" && <EnginesView />}
        {view === "guide" && <GuideView />}
      </main>

      {/* Sticky footer */}
      <footer className="mt-auto border-t py-4">
        <p className="text-center text-xs text-muted-foreground">
          SpeedIndexing · your personal instant indexing tool · Google Indexing
          API + IndexNow + Bing
        </p>
      </footer>
    </div>
  );
}
