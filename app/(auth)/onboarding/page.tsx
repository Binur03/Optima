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
    <main className="flex flex-col gap-6 pb-4">
      <header>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-white">Set up Optima</h1>
        <p className="m-0 mt-1 text-sm text-neutral-400">Pick a goal and we’ll handle the math.</p>
      </header>

      <section className={CARD}>
        <StepHeading step={1} title="Your goal" />
        <div
          className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/5"
          role="group"
          aria-label="Goal"
        >
          {GOALS.map((g) => {
            const selected = goal === g.key;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => pickGoal(g.key)}
                aria-pressed={selected}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-3 text-center transition ${
                  selected ? "bg-white shadow-sm" : "hover:bg-white/5"
                }`}
              >
                <span className={`text-sm font-semibold ${selected ? "text-zinc-950" : "text-neutral-200"}`}>
                  {g.title}
                </span>
                <span className={`text-[11px] leading-tight ${selected ? "text-zinc-600" : "text-neutral-500"}`}>
                  {g.blurb}
                </span>
              </button>
            );
          })}
        </div>

        <label className="mt-5 block">
          <span className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-neutral-400">Daily target vs. maintenance</span>
            <span className="text-sm font-semibold tabular-nums text-white">
              {goalDelta >= 0 ? `+${goalDelta}` : goalDelta} kcal
            </span>
          </span>
          <input
            type="range"
            min={-1000}
            max={700}
            step={50}
            value={goalDelta}
            onChange={(e) => setGoalDelta(Number(e.target.value))}
            className="mt-3 w-full accent-emerald-500"
          />
        </label>
      </section>

      <section className={CARD}>
        <StepHeading step={2} title="Do you have a fitness wearable?" />
        <p className="m-0 mt-1 text-sm text-neutral-400">
          A Fitbit / Google-connected device auto-tracks your daily burn.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setHasWearable(true)}
            aria-pressed={hasWearable === true}
            className={`${CHOICE} ${hasWearable === true ? CHOICE_ON : CHOICE_OFF}`}
          >
            <span className="text-2xl" aria-hidden>⌚</span>
            <span className="text-sm font-semibold text-white">Yes, I have one</span>
            <span className="text-[11px] text-neutral-500">Auto-sync my burn</span>
          </button>
          <button
            type="button"
            onClick={() => setHasWearable(false)}
            aria-pressed={hasWearable === false}
            className={`${CHOICE} ${hasWearable === false ? CHOICE_ON : CHOICE_OFF}`}
          >
            <span className="text-2xl" aria-hidden>✍️</span>
            <span className="text-sm font-semibold text-white">No, track manually</span>
            <span className="text-[11px] text-neutral-500">Estimate from my stats</span>
          </button>
        </div>
      </section>

      {hasWearable === true && (
        <section className={CARD}>
          <StepHeading step={3} title="Connect your wearable" />
          <p className="m-0 mt-1 text-sm text-neutral-400">
            We’ll pull your daily burn to build a 7-day maintenance baseline.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              disabled={busy}
              onClick={() => save({ hasWearable: true }, "/api/fitbit/connect")}
              className={PRIMARY}
            >
              {busy ? "Saving…" : "Save & connect Google Health"}
            </button>
            <button
              disabled={busy}
              onClick={() => save({ hasWearable: true }, "/dashboard")}
              className="w-full rounded-xl bg-transparent py-2.5 text-sm font-medium text-neutral-400 transition hover:text-white disabled:opacity-50"
            >
              Skip for now
            </button>
          </div>
          {error && <p role="alert" className={ERROR_MSG}>{error}</p>}
        </section>
      )}

      {hasWearable === false && (
        <section className={CARD}>
          <StepHeading step={3} title="Your details" />
          <p className="m-0 mt-1 text-sm text-neutral-400">
            We’ll estimate your maintenance calories (Mifflin-St Jeor).
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL}>Age</span>
              <input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} className={FIELD} />
            </label>
            <label className="block">
              <span className={LABEL}>Sex</span>
              <select value={sex} onChange={(e) => setSex(e.target.value as BiologicalSex)} className={FIELD}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Height (cm)</span>
              <input type="number" inputMode="numeric" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className={FIELD} />
            </label>
            <label className="block">
              <span className={LABEL}>Weight (kg)</span>
              <input type="number" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className={FIELD} />
            </label>
          </div>
          <label className="mt-3 block">
            <span className={LABEL}>Activity level</span>
            <select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)} className={FIELD}>
              {ACTIVITIES.map((a) => (
                <option key={a} value={a}>
                  {ACTIVITY_LABELS[a]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={recalc}
            disabled={busy}
            className="mt-4 w-full rounded-xl bg-transparent py-2.5 text-sm font-medium text-white ring-1 ring-inset ring-white/10 transition hover:bg-white/5 disabled:opacity-50"
          >
            Calculate maintenance
          </button>

          {tdee !== null && (
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
              <label className="block">
                <span className="text-xs font-medium text-emerald-300/80">
                  Maintenance calories · tap to edit
                </span>
                <span className="mt-1 flex items-baseline gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={tdee}
                    onChange={(e) => setTdee(Number(e.target.value))}
                    className="w-full min-w-0 bg-transparent text-4xl font-semibold tabular-nums tracking-tight text-white focus:outline-none"
                  />
                  <span className="shrink-0 text-sm text-neutral-400">kcal/day</span>
                </span>
              </label>
              {target !== null && (
                <p className="m-0 mt-2 text-sm text-neutral-400">
                  Daily target for {goal.toLowerCase()}:{" "}
                  <span className="font-semibold tabular-nums text-white">{target.toLocaleString()} kcal</span>
                </p>
              )}
            </div>
          )}

          {error && <p role="alert" className={ERROR_MSG}>{error}</p>}

          <button
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
            className={`mt-5 ${PRIMARY}`}
          >
            {busy ? "Saving…" : "Save & finish"}
          </button>
        </section>
      )}
    </main>
  );
}

function StepHeading({ step, title }: { step: number; title: string }) {
  return (
    <div>
      <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">Step {step}</p>
      <h2 className="m-0 mt-1 text-base font-semibold text-white">{title}</h2>
    </div>
  );
}

const CARD = "rounded-2xl border border-white/5 bg-neutral-900/80 p-5 shadow-soft";
const LABEL = "text-xs font-medium text-neutral-400";
const FIELD =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm tabular-nums text-white focus:border-emerald-500/50 focus:outline-none";
const PRIMARY =
  "w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:bg-white/10 disabled:text-neutral-500";
const CHOICE = "flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition";
const CHOICE_ON = "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30";
const CHOICE_OFF = "border-white/5 bg-white/[0.02] hover:border-white/15";
const ERROR_MSG =
  "m-0 mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300";
