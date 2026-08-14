"use client";

import type { DeltaResult, Goal, TrackState } from "@/lib/delta";

interface Props {
  delta: DeltaResult;
  goal: Goal;
}

const TRACK_COPY: Record<TrackState, { label: string; className: string }> = {
  on_track: { label: "On track", className: "track-on" },
  under: { label: "Under pace", className: "track-under" },
  over: { label: "Over pace", className: "track-over" },
  unknown: { label: "Not enough data", className: "track-unknown" },
};

export function DeltaBar({ delta, goal }: Props) {
  const { targetIntake, eaten, remaining, pacedTarget, projectedEod, track } = delta;

  if (targetIntake === null) {
    return <div className="delta-bar delta-empty">Connect Fitbit to see your target.</div>;
  }

  const pct = Math.min(100, Math.round((eaten / targetIntake) * 100));
  const pacePct = pacedTarget === null ? 0 : Math.min(100, Math.round((pacedTarget / targetIntake) * 100));
  const meta = TRACK_COPY[track];

  return (
    <div className={`delta-bar ${meta.className}`}>
      <div className="delta-headline">
        <span className="delta-remaining">
          {remaining !== null && remaining >= 0
            ? `${remaining.toLocaleString()} kcal left`
            : `${Math.abs(remaining ?? 0).toLocaleString()} kcal over`}
        </span>
        <span className="delta-state">{meta.label}</span>
      </div>

      <div className="delta-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="delta-fill" style={{ width: `${pct}%` }} />
        {/* Pace marker = where you "should" be right now to finish on target. */}
        <div className="delta-pace-marker" style={{ left: `${pacePct}%` }} aria-label="Pace target" />
      </div>

      <div className="delta-footnote">
        <span>Target {targetIntake.toLocaleString()} kcal ({goal.toLowerCase()})</span>
        {projectedEod !== null && (
          <span>Projected by day end ≈ {projectedEod.toLocaleString()} kcal</span>
        )}
      </div>
    </div>
  );
}
