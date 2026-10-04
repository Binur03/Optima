"use client";

import { useState } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { LiftSet } from "@/lib/lifts";
import { formatDay } from "./charts/GlassTooltip";

export interface ExerciseView {
  id: string;
  name: string;
  today: LiftSet[];
  last: { date: string; sets: LiftSet[] } | null;
}

export interface SplitsData {
  today: string;
  splits: { id: string; name: string; exercises: ExerciseView[] }[];
}

// Writes the server's fresh "today" sets for one exercise into the cache, so a
// confirm updates instantly without refetching every split.
function patchToday(qc: QueryClient, exerciseId: string, today: LiftSet[]) {
  qc.setQueryData<SplitsData>(["lift-splits"], (prev) =>
    prev && {
      ...prev,
      splits: prev.splits.map((s) => ({
        ...s,
        exercises: s.exercises.map((e) => (e.id === exerciseId ? { ...e, today } : e)),
      })),
    }
  );
  qc.invalidateQueries({ queryKey: ["lift-insights"] });
}

type Draft = { weight: string; reps: string };

export function ExerciseCard({ exercise, defaultOpen = false }: { exercise: ExerciseView; defaultOpen?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({}); // keyed by absolute set index
  const [extra, setExtra] = useState(0);

  const done = exercise.today;
  const ghost = exercise.last?.sets ?? [];
  const pending = Math.max(Math.max(ghost.length - done.length, 0) + extra, 1);
  // Ghost for a set index: last session's matching set, else its final set,
  // else the most recent set logged today (so repeat sets stay one tap).
  const ghostFor = (i: number): LiftSet | undefined => ghost[i] ?? ghost[ghost.length - 1] ?? done[done.length - 1];

  const addSet = useMutation({
    mutationFn: async (s: LiftSet) => {
      const res = await fetch("/api/lifts/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: exercise.id, ...s }),
      });
      if (!res.ok) throw new Error("set_failed");
      return (await res.json()).today as LiftSet[];
    },
    onSuccess: (today) => patchToday(qc, exercise.id, today),
  });

  const removeSet = useMutation({
    mutationFn: async (index: number) => {
      const res = await fetch("/api/lifts/sets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: exercise.id, index }),
      });
      if (!res.ok) throw new Error("remove_failed");
      return (await res.json()).today as LiftSet[];
    },
    onSuccess: (today) => patchToday(qc, exercise.id, today),
  });

  function resolve(i: number): LiftSet | null {
    const d = drafts[i];
    const g = ghostFor(i);
    const weight = d?.weight ? Number(d.weight) : g?.weight;
    const reps = d?.reps ? Number(d.reps) : g?.reps;
    if (weight === undefined || reps === undefined) return null;
    if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 1) return null;
    return { weight, reps };
  }

  function confirm(i: number) {
    const s = resolve(i);
    if (!s) return;
    addSet.mutate(s, {
      onSuccess: () => {
        setDrafts(({ [i]: _, ...rest }) => rest);
        if (i >= ghost.length && extra > 0) setExtra((e) => e - 1);
      },
    });
  }

  const best = ghost.reduce<LiftSet | null>((a, s) => (!a || s.weight > a.weight ? s : a), null);
  const subtitle = done.length
    ? `${done.length} set${done.length === 1 ? "" : "s"} today`
    : exercise.last && best
      ? `Last: ${best.weight} × ${best.reps} · ${formatDay(exercise.last.date)}`
      : "No history yet";

  return (
    <div className="overflow-hidden rounded-3xl border border-white/5 bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-white">{exercise.name}</span>
          <span className={`block text-xs ${done.length ? "text-emerald-400" : "text-neutral-500"}`}>{subtitle}</span>
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3">
          <div className="mb-2 grid grid-cols-[2rem_1fr_1fr_2.75rem] gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            <span>Set</span>
            <span className="text-center">lb</span>
            <span className="text-center">Reps</span>
            <span />
          </div>

          <div className="flex flex-col gap-2">
            {done.map((s, i) => (
              <div key={`done-${i}`} className="grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 rounded-2xl bg-emerald-500/[0.07] px-1 py-1">
                <span className="text-center text-sm font-semibold text-emerald-400">{i + 1}</span>
                <span className="py-2 text-center text-base font-semibold tabular-nums text-white">{s.weight}</span>
                <span className="py-2 text-center text-base font-semibold tabular-nums text-white">{s.reps}</span>
                <button
                  type="button"
                  onClick={() => removeSet.mutate(i)}
                  disabled={removeSet.isPending}
                  aria-label={`Remove set ${i + 1}`}
                  className="grid h-10 w-10 place-items-center rounded-xl text-emerald-400 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </button>
              </div>
            ))}

            {Array.from({ length: pending }, (_, j) => {
              const i = done.length + j;
              const g = ghostFor(i);
              const d = drafts[i] ?? { weight: "", reps: "" };
              const ready = resolve(i) !== null;
              const set = (patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [i]: { ...d, ...patch } }));
              return (
                <div key={`pending-${i}`} className="grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 px-1">
                  <span className="text-center text-sm font-semibold text-neutral-500">{i + 1}</span>
                  <input
                    inputMode="decimal"
                    aria-label={`Set ${i + 1} weight`}
                    value={d.weight}
                    placeholder={g ? String(g.weight) : "—"}
                    onChange={(e) => set({ weight: e.target.value.replace(/[^\d.]/g, "") })}
                    className={GHOST_INPUT}
                  />
                  <input
                    inputMode="numeric"
                    aria-label={`Set ${i + 1} reps`}
                    value={d.reps}
                    placeholder={g ? String(g.reps) : "—"}
                    onChange={(e) => set({ reps: e.target.value.replace(/\D/g, "") })}
                    className={GHOST_INPUT}
                  />
                  <button
                    type="button"
                    onClick={() => confirm(i)}
                    disabled={!ready || addSet.isPending}
                    aria-label={`Log set ${i + 1}`}
                    className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-neutral-300 ring-1 ring-inset ring-white/10 transition hover:bg-emerald-500 hover:text-zinc-950 disabled:opacity-30 disabled:hover:bg-white/[0.06] disabled:hover:text-neutral-300"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setExtra((e) => e + 1)}
            className="mt-3 w-full rounded-xl bg-transparent py-2 text-sm font-medium text-neutral-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            + Add set
          </button>
          {(addSet.isError || removeSet.isError) && (
            <p role="alert" className="m-0 mt-2 text-center text-xs text-rose-400">
              Couldn’t save that set — try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const GHOST_INPUT =
  "w-full rounded-xl border border-white/5 bg-zinc-950 py-2.5 text-center text-base font-semibold tabular-nums text-white placeholder:font-medium placeholder:text-neutral-600 focus:border-emerald-500/50 focus:outline-none";
