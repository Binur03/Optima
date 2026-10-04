"use client";

import type { ReactNode } from "react";
import type { DeltaResult, Goal, TrackState } from "@/lib/delta";

interface Props {
  delta: DeltaResult;
  goal: Goal;
  children?: ReactNode; // stat row rendered under the ring
}

const TRACK: Record<TrackState, { label: string; ring: string; chip: string }> = {
  on_track: { label: "On track", ring: "stroke-emerald-500", chip: "bg-emerald-500/10 text-emerald-400" },
  under: { label: "Under pace", ring: "stroke-sky-400", chip: "bg-sky-400/10 text-sky-300" },
  over: { label: "Over pace", ring: "stroke-rose-500", chip: "bg-rose-500/10 text-rose-400" },
  unknown: { label: "Not enough data", ring: "stroke-neutral-500", chip: "bg-white/5 text-neutral-400" },
};

const SIZE = 208;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const MID = SIZE / 2;

// Hero calorie ring: eaten vs. target, with the "where you should be by now"
// pace marker as a dot on the ring.
export function DeltaBar({ delta, goal, children }: Props) {
  const { targetIntake, eaten, remaining, pacedTarget, projectedEod, track } = delta;

  if (targetIntake === null) {
    return (
      <section className="rounded-3xl border border-white/5 bg-neutral-900/80 p-6 shadow-soft">
        <p className="m-0 text-center text-sm text-neutral-400">
          No target yet — finish Setup, or set your own calories with the sliders button above.
        </p>
        {children && <div className="mt-6 border-t border-white/5 pt-5">{children}</div>}
      </section>
    );
  }

  const pct = Math.min(100, Math.round((eaten / targetIntake) * 100));
  const pacePct =
    pacedTarget === null ? 0 : Math.min(100, Math.round((pacedTarget / targetIntake) * 100));
  const isOver = remaining !== null && remaining < 0;
  const meta = TRACK[track];
  const ringClass = isOver ? TRACK.over.ring : meta.ring;
  const chipClass = isOver ? TRACK.over.chip : meta.chip;

  // Pace dot, measured clockwise from 12 o'clock.
  const angle = (pacePct / 100) * 2 * Math.PI - Math.PI / 2;
  const dotX = MID + R * Math.cos(angle);
  const dotY = MID + R * Math.sin(angle);

  return (
    <section
      className="rounded-3xl border border-white/5 bg-neutral-900/80 px-6 pb-6 pt-7 shadow-soft"
      aria-label="Calories today"
    >
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Calories eaten versus target"
        >
          <circle cx={MID} cy={MID} r={R} fill="none" strokeWidth={STROKE} className="stroke-white/[0.06]" />
          {pct > 0 && (
            <circle
              cx={MID}
              cy={MID}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${(C * pct) / 100} ${C}`}
              transform={`rotate(-90 ${MID} ${MID})`}
              className={`${ringClass} transition-[stroke-dasharray] duration-700 ease-out`}
            />
          )}
          {pacedTarget !== null && pacePct > 0 && pacePct < 100 && (
            <circle cx={dotX} cy={dotY} r={4} className="fill-white" aria-label="Pace target" />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-5xl font-semibold tabular-nums tracking-tight ${
              isOver ? "text-rose-400" : "text-white"
            }`}
          >
            {Math.abs(remaining ?? 0).toLocaleString()}
          </span>
          <span className="mt-1 text-sm text-neutral-400">{isOver ? "kcal over" : "kcal left"}</span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
        <span className={`rounded-full px-2.5 py-1 font-medium ${chipClass}`}>{meta.label}</span>
        {projectedEod !== null && (
          <span className="text-neutral-500">Projected ≈ {projectedEod.toLocaleString()} kcal</span>
        )}
      </div>
      <p className="sr-only">
        Target {targetIntake.toLocaleString()} kcal ({goal.toLowerCase()})
      </p>

      {children && <div className="mt-6 border-t border-white/5 pt-5">{children}</div>}
    </section>
  );
}
