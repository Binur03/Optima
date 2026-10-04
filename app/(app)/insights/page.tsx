"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TrendAreaChart } from "@/components/charts/TrendAreaChart";
import { formatDay } from "@/components/charts/GlassTooltip";
import { UnitToggle } from "@/components/UnitToggle";
import { useUnits } from "@/lib/useUnits";
import { displayToLb, lbToDisplay, weightUnit } from "@/lib/units";

interface WeightData {
  today: string;
  points: { date: string; weight: number }[];
}
interface LiftData {
  exercises: { id: string; name: string; sessions: number }[];
  selectedId: string | null;
  points: { date: string; e1rm: number; volume: number; top: string }[];
}

const RANGES = { "1M": 30, "3M": 90, "1Y": 365 } as const;
type Range = keyof typeof RANGES;

export default function InsightsPage() {
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>("3M");
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [metric, setMetric] = useState<"e1rm" | "volume">("e1rm");
  const [weighIn, setWeighIn] = useState("");
  // Everything arrives in lb; shown and entered in the user's unit.
  const { units } = useUnits();
  const wu = weightUnit(units);

  const weight = useQuery({
    queryKey: ["weight-trend"],
    queryFn: async (): Promise<WeightData> => {
      const res = await fetch("/api/insights/weight");
      if (!res.ok) throw new Error("weight_failed");
      return res.json();
    },
  });

  const lifts = useQuery({
    queryKey: ["lift-insights", exerciseId],
    queryFn: async (): Promise<LiftData> => {
      const res = await fetch(`/api/insights/lifts${exerciseId ? `?exerciseId=${exerciseId}` : ""}`);
      if (!res.ok) throw new Error("lifts_failed");
      return res.json();
    },
  });

  const logWeight = useMutation({
    mutationFn: async (weightLb: number) => {
      const res = await fetch("/api/insights/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weightLb }),
      });
      if (!res.ok) throw new Error("log_failed");
    },
    onSuccess: () => {
      setWeighIn("");
      qc.invalidateQueries({ queryKey: ["weight-trend"] });
    },
  });

  // Weight series for the selected range.
  const cutoff = weight.data
    ? new Date(new Date(`${weight.data.today}T00:00:00Z`).getTime() - RANGES[range] * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : "";
  const series = (weight.data?.points ?? [])
    .filter((p) => p.date >= cutoff)
    .map((p) => ({ ...p, weight: lbToDisplay(p.weight, units) }));
  const latest = series[series.length - 1];
  const change = series.length > 1 ? latest.weight - series[0].weight : null;

  // Lift series.
  const liftPoints = (lifts.data?.points ?? []).map((p) => ({
    ...p,
    e1rm: Math.round(lbToDisplay(p.e1rm, units, "lift")),
    volume: Math.round(lbToDisplay(p.volume, units)),
    // "185 × 8" → the same set in the user's unit
    top: p.top.replace(/^([\d.]+)/, (w) => String(lbToDisplay(Number(w), units, "lift"))),
  }));
  const liftLatest = liftPoints[liftPoints.length - 1];
  const liftChange = liftPoints.length > 1 ? liftLatest[metric] - liftPoints[0][metric] : null;
  const selectedName = lifts.data?.exercises.find((e) => e.id === lifts.data?.selectedId)?.name;

  return (
    <main className="flex flex-col gap-5 pb-4">
      <header>
        <div className="flex items-center justify-between gap-3">
          <h1 className="m-0 text-3xl font-semibold tracking-tight text-white">Insights</h1>
          <UnitToggle />
        </div>
        <p className="m-0 mt-1 text-sm text-neutral-400">Trends beat single days.</p>
      </header>

      {/* Body weight */}
      <section className="rounded-3xl border border-white/5 bg-neutral-900 p-6 shadow-soft" aria-label="Body weight trend">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-medium text-sky-300">Body weight</p>
            <p className="m-0 mt-1 text-4xl font-bold tabular-nums tracking-tight text-white">
              {latest ? latest.weight.toFixed(1) : "—"}
              <span className="ml-1.5 text-base font-medium text-neutral-500">{wu}</span>
            </p>
            {change !== null && (
              <p className="m-0 mt-1 text-xs text-neutral-400">
                <span className="font-semibold tabular-nums text-white">
                  {change > 0 ? "+" : ""}
                  {change.toFixed(1)} {wu}
                </span>{" "}
                since {formatDay(series[0].date)}
              </p>
            )}
          </div>
          <div className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-inset ring-white/5" role="group" aria-label="Range">
            {(Object.keys(RANGES) as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  range === r ? "bg-white text-zinc-950" : "text-neutral-400 hover:text-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          {series.length > 1 ? (
            <TrendAreaChart data={series} dataKey="weight" color="#38bdf8" unit={wu} />
          ) : (
            <p className="m-0 grid h-[200px] place-items-center text-center text-sm text-neutral-500">
              {series.length === 1 ? "One more weigh-in and your trend line appears." : "Log a weigh-in to start your trend."}
            </p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(weighIn);
            if (v > 0) logWeight.mutate(displayToLb(v, units));
          }}
          className="mt-5 flex items-center gap-2 rounded-2xl bg-white/[0.03] p-1.5 pl-4 ring-1 ring-inset ring-white/5"
        >
          <input
            inputMode="decimal"
            value={weighIn}
            onChange={(e) => setWeighIn(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={`Today’s weight (${wu})`}
            aria-label={units === "metric" ? "Today's weight in kilograms" : "Today's weight in pounds"}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm tabular-nums text-white placeholder:text-neutral-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={logWeight.isPending || !(Number(weighIn) > 0)}
            className="shrink-0 rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-sky-300 disabled:bg-white/10 disabled:text-neutral-500"
          >
            {logWeight.isPending ? "Saving…" : "Log"}
          </button>
        </form>
        {logWeight.isError && (
          <p role="alert" className="m-0 mt-2 text-xs text-rose-400">
            {units === "metric" ? "Enter a weight between 23 and 363 kg." : "Enter a weight between 50 and 800 lb."}
          </p>
        )}
      </section>

      {/* Strength */}
      <section className="rounded-3xl border border-white/5 bg-neutral-900 p-6 shadow-soft" aria-label="Strength progression">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 truncate text-xs font-medium text-lime-300">{selectedName ?? "Strength"}</p>
            <p className="m-0 mt-1 text-4xl font-bold tabular-nums tracking-tight text-white">
              {liftLatest ? liftLatest[metric].toLocaleString() : "—"}
              <span className="ml-1.5 text-base font-medium text-neutral-500">
                {metric === "e1rm" ? `${wu} est. 1RM` : `${wu} volume`}
              </span>
            </p>
            {liftChange !== null && (
              <p className="m-0 mt-1 text-xs text-neutral-400">
                <span className="font-semibold tabular-nums text-white">
                  {liftChange > 0 ? "+" : ""}
                  {liftChange.toLocaleString()} {wu}
                </span>{" "}
                over 3 months
              </p>
            )}
          </div>
          <div className="flex shrink-0 rounded-full bg-white/[0.04] p-1 ring-1 ring-inset ring-white/5" role="group" aria-label="Metric">
            {(
              [
                ["e1rm", "1RM"],
                ["volume", "Vol"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMetric(key)}
                aria-pressed={metric === key}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  metric === key ? "bg-white text-zinc-950" : "text-neutral-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {(lifts.data?.exercises.length ?? 0) > 0 && (
          <div className="-mx-6 mt-4 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {lifts.data!.exercises.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setExerciseId(e.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  e.id === lifts.data!.selectedId
                    ? "bg-lime-400 text-zinc-950"
                    : "bg-white/[0.04] text-neutral-400 ring-1 ring-inset ring-white/5 hover:text-white"
                }`}
              >
                {e.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5">
          {liftPoints.length > 1 ? (
            <TrendAreaChart
              data={liftPoints}
              dataKey={metric}
              color={metric === "e1rm" ? "#a3e635" : "#fb7185"}
              unit={wu}
              detailKey="top"
            />
          ) : (
            <div className="grid h-[200px] place-items-center text-center">
              <p className="m-0 text-sm text-neutral-500">
                {liftPoints.length === 1
                  ? "Log this lift once more to see a trend."
                  : "Log a few sessions to see your strength curve."}
                <br />
                <Link href="/train" className="mt-2 inline-block font-semibold text-lime-300 hover:underline">
                  Go to Train →
                </Link>
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
