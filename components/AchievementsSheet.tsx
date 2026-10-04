"use client";

import { useEffect } from "react";
import type { ProgressState } from "@/lib/gamification";
import { useUnits } from "@/lib/useUnits";
import { formatWeight } from "@/lib/units";

interface Props {
  open: boolean;
  onClose: () => void;
  data: ProgressState;
}

export function AchievementsSheet({ open, onClose, data }: Props) {
  const { units } = useUnits();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const { xp, streak, achievements } = data;
  const unlocked = achievements.filter((a) => a.unlockedAt).length;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Level and achievements">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-[480px] animate-sheet-up overflow-y-auto rounded-t-3xl border-t border-white/10 bg-neutral-900 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" aria-hidden />

        <div className="flex items-center gap-4">
          <LevelBadge level={xp.level} large />
          <div className="min-w-0">
            <p className="m-0 text-2xl font-semibold tracking-tight text-white">{xp.rank}</p>
            <p className="m-0 mt-0.5 text-sm text-neutral-400">
              {(xp.span - xp.into).toLocaleString()} XP to Level {xp.level + 1}
            </p>
            {xp.nextRank && (
              <p className="m-0 mt-0.5 text-xs text-neutral-500">
                {xp.nextRank.name} unlocks at Level {xp.nextRank.level}
              </p>
            )}
          </div>
        </div>

        <dl className="m-0 mt-5 grid grid-cols-3 divide-x divide-white/5 rounded-2xl bg-white/[0.03] py-3 text-center">
          <Stat label="Total XP" value={xp.total.toLocaleString()} />
          <Stat label="Streak" value={`${streak.current}d`} />
          <Stat label="Best" value={`${streak.highest}d`} />
        </dl>

        <div className="mt-6 flex items-baseline justify-between">
          <h2 className="m-0 text-base font-semibold text-white">Achievements</h2>
          <span className="text-xs font-semibold tabular-nums text-neutral-400">
            {unlocked}/{achievements.length}
          </span>
        </div>
        <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-2 p-0">
          {achievements.map((a) => {
            const got = a.unlockedAt != null;
            return (
              <li
                key={a.key}
                className={`rounded-2xl p-3.5 ring-1 ring-inset ${
                  got ? "bg-amber-300/[0.06] ring-amber-300/20" : "bg-white/[0.02] ring-white/5"
                }`}
              >
                <span
                  className={`grid h-11 w-11 place-items-center rounded-full text-xl ${
                    got ? "bg-gradient-to-br from-amber-200/30 to-orange-500/30" : "bg-white/5 grayscale"
                  }`}
                  aria-hidden
                >
                  <span className={got ? "" : "opacity-40"}>{a.icon}</span>
                </span>
                <p className={`m-0 mt-2.5 text-sm font-semibold ${got ? "text-white" : "text-neutral-400"}`}>{a.title}</p>
                <p className="m-0 mt-0.5 text-xs leading-snug text-neutral-500">
                  {/* e.g. "Bench press 225 lb" → "Bench press 102 kg" */}
                  {a.description.replace(/(\d+(?:\.\d+)?) lb\b/g, (_, n) => formatWeight(Number(n), units, "lift"))}
                </p>
                <p className={`m-0 mt-2 text-[11px] font-bold tabular-nums ${got ? "text-amber-300" : "text-neutral-600"}`}>
                  {got
                    ? `Unlocked ${new Date(a.unlockedAt!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                    : `🔒 +${a.xp} XP`}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function LevelBadge({ level, large = false }: { level?: number; large?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center bg-gradient-to-br from-amber-300 to-orange-500 font-black tabular-nums text-zinc-950 shadow-[0_0_16px_rgba(251,191,36,0.35)] ${
        large ? "h-16 w-16 rounded-2xl text-2xl" : "h-9 w-9 rounded-xl text-sm"
      }`}
      aria-hidden
    >
      {level ?? ""}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-neutral-500">{label}</dt>
      <dd className="m-0 mt-0.5 text-lg font-bold tabular-nums text-white">{value}</dd>
    </div>
  );
}
