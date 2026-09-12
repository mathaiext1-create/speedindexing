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
import { api, type UserDto } from "@/lib/types";
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

function AuthScreen({ onSuccess }: { onSuccess: (user: UserDto) => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email || !password) return;
    setLoading(true);
    try {
      const data = await api<{ ok: true; user: UserDto }>(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        { method: "POST", body: JSON.stringify({ email, password }) }
      );
      onSuccess(data.user);
    } catch (e) {
      toast({
        title: mode === "login" ? "Sign in failed" : "Could not create account",
        description: e instanceof Error ? e.message : undefined,
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
                {mode === "login"
                  ? "Sign in to your account"
                  : "Create your free account"}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && password && submit()}
              autoFocus
            />
            <Input
              type="password"
              placeholder={mode === "register" ? "Password (min 6 characters)" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Button onClick={submit} disabled={loading || !email || !password} className="w-full">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "login" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </Button>
          </div>
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="w-full text-xs text-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === "login" ? (
              <>
                No account yet?{" "}
                <span className="text-emerald-400 font-medium">Create one free</span>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <span className="text-emerald-400 font-medium">Sign in</span>
              </>
            )}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<UserDto | null | undefined>(undefined);
  const [view, setView] = useState<View>("submit");

  useEffect(() => {
    let cancelled = false;
    api<{ authenticated: boolean; user: UserDto | null }>("/api/auth/session")
      .then((d) => {
        if (!cancelled) setUser(d.authenticated && d.user ? d.user : null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  if (user === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onSuccess={(u) => setUser(u)} />;
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

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block max-w-40 truncate">
              {user.email}
            </span>
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
        {view === "submit" && (
          <SubmitView onNavigate={(v) => setView(v as View)} />
        )}
        {view === "history" && <HistoryView />}
        {view === "engines" && <EnginesView />}
        {view === "guide" && <GuideView />}
      </main>

      {/* Sticky footer */}
      <footer className="mt-auto border-t py-4">
        <p className="text-center text-xs text-muted-foreground">
          SpeedIndexing · instant indexing SaaS · Google Indexing API +
          IndexNow + Bing
        </p>
      </footer>
    </div>
  );
}
