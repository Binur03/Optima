"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassTooltip, useMounted } from "./GlassTooltip";

interface Day {
  date: string;
  label: string;
  calories: number;
  isToday: boolean;
}

interface WeekData {
  days: Day[];
  target: number | null;
  average: number | null;
}

async function getWeek(): Promise<WeekData> {
  const res = await fetch("/api/insights/calories");
  if (!res.ok) throw new Error("calories_failed");
  return res.json();
}

interface Props {
  // Live values from the dashboard so today's bar moves the instant a meal is
  // logged or the goal changes, without waiting for this query to refetch.
  todayCalories?: number;
  target?: number | null;
}

export function WeeklyCaloriesChart({ todayCalories, target: liveTarget }: Props) {
  const mounted = useMounted();
  const { data } = useQuery({ queryKey: ["calories-week"], queryFn: getWeek, staleTime: 60_000 });

  const target = liveTarget !== undefined ? liveTarget : data?.target ?? null;
  const days = (data?.days ?? []).map((d) =>
    d.isToday && todayCalories !== undefined ? { ...d, calories: todayCalories } : d
  );
  const logged = days.filter((d) => d.calories > 0);
  const average = logged.length
    ? Math.round(logged.reduce((s, d) => s + d.calories, 0) / logged.length)
    : null;

  return (
    <section className="rounded-3xl border border-white/5 bg-neutral-900 p-6 shadow-soft" aria-label="Calories this week">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="m-0 text-xs font-medium text-neutral-400">This week</p>
          <p className="m-0 mt-1 text-3xl font-bold tabular-nums tracking-tight text-white">
            {average === null ? "—" : average.toLocaleString()}
            <span className="ml-1.5 text-sm font-medium text-neutral-500">kcal / day avg</span>
          </p>
        </div>
        {target !== null && (
          <p className="m-0 flex items-center gap-1.5 text-[11px] text-neutral-500">
            <span className="inline-block w-4 border-t border-dashed border-neutral-400" aria-hidden />
            Target {target.toLocaleString()}
          </p>
        )}
      </div>

      <div className="mt-5 h-40">
        {mounted && days.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 6, right: 0, bottom: 0, left: 0 }} barCategoryGap="30%">
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#737373", fontSize: 11 }}
                dy={6}
              />
              <YAxis hide domain={[0, (max: number) => Math.max(max, target ?? 0) * 1.1]} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)", radius: 12 } as object}
                content={<GlassTooltip unit="kcal" />}
              />
              {target !== null && (
                <ReferenceLine y={target} stroke="#a3a3a3" strokeOpacity={0.6} strokeDasharray="3 5" />
              )}
              <Bar dataKey="calories" radius={[10, 10, 10, 10]} maxBarSize={30} isAnimationActive>
                {days.map((d) => (
                  <Cell
                    key={d.date}
                    fill={
                      d.isToday
                        ? target !== null && d.calories > target
                          ? "#fb7185" // coral: over target
                          : "#34d399" // emerald: today
                        : "#3f3f46" // muted past days
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
