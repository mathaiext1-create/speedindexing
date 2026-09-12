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
import { cn } from "@/lib/utils";
import { api, type UserDto } from "@/lib/types";
import { SubmitView } from "@/components/views/submit-view";
import { HistoryView } from "@/components/views/history-view";
import { EnginesView } from "@/components/views/engines-view";
import { GuideView } from "@/components/views/guide-view";
import { Landing } from "@/components/landing";

type View = "submit" | "history" | "engines" | "guide";

const NAV: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: "submit", label: "Submit", icon: <Rocket className="h-4 w-4" /> },
  { id: "history", label: "History", icon: <History className="h-4 w-4" /> },
  { id: "engines", label: "Engines", icon: <PlugZap className="h-4 w-4" /> },
  { id: "guide", label: "Guide", icon: <BookOpen className="h-4 w-4" /> },
];

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
    return <Landing onAuthed={(u) => setUser(u)} />;
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
