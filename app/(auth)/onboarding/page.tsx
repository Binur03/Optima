"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_GOAL_DELTAS } from "@/lib/goals";
import {
  calculateTdee,
  ACTIVITY_LABELS,
  type ActivityLevel,
  type BiologicalSex,
} from "@/lib/nutrition";
import type { Goal } from "@/lib/delta";

const GOALS: { key: Goal; title: string; blurb: string }[] = [
  { key: "CUT", title: "Cut", blurb: "Lose fat · TDEE − 500" },
  { key: "MAINTAIN", title: "Maintain", blurb: "Hold steady · TDEE" },
  { key: "BULK", title: "Bulk", blurb: "Build muscle · TDEE + 300" },
];

const ACTIVITIES = Object.keys(ACTIVITY_LABELS) as ActivityLevel[];

export default function OnboardingPage() {
  const router = useRouter();

  const [goal, setGoal] = useState<Goal>("MAINTAIN");
  const [goalDelta, setGoalDelta] = useState<number>(DEFAULT_GOAL_DELTAS.MAINTAIN);
  const [hasWearable, setHasWearable] = useState<boolean | null>(null);

  // Manual metrics
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<BiologicalSex>("MALE");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [tdee, setTdee] = useState<number | null>(null); // calculated, then editable

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickGoal(g: Goal) {
    setGoal(g);
    setGoalDelta(DEFAULT_GOAL_DELTAS[g]);
  }

  function recalc() {
    const t = calculateTdee({
      weightKg: Number(weightKg),
      heightCm: Number(heightCm),
      age: Number(age),
      sex,
      activity,
    });
    setTdee(t);
    if (t === null) setError("Fill in age, height, and weight to calculate.");
    else setError(null);
  }

  async function save(payload: Record<string, unknown>, dest: string) {
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
          ...payload,
        }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Please sign in first." : "Couldn't save. Try again.");
        return;
      }
      if (dest.startsWith("/api/")) window.location.assign(dest);
      else router.push(dest);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const target = tdee === null ? null : tdee + goalDelta;

  return (
    <main className="onboarding">
      <h1>Set up Optima</h1>

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
      </section>

      <section className="ob-step">
        <h2>2 · Do you have a fitness wearable?</h2>
        <p className="ob-hint">A Fitbit / Google-connected device auto-tracks your daily burn.</p>
        <div className="wearable-choice">
          <button
            type="button"
            className={`choice-card${hasWearable === true ? " choice-selected" : ""}`}
            onClick={() => setHasWearable(true)}
            aria-pressed={hasWearable === true}
          >
            ⌚ Yes, I have one
          </button>
          <button
            type="button"
            className={`choice-card${hasWearable === false ? " choice-selected" : ""}`}
            onClick={() => setHasWearable(false)}
            aria-pressed={hasWearable === false}
          >
            ✍️ No, track manually
          </button>
        </div>
      </section>

      {hasWearable === true && (
        <section className="ob-step">
          <h2>3 · Connect your wearable</h2>
          <p className="ob-hint">We’ll pull your daily burn to build a 7-day maintenance baseline.</p>
          <button
            className="primary fitbit-btn"
            disabled={busy}
            onClick={() => save({ hasWearable: true }, "/api/fitbit/connect")}
          >
            {busy ? "Saving…" : "Save & connect Google Health"}
          </button>
          <button
            className="ghost"
            disabled={busy}
            onClick={() => save({ hasWearable: true }, "/dashboard")}
          >
            Skip for now
          </button>
          {error && <p role="alert" className="ob-error">{error}</p>}
        </section>
      )}

      {hasWearable === false && (
        <section className="ob-step">
          <h2>3 · Your details</h2>
          <p className="ob-hint">We’ll estimate your maintenance calories (Mifflin-St Jeor).</p>

          <div className="manual-grid">
            <label>
              Age
              <input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
            </label>
            <label>
              Sex
              <select value={sex} onChange={(e) => setSex(e.target.value as BiologicalSex)}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label>
              Height (cm)
              <input type="number" inputMode="numeric" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </label>
            <label>
              Weight (kg)
              <input type="number" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </label>
          </div>
          <label>
            Activity level
            <select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
              {ACTIVITIES.map((a) => (
                <option key={a} value={a}>
                  {ACTIVITY_LABELS[a]}
                </option>
              ))}
            </select>
          </label>

          <button className="ghost" type="button" onClick={recalc} disabled={busy}>
            Calculate maintenance
          </button>

          {tdee !== null && (
            <div className="tdee-result">
              <label>
                Calculated maintenance calories (editable)
                <input
                  type="number"
                  inputMode="numeric"
                  value={tdee}
                  onChange={(e) => setTdee(Number(e.target.value))}
                />
              </label>
              {target !== null && (
                <p className="ob-hint">
                  Daily target for {goal.toLowerCase()}: <strong>{target.toLocaleString()} kcal</strong>
                </p>
              )}
            </div>
          )}

          {error && <p role="alert" className="ob-error">{error}</p>}

          <button
            className="primary"
            disabled={busy || tdee === null}
            onClick={() =>
              save(
                {
                  hasWearable: false,
                  age: Number(age),
                  sex,
                  heightCm: Number(heightCm),
                  weightKg: Number(weightKg),
                  activityLevel: activity,
                  manualTdee: tdee,
                },
                "/dashboard"
              )
            }
          >
            {busy ? "Saving…" : "Save & finish"}
          </button>
        </section>
      )}
    </main>
  );
}
