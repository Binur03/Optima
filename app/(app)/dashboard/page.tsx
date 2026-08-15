"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MetricCard } from "@/components/MetricCard";
import { DeltaBar } from "@/components/DeltaBar";
import { TdeeBadge } from "@/components/TdeeBadge";
import { MacroBar } from "@/components/MacroBar";
import type { DeltaResult, Goal } from "@/lib/delta";

const GOALS: { key: Goal; label: string }[] = [
  { key: "CUT", label: "Cut" },
  { key: "MAINTAIN", label: "Maintain" },
  { key: "BULK", label: "Bulk" },
];

interface DashboardData {
  burnedToday: number | null;
  steps: number | null;
  activeZoneMinutes: number | null;
  lastSyncedAt: string | null;
  eatenToday: number;
  macros: { protein: number; carbs: number; fat: number };
  tdee: { value: number | null; daysUsed: number; estimating: boolean };
  goal: Goal;
  goalDelta: number;
  cutDelta: number;
  bulkDelta: number;
  hasWearable: boolean;
  streak: number;
  macroTargets: { protein: number; carbs: number; fat: number } | null;
  delta: DeltaResult;
}

interface WeeklyInsight {
  insight: string | null;
  message?: string;
}

async function getInsight(): Promise<WeeklyInsight> {
  const res = await fetch("/api/insights/weekly");
  if (!res.ok) return { insight: null };
  return res.json();
}

function deltaForGoal(goal: Goal, cutDelta: number, bulkDelta: number): number {
  return goal === "CUT" ? cutDelta : goal === "BULK" ? bulkDelta : 0;
}

async function getDashboard(): Promise<DashboardData> {
  // Send the user's tz offset so server-side pace flags use local time.
  const tzOffset = new Date().getTimezoneOffset();
  const res = await fetch(`/api/dashboard?tzOffset=${tzOffset}`);
  if (res.status === 409) {
    // Authenticated but no profile yet — route through onboarding.
    if (typeof window !== "undefined") window.location.href = "/onboarding";
    throw new Error("no_profile");
  }
  if (!res.ok) throw new Error("dashboard_failed");
  return res.json();
}

interface RecentMeal {
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

async function getRecents(): Promise<RecentMeal[]> {
  const res = await fetch("/api/food/recents");
  if (!res.ok) throw new Error("recents_failed");
  return (await res.json()).recents as RecentMeal[];
}

export default function DashboardPage() {
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // Sync-on-open: fire a Fitbit sync once, then refresh the dashboard.
  const sync = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/fitbit/sync", { method: "POST" });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  // Goal toggle: persist to Supabase, optimistically retarget for instant
  // feedback, then invalidate so the server recomputes the full delta.
  const setGoal = useMutation({
    mutationFn: async (goal: Goal) => {
      const res = await fetch("/api/profile/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      if (!res.ok) throw new Error("goal_update_failed");
      return res.json();
    },
    onMutate: async (goal: Goal) => {
      await qc.cancelQueries({ queryKey: ["dashboard"] });
      const prev = qc.getQueryData<DashboardData>(["dashboard"]);
      if (prev) {
        const goalDelta = deltaForGoal(goal, prev.cutDelta, prev.bulkDelta);
        const targetIntake = prev.tdee.value === null ? null : prev.tdee.value + goalDelta;
        qc.setQueryData<DashboardData>(["dashboard"], {
          ...prev,
          goal,
          goalDelta,
          delta: {
            ...prev.delta,
            targetIntake,
            remaining: targetIntake === null ? null : targetIntake - prev.eatenToday,
          },
        });
      }
      return { prev };
    },
    onError: (_e, _goal, ctx) => {
      if (ctx?.prev) qc.setQueryData(["dashboard"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  // Quick-add: type a meal, Gemini estimates + saves it, dashboard ticks up.
  const [meal, setMeal] = useState("");
  const logMeal = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch("/api/food/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("log_failed");
      return res.json() as Promise<{ log: { foodName: string; calories: number } }>;
    },
    onSuccess: () => {
      setMeal("");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // Recent meals: one-tap re-log using saved macros — no Gemini call.
  const { data: recents } = useQuery({
    queryKey: ["recents"],
    queryFn: getRecents,
    staleTime: 60_000,
  });
  const { data: weekly, isLoading: weeklyLoading } = useQuery({
    queryKey: ["weekly-insight"],
    queryFn: getInsight,
    staleTime: 1000 * 60 * 60, // server caches ~1 week; this just avoids refetch spam
  });
  const quickLog = useMutation({
    mutationFn: async (m: RecentMeal) => {
      const res = await fetch("/api/food/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodName: m.foodName,
          calories: m.calories,
          proteinG: m.proteinG,
          carbsG: m.carbsG,
          fatG: m.fatG,
          source: "MANUAL",
          aiEstimated: false,
        }),
      });
      if (!res.ok) throw new Error("quicklog_failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["recents"] });
    },
  });

  // Custom goal-offset editor (modal).
  const [editing, setEditing] = useState(false);
  const [cutInput, setCutInput] = useState(0);
  const [bulkInput, setBulkInput] = useState(0);
  const savePrefs = useMutation({
    mutationFn: async (vals: { cutDelta: number; bulkDelta: number }) => {
      const res = await fetch("/api/profile/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vals),
      });
      if (!res.ok) throw new Error("prefs_failed");
      return res.json();
    },
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  useEffect(() => {
    sync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) return <p role="alert">Couldn’t load your dashboard. Pull to retry.</p>;

  const reauthNeeded = sync.data?.status === 409;
  const rateLimited = sync.data?.status === 429;

  return (
    <main className="dashboard">
      <header className="dash-header">
        <div className="dash-title-row">
          <h1>Today</h1>
          {data.streak > 0 && (
            <span className="streak" title={`${data.streak}-day logging streak`}>
              🔥 {data.streak}
            </span>
          )}
        </div>
        <TdeeBadge
          value={data.tdee.value}
          daysUsed={data.tdee.daysUsed}
          estimating={data.tdee.estimating}
          manual={!data.hasWearable}
        />
        <div className="goal-toggle" role="group" aria-label="Goal">
          {GOALS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`goal-pill${data.goal === g.key ? " goal-pill-active" : ""}`}
              aria-pressed={data.goal === g.key}
              disabled={setGoal.isPending}
              onClick={() => setGoal.mutate(g.key)}
            >
              {g.label}
            </button>
          ))}
          <button
            type="button"
            className="goal-edit"
            aria-label="Edit goal offsets"
            onClick={() => {
              setCutInput(data.cutDelta);
              setBulkInput(data.bulkDelta);
              setEditing(true);
            }}
          >
            ⚙️
          </button>
        </div>
      </header>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Custom goal offsets"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Custom goal offsets</h2>
            <p className="modal-hint">Calories added to your maintenance TDEE for each goal.</p>
            <label>
              Cut offset (kcal)
              <input
                type="number"
                value={cutInput}
                step={50}
                onChange={(e) => setCutInput(Number(e.target.value))}
              />
            </label>
            <label>
              Bulk offset (kcal)
              <input
                type="number"
                value={bulkInput}
                step={50}
                onChange={(e) => setBulkInput(Number(e.target.value))}
              />
            </label>
            <p className="modal-note">Maintain is always 0. Defaults: Cut −500, Bulk +300.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setEditing(false)} disabled={savePrefs.isPending}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-sm"
                disabled={savePrefs.isPending}
                onClick={() => savePrefs.mutate({ cutDelta: cutInput, bulkDelta: bulkInput })}
              >
                {savePrefs.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reauthNeeded && (
        <a className="banner banner-warn" href="/api/fitbit/connect">
          Fitbit disconnected — tap to reconnect.
        </a>
      )}
      {rateLimited && (
        <div className="banner banner-info" role="status">
          Fitbit is rate-limited; showing last synced numbers.
        </div>
      )}

      <DeltaBar delta={data.delta} goal={data.goal} />

      {data.macroTargets && (
        <section className="macro-trackers" aria-label="Macro progress">
          <MacroBar label="Protein" consumed={data.macros.protein} target={data.macroTargets.protein} tone="protein" />
          <MacroBar label="Carbs" consumed={data.macros.carbs} target={data.macroTargets.carbs} tone="carbs" />
          <MacroBar label="Fat" consumed={data.macros.fat} target={data.macroTargets.fat} tone="fat" />
        </section>
      )}

      <section className="metric-grid">
        {data.hasWearable && (
          <MetricCard
            label="Burned Today"
            value={data.burnedToday}
            tone="burn"
            sub={data.steps !== null ? `${data.steps.toLocaleString()} steps` : "no sync yet"}
          />
        )}
        <MetricCard
          label="Eaten Today"
          value={data.eatenToday}
          tone="eat"
          sub={`P ${Math.round(data.macros.protein)} · C ${Math.round(
            data.macros.carbs
          )} · F ${Math.round(data.macros.fat)}`}
        />
        <MetricCard
          label={data.goalDelta === 0 ? "Target (maintain)" : "Target Intake"}
          value={data.delta.targetIntake}
          sub={
            data.delta.targetIntake === null
              ? "needs Fitbit baseline"
              : `${data.goalDelta >= 0 ? "+" : ""}${data.goalDelta} vs maintenance`
          }
        />
      </section>

      <section className="insight-card">
        <h2>🧠 Weekly AI Review</h2>
        {weekly?.insight ? (
          <p className="insight-text">{weekly.insight}</p>
        ) : (
          <p className="insight-muted">
            {weeklyLoading ? "Generating your weekly review…" : weekly?.message ?? "Log a few days to unlock your weekly review."}
          </p>
        )}
      </section>

      <section className="quick-add">
        <div className="quick-add-row">
          <input
            type="text"
            value={meal}
            onChange={(e) => setMeal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && meal.trim().length >= 2) logMeal.mutate(meal.trim());
            }}
            placeholder="Enter meal, e.g., Big Mac meal or Chipotle chicken bowl…"
            maxLength={200}
            disabled={logMeal.isPending}
          />
          <button
            onClick={() => logMeal.mutate(meal.trim())}
            disabled={logMeal.isPending || meal.trim().length < 2}
          >
            {logMeal.isPending ? "Logging…" : "Log Meal"}
          </button>
        </div>
        {logMeal.isError && (
          <p role="alert" className="quick-add-error">
            Couldn’t estimate that — try again or use the Log tab.
          </p>
        )}
        {logMeal.data?.log && !logMeal.isPending && (
          <p className="quick-add-ok" role="status">
            ✓ Added {logMeal.data.log.foodName} · {logMeal.data.log.calories.toLocaleString()} kcal
          </p>
        )}
      </section>

      {recents && recents.length > 0 && (
        <div className="recents">
          <span className="recents-label">Recent · one tap to log</span>
          <div className="recents-row">
            {recents.map((m, i) => (
              <button
                key={`${m.foodName}-${i}`}
                type="button"
                className="recent-chip"
                disabled={quickLog.isPending}
                onClick={() => quickLog.mutate(m)}
              >
                <span className="recent-name">{m.foodName}</span>
                <span className="recent-cals">{m.calories.toLocaleString()} kcal</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="dash-footer">
        {data.lastSyncedAt && (
          <span className="sync-chip">
            Synced {new Date(data.lastSyncedAt).toLocaleTimeString()}
          </span>
        )}
        <button onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? "Syncing…" : "Refresh"}
        </button>
      </footer>
    </main>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard skeleton" aria-busy="true">
      <div className="skeleton-bar" />
      <div className="skeleton-grid">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    </div>
  );
}
