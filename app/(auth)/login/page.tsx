"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { browserSupabase, supabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary for static generation.
  return (
    <Suspense fallback={<main className="auth-page"><h1>Sign in</h1></main>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const configured = supabaseConfigured();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = browserSupabase();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) return setError(error.message);
        // If email confirmation is on, there's no session yet.
        const { data } = await supabase.auth.getSession();
        if (data.session) router.push("/onboarding");
        else setInfo("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return setError(error.message);
        router.push(next);
      }
    } catch {
      setError("Authentication isn't configured yet.");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <main className="auth-page">
        <h1>Sign in</h1>
        <p className="ob-hint">
          Supabase Auth isn’t configured yet. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env</code> to enable login.
        </p>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <h1>{mode === "signup" ? "Create account" : "Welcome back"}</h1>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={6}
            required
          />
        </label>
        {error && <p role="alert" className="ob-error">{error}</p>}
        {info && <p className="ob-ok">{info}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "signup" ? "Sign up" : "Sign in"}
        </button>
      </form>
      <button
        className="ghost"
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setError(null);
          setInfo(null);
        }}
      >
        {mode === "signup" ? "Have an account? Sign in" : "New here? Create an account"}
      </button>
    </main>
  );
}
