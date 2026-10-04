"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MetricCard } from "@/components/MetricCard";
import { DeltaBar } from "@/components/DeltaBar";
import { TdeeBadge } from "@/components/TdeeBadge";
import { ActivityRing, RING_COLORS } from "@/components/ActivityRing";
import { DailyQuests } from "@/components/DailyQuests";
import { WeeklyCaloriesChart } from "@/components/charts/WeeklyCaloriesChart";
import { TargetsSheet, type TargetsChange } from "@/components/TargetsSheet";
import { PROGRESS_KEY, useProgress } from "@/lib/useProgress";
import { MealGroups } from "@/components/MealGroups";
import { refreshFood, useCopyMeal, useMeals } from "@/lib/useMeals";
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
  customTarget: boolean;
  customMacros: boolean;
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
        // A custom calorie target doesn't move with the goal.
        const targetIntake = prev.customTarget
          ? prev.delta.targetIntake
          : prev.tdee.value === null
            ? null
            : prev.tdee.value + goalDelta;
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
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "log_failed");
      }
      return res.json() as Promise<{ log: { foodName: string; calories: number } }>;
    },
    onSuccess: () => {
      setMeal("");
      refreshFood(qc);
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
    onSuccess: () => refreshFood(qc),
  });
  const { data: progress } = useProgress();

  // Daily targets sheet: goal offsets, custom calories, custom macros.
  const [editing, setEditing] = useState(false);
  const saveTargets = useMutation({
    mutationFn: async (change: TargetsChange) => {
      const post = (url: string, body: unknown) =>
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (change.offsets) {
        const res = await post("/api/profile/goal", change.offsets);
        if (!res.ok) throw new Error("prefs_failed");
      }
      const res = await post("/api/profile/targets", { calories: change.calories, macros: change.macros });
      if (!res.ok) throw new Error("targets_failed");
    },
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["calories-week"] });
      qc.invalidateQueries({ queryKey: PROGRESS_KEY }, { cancelRefetch: false });
    },
  });

  useEffect(() => {
    sync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data)
    return (
      <p
        role="alert"
        className="mt-24 rounded-2xl border border-white/5 bg-neutral-900/80 p-6 text-center text-sm text-neutral-400"
      >
        Couldn’t load your dashboard. Pull to retry.
      </p>
    );

  const reauthNeeded = sync.data?.status === 409;
  const rateLimited = sync.data?.status === 429;

  return (
    <main className="flex flex-col gap-6 pb-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-white">Today</h1>
            <ContextPrompt data={data} />
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            {data.streak > 0 && (
              <span
                className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-sm font-semibold tabular-nums text-orange-300"
                title={`${data.streak}-day logging streak`}
              >
                🔥 {data.streak}
              </span>
            )}
            <Link href="/diary" aria-label="Today's meals" className={HEADER_ICON}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z" />
                <path d="M6 18a2 2 0 0 1 2-2h10M10 8h4" />
              </svg>
            </Link>
            <Link href="/onboarding" aria-label="Setup" className={HEADER_ICON}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
            </Link>
          </div>
        </div>
        <div>
          <TdeeBadge
            value={data.tdee.value}
            daysUsed={data.tdee.daysUsed}
            estimating={data.tdee.estimating}
            manual={!data.hasWearable}
          />
        </div>
        <div className="flex items-center gap-2">
          <div
            className="grid flex-1 grid-cols-3 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/5"
            role="group"
            aria-label="Goal"
          >
            {GOALS.map((g) => (
              <button
                key={g.key}
                type="button"
                className={`rounded-lg py-1.5 text-sm font-medium transition disabled:opacity-60 ${
                  data.goal === g.key
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-neutral-400 hover:text-white"
                }`}
                aria-pressed={data.goal === g.key}
                disabled={setGoal.isPending}
                onClick={() => setGoal.mutate(g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-neutral-400 ring-1 ring-inset ring-white/5 transition hover:text-white"
            aria-label="Edit daily targets"
            onClick={() => {
              saveTargets.reset();
              setEditing(true);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
              <circle cx="15" cy="7" r="2" />
              <circle cx="9" cy="12" r="2" />
              <circle cx="17" cy="17" r="2" />
            </svg>
          </button>
        </div>
      </header>

      <TargetsSheet
        open={editing}
        snapshot={{
          tdee: data.tdee.value,
          goal: data.goal,
          cutDelta: data.cutDelta,
          bulkDelta: data.bulkDelta,
          targetIntake: data.delta.targetIntake,
          customTarget: data.customTarget,
          macroTargets: data.macroTargets,
          customMacros: data.customMacros,
        }}
        busy={saveTargets.isPending}
        error={saveTargets.isError ? "Couldn’t save your targets. Check the numbers and try again." : null}
        onClose={() => setEditing(false)}
        onSave={(change) => saveTargets.mutate(change)}
      />

      {reauthNeeded && (
        <a
          className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
          href="/api/fitbit/connect"
        >
          Wearable disconnected — tap to reconnect.
        </a>
      )}
      {rateLimited && (
        <div
          className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-300"
          role="status"
        >
          Wearable sync is rate-limited — showing your last synced numbers.
        </div>
      )}

      <DeltaBar delta={data.delta} goal={data.goal}>
        <div
          className={`grid divide-x divide-white/5 ${data.hasWearable ? "grid-cols-3" : "grid-cols-2"}`}
        >
          <MetricCard label="Eaten" value={data.eatenToday} tone="eat" />
          <MetricCard
            label={data.goalDelta === 0 && !data.customTarget ? "Target · maintain" : "Target"}
            value={data.delta.targetIntake}
            sub={
              data.customTarget
                ? "your custom goal"
                : data.delta.targetIntake === null
                  ? "needs baseline"
                  : `${data.goalDelta >= 0 ? "+" : ""}${data.goalDelta} vs maint.`
            }
          />
          {data.hasWearable && (
            <MetricCard
              label="Burned"
              value={data.burnedToday}
              tone="burn"
              sub={data.steps !== null ? `${data.steps.toLocaleString()} steps` : "no sync yet"}
            />
          )}
        </div>
      </DeltaBar>

      <ActivitySummary
        macros={data.macros}
        macroTargets={data.macroTargets}
        sets={progress?.today.sets ?? 0}
        setGoal={progress?.today.setGoal ?? 12}
      />

      {progress && <DailyQuests quests={progress.quests} bonus={progress.questBonus} />}

      <section className="flex flex-col gap-3" aria-label="Quick add">
        <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-neutral-900/80 p-1.5 pl-4 shadow-soft transition focus-within:border-emerald-500/40">
          <input
            type="text"
            value={meal}
            onChange={(e) => setMeal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && meal.trim().length >= 2) logMeal.mutate(meal.trim());
            }}
            placeholder="Quick add a meal…"
            maxLength={200}
            disabled={logMeal.isPending}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={() => logMeal.mutate(meal.trim())}
            disabled={logMeal.isPending || meal.trim().length < 2}
            className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:bg-white/10 disabled:text-neutral-500"
          >
            {logMeal.isPending ? "Logging…" : "Log"}
          </button>
        </div>
        {logMeal.isError && (
          <p role="alert" className="m-0 text-xs text-rose-400">
            {logMeal.error?.message === "ai_busy"
              ? "The AI is busy right now — give it a few seconds and try again. Nothing was saved."
              : "Couldn’t estimate that — try again or use the Log tab."}
          </p>
        )}
        {logMeal.data?.log && !logMeal.isPending && (
          <p className="m-0 text-xs text-emerald-400" role="status">
            ✓ Added {logMeal.data.log.foodName} · {logMeal.data.log.calories.toLocaleString()} kcal
          </p>
        )}

        {recents && recents.length > 0 && (
          <div>
            <p className="m-0 mb-2 text-xs font-medium text-neutral-500">Recent · tap to log again</p>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {recents.map((m, i) => (
                <button
                  key={`${m.foodName}-${i}`}
                  type="button"
                  disabled={quickLog.isPending}
                  onClick={() => quickLog.mutate(m)}
                  className="flex max-w-[180px] shrink-0 flex-col items-start rounded-2xl border border-white/5 bg-neutral-900/80 px-3.5 py-2 text-left transition hover:border-white/15 active:scale-[0.98] disabled:opacity-50"
                >
                  <span className="w-full truncate text-sm font-medium text-white">{m.foodName}</span>
                  <span className="text-[11px] tabular-nums text-neutral-500">
                    {m.calories.toLocaleString()} kcal
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <TodayMeals />

      <WeeklyCaloriesChart todayCalories={data.eatenToday} target={data.delta.targetIntake} />

      <section className="rounded-2xl border border-white/5 bg-gradient-to-br from-emerald-500/[0.08] via-neutral-900/80 to-neutral-900/80 p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-base">
            ✨
          </span>
          <h2 className="m-0 text-sm font-semibold text-white">Weekly AI Review</h2>
        </div>
        {weekly?.insight ? (
          <p className="m-0 mt-2 text-sm leading-relaxed text-neutral-300">{weekly.insight}</p>
        ) : (
          <p className="m-0 mt-2 text-sm text-neutral-500">
            {weeklyLoading ? "Generating your weekly review…" : weekly?.message ?? "Log a few days to unlock your weekly review."}
          </p>
        )}
      </section>

      <footer className="flex items-center justify-between text-xs text-neutral-500">
        {data.lastSyncedAt ? (
          <span>Synced {new Date(data.lastSyncedAt).toLocaleTimeString()}</span>
        ) : (
          <span />
        )}
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="rounded-lg px-3 py-1.5 text-neutral-400 ring-1 ring-inset ring-white/5 transition hover:text-white disabled:opacity-50"
        >
          {sync.isPending ? "Syncing…" : "Refresh"}
        </button>
      </footer>

    </main>
  );
}

// Time-of-day prompt under the title, e.g. "Dinner · 620 kcal remaining" from 5 PM.
function ContextPrompt({ data }: { data: DashboardData }) {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { remaining, targetIntake } = data.delta;
  let text: string;
  if (targetIntake === null || remaining === null) {
    text = "Log a meal to start your day";
  } else if (remaining < 0) {
    text = `${Math.abs(remaining).toLocaleString()} kcal over today${hour >= 17 && hour < 22 ? " — keep dinner light" : ""}`;
  } else {
    const left = `${remaining.toLocaleString()} kcal remaining`;
    if (hour < 5) text = `Late night · ${left}`;
    else if (hour < 11) text = data.eatenToday === 0 ? `Breakfast · ${targetIntake.toLocaleString()} kcal to work with today` : `Breakfast · ${left}`;
    else if (hour < 17) text = `Lunch · ${left}`;
    else if (hour < 22) text = `Dinner · ${left}`;
    else text = `Winding down · ${left}`;
  }
  const proteinLeft = data.macroTargets ? Math.round(data.macroTargets.protein - data.macros.protein) : 0;

  return (
    <p className="m-0 mt-1 text-sm font-medium text-neutral-400" aria-live="polite">
      {text}
      {hour >= 11 && proteinLeft >= 20 && <span className="block text-emerald-400/90">{proteinLeft} g protein to go</span>}
    </p>
  );
}

// Protein / Carbs / Fat as stacked rings in their semantic colours, plus a
// compact workout ring. Calories live in the hero ring above.
function ActivitySummary({
  macros,
  macroTargets,
  sets,
  setGoal,
}: {
  macros: DashboardData["macros"];
  macroTargets: DashboardData["macroTargets"];
  sets: number;
  setGoal: number;
}) {
  const rows = [
    { label: "Protein", value: Math.round(macros.protein), goal: macroTargets?.protein ?? 0, tint: "text-emerald-400", ...RING_COLORS.protein },
    { label: "Carbs", value: Math.round(macros.carbs), goal: macroTargets?.carbs ?? 0, tint: "text-amber-400", ...RING_COLORS.carbs },
    { label: "Fat", value: Math.round(macros.fat), goal: macroTargets?.fat ?? 0, tint: "text-rose-400", ...RING_COLORS.fat },
  ];
  const workoutDone = sets >= setGoal;

  return (
    <section className="rounded-3xl border border-white/5 bg-neutral-900/80 p-5 shadow-soft" aria-label="Macros and workout">
      <div className="flex items-center gap-5">
        <ActivityRing rings={rows} size={136} stroke={14} gap={3} />
        <dl className="m-0 flex min-w-0 flex-1 flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.label} className="min-w-0">
              <dt className={`text-xs font-semibold ${r.tint}`}>
                {r.label}
                {r.goal > 0 && r.value >= r.goal && <span aria-label="goal reached"> ✓</span>}
              </dt>
              <dd className="m-0 truncate text-base font-semibold tabular-nums text-white">
                {r.value.toLocaleString()}
                <span className="text-sm font-medium text-neutral-500">{r.goal > 0 ? `/${r.goal.toLocaleString()}` : ""} g</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <Link
        href="/train"
        className="mt-4 flex items-center gap-3 border-t border-white/5 pt-4 transition hover:opacity-90"
      >
        <ActivityRing rings={[{ label: "Workout", value: sets, goal: setGoal, ...RING_COLORS.workout }]} size={40} stroke={6} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-sky-400">Workout{workoutDone && <span aria-label="goal reached"> ✓</span>}</span>
          <span className="block text-sm font-semibold tabular-nums text-white">
            {sets}
            <span className="font-medium text-neutral-500">/{setGoal} sets</span>
          </span>
        </span>
        <span className="text-xs font-semibold text-neutral-500">Train ›</span>
      </Link>
    </section>
  );
}

// Today's meals as collapsible Breakfast / Lunch / Dinner cards.
function TodayMeals() {
  const { data: meals } = useMeals(null);
  const copy = useCopyMeal();
  if (!meals || meals.length === 0) return null;
  return (
    <section aria-label="Today's meals" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="m-0 text-sm font-semibold text-white">Today’s meals</h2>
        <Link href="/diary" className="text-xs font-semibold text-emerald-400">
          Diary ›
        </Link>
      </div>
      <MealGroups meals={meals} copyLabel="Log again" onCopy={(m) => copy.mutate(m)} copying={copy.isPending} />
      {copy.isError && <p role="alert" className="m-0 text-xs text-rose-400">Couldn’t log that again — try once more.</p>}
    </section>
  );
}

const HEADER_ICON =
  "grid h-9 w-9 place-items-center rounded-full bg-white/[0.04] text-neutral-400 ring-1 ring-inset ring-white/5 transition hover:text-white";

function DashboardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true">
      <div className="h-9 w-28 rounded-lg bg-white/5" />
      <div className="h-10 rounded-xl bg-white/5" />
      <div className="h-[330px] rounded-3xl bg-white/5" />
      <div className="h-28 rounded-2xl bg-white/5" />
    </div>
  );
}
