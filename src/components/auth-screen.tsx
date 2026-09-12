"use client";

import { useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api, type UserDto } from "@/lib/types";

export function AuthScreen({
  onSuccess,
  initialMode = "login",
}: {
  onSuccess: (user: UserDto) => void;
  initialMode?: "login" | "register";
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
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
    <Card className="w-full max-w-sm shadow-2xl shadow-emerald-950/20 border-emerald-500/20">
      <CardContent className="p-6 space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="brand-glow flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {mode === "login" ? "Welcome back" : "Create your free account"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "login"
                ? "Sign in to start indexing"
                : "10 seconds — email and password only"}
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
          <Button
            onClick={submit}
            disabled={loading || !email || !password}
            className="w-full brand-glow"
          >
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
  );
}
