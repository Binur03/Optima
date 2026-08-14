"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_GOAL_DELTAS } from "@/lib/goals";
import type { Goal } from "@/lib/delta";

const GOALS: { key: Goal; title: string; blurb: string }[] = [
  { key: "CUT", title: "Cut", blurb: "Lose fat · TDEE − 500" },
  { key: "MAINTAIN", title: "Maintain", blurb: "Hold steady · TDEE" },
  { key: "BULK", title: "Bulk", blurb: "Build muscle · TDEE + 300" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [goal, setGoal] = useState<Goal>("MAINTAIN");
  const [goalDelta, setGoalDelta] = useState<number>(DEFAULT_GOAL_DELTAS.MAINTAIN);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickGoal(g: Goal) {
    setGoal(g);
    setGoalDelta(DEFAULT_GOAL_DELTAS[g]);
  }

  async function saveGoal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          goalDelta,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Please sign in first." : "Couldn't save. Try again.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding">
      <h1>Set up MacroDelta</h1>

      <section className="ob-step">
        <h2>1 · Your goal</h2>
        <div className="goal-grid">
          {GOALS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`goal-card${goal === g.key ? " goal-selected" : ""}`}
              onClick={() => pickGoal(g.key)}
              aria-pressed={goal === g.key}
            >
              <span className="goal-title">{g.title}</span>
              <span className="goal-blurb">{g.blurb}</span>
            </button>
          ))}
        </div>

        <label className="delta-tuner">
          Daily target vs. maintenance:{" "}
          <strong>{goalDelta >= 0 ? `+${goalDelta}` : goalDelta} kcal</strong>
          <input
            type="range"
            min={-1000}
            max={700}
            step={50}
            value={goalDelta}
            onChange={(e) => setGoalDelta(Number(e.target.value))}
          />
        </label>

        {error && <p role="alert" className="ob-error">{error}</p>}
        {!saved ? (
          <button className="primary" onClick={saveGoal} disabled={busy}>
            {busy ? "Saving…" : "Save goal"}
          </button>
        ) : (
          <p className="ob-ok">✓ Goal saved</p>
        )}
      </section>

      <section className={`ob-step${saved ? "" : " ob-disabled"}`}>
        <h2>2 · Connect your wearable</h2>
        <p className="ob-hint">Pulls your daily burn to build the 7-day maintenance baseline.</p>
        <a
          className={`primary fitbit-btn${saved ? "" : " is-disabled"}`}
          href={saved ? "/api/fitbit/connect" : undefined}
          aria-disabled={!saved}
        >
          Connect Google Health
        </a>
        <button className="ghost" onClick={() => router.push("/dashboard")} disabled={!saved}>
          Skip for now
        </button>
      </section>
    </main>
  );
}
