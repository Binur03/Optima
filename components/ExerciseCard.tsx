"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { formatDuration, type Equipment, type ExerciseKind, type LiftSet } from "@/lib/lifts";
import { swapsFor } from "@/lib/exerciseCatalog";
import { PROGRESS_KEY } from "@/lib/useProgress";
import { formatDay } from "./charts/GlassTooltip";
import { CountdownRing } from "./CountdownRing";
import { StepperField } from "./StepperField";
import { SwipeToCopy } from "./SwipeToCopy";
import { useUnits } from "@/lib/useUnits";
import { displayToLb, lbToDisplay, liftStep, weightUnit } from "@/lib/units";

export interface ExerciseView {
  id: string;
  name: string;
  kind: ExerciseKind;
  today: LiftSet[];
  last: { date: string; sets: LiftSet[] } | null;
}

export interface SplitsData {
  today: string;
  equipment: Equipment;
  program: { id: string; name: string; isActive: boolean } | null;
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
  qc.invalidateQueries({ queryKey: PROGRESS_KEY }, { cancelRefetch: false });
}

type Draft = { weight: string; reps: string; seconds: string };
const EMPTY: Draft = { weight: "", reps: "", seconds: "" };
const DEFAULT_HOLD = 30;

const CHECK = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

interface Props {
  exercise: ExerciseView;
  defaultOpen?: boolean;
  splitId?: string; // enables "swap for home"
  equipment?: Equipment;
}

export function ExerciseCard({ exercise, defaultOpen = false, splitId, equipment = "gym" }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({}); // keyed by absolute set index
  const [extra, setExtra] = useState(0);
  const [timerFor, setTimerFor] = useState<number | null>(null);
  // Sets are stored in lb; drafts are typed in the user's unit.
  const { units } = useUnits();
  const wu = weightUnit(units);
  const show = (lb: number) => lbToDisplay(lb, units, "lift");
  useEffect(() => setDrafts({}), [units]); // a half-typed number would change meaning

  const kind = exercise.kind;
  const done = exercise.today;
  const ghost = exercise.last?.sets ?? [];
  const pending = Math.max(Math.max(ghost.length - done.length, 0) + extra, 1);
  // Ghost for a set index: last session's matching set, else its final set,
  // else the most recent set logged today (so repeat sets stay one tap).
  const ghostFor = (i: number): LiftSet | undefined => ghost[i] ?? ghost[ghost.length - 1] ?? done[done.length - 1];

  // Bodyweight load reads as BW, BW + 20, BW − 25 (assisted).
  const bw = (lb: number) => {
    const v = show(lb);
    return v === 0 ? "BW" : v > 0 ? `+${v}` : `−${Math.abs(v)}`;
  };
  const describe = (s: LiftSet) =>
    s.seconds !== undefined
      ? formatDuration(s.seconds)
      : kind === "bodyweight"
        ? `${bw(s.weight)} × ${s.reps}`
        : `${show(s.weight)} ${wu} × ${s.reps}`;

  const addSet = useMutation({
    mutationFn: async (s: LiftSet) => {
      const res = await fetch("/api/lifts/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          s.seconds !== undefined
            ? { exerciseId: exercise.id, seconds: s.seconds }
            : { exerciseId: exercise.id, weight: s.weight, reps: s.reps }
        ),
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

  const swaps = splitId ? swapsFor(exercise.name, equipment) : [];
  const swap = useMutation({
    mutationFn: async (replaceWith: string) => {
      const res = await fetch(`/api/lifts/splits/${splitId}/exercises`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: exercise.id, replaceWith }),
      });
      if (!res.ok) throw new Error("swap_failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lift-splits"] }),
  });

  function resolve(i: number): LiftSet | null {
    const d = drafts[i];
    const g = ghostFor(i);
    if (kind === "duration") {
      const seconds = d?.seconds ? Number(d.seconds) : g?.seconds ?? DEFAULT_HOLD;
      return Number.isFinite(seconds) && seconds >= 1 ? { weight: 0, reps: 0, seconds: Math.round(seconds) } : null;
    }
    // Bodyweight with nothing entered = plain bodyweight (0 added).
    const weight = d?.weight ? displayToLb(Number(d.weight), units) : g?.weight ?? (kind === "bodyweight" ? 0 : undefined);
    const reps = d?.reps ? Number(d.reps) : g?.reps;
    if (weight === undefined || reps === undefined || !reps) return null;
    const min = kind === "bodyweight" ? -500 : 0;
    if (!Number.isFinite(weight) || weight < min || !Number.isInteger(reps) || reps < 1) return null;
    return { weight, reps };
  }

  function log(i: number, s: LiftSet | null = resolve(i)) {
    if (!s) return;
    addSet.mutate(s, {
      onSuccess: () => {
        setDrafts(({ [i]: _, ...rest }) => rest);
        if (i >= ghost.length && extra > 0) setExtra((e) => e - 1);
      },
    });
  }

  const best =
    kind === "duration"
      ? ghost.reduce<LiftSet | null>((a, s) => (!a || (s.seconds ?? 0) > (a.seconds ?? 0) ? s : a), null)
      : ghost.reduce<LiftSet | null>((a, s) => (!a || s.weight > a.weight || (s.weight === a.weight && s.reps > a.reps) ? s : a), null);
  const subtitle = done.length
    ? `${done.length} set${done.length === 1 ? "" : "s"} today`
    : exercise.last && best
      ? `Last: ${describe(best)} · ${formatDay(exercise.last.date)}`
      : "No history yet";
  const cols = kind === "duration" ? "grid-cols-[2rem_1fr_2.75rem_2.75rem]" : "grid-cols-[2rem_1fr_1fr_2.75rem]";

  return (
    <div className="overflow-hidden rounded-3xl border border-white/5 bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-white">{exercise.name}</span>
            {kind !== "weight" && (
              <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {kind === "duration" ? "Timed" : "BW"}
              </span>
            )}
          </span>
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

      {/* Needs more than the user has → one-tap home alternatives. */}
      {swaps.length > 0 && (
        <div className="-mt-1 flex flex-wrap items-center gap-1.5 px-5 pb-3">
          <span className="text-[11px] font-medium text-amber-300/90">
            {equipment === "bodyweight" ? "No equipment?" : "Dumbbells only?"} Swap for:
          </span>
          {swaps.map((s) => (
            <button
              key={s}
              type="button"
              disabled={swap.isPending}
              onClick={() => swap.mutate(s)}
              className="rounded-full bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200 ring-1 ring-inset ring-amber-300/25 transition hover:bg-amber-300/20 disabled:opacity-50"
            >
              ⇄ {s}
            </button>
          ))}
          {swap.isError && <span className="text-[11px] text-rose-400">Couldn’t swap — try again.</span>}
        </div>
      )}

      {open && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3">
          <div className={`mb-2 grid ${cols} gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500`}>
            <span>Set</span>
            {kind === "duration" ? (
              <span className="text-center">Seconds</span>
            ) : (
              <>
                <span className="text-center">{kind === "bodyweight" ? `+${wu}` : wu}</span>
                <span className="text-center">Reps</span>
              </>
            )}
            <span />
            {kind === "duration" && <span />}
          </div>

          <div className="flex flex-col gap-2">
            {done.map((s, i) => (
              <SwipeToCopy
                key={`done-${i}`}
                onCopy={() => addSet.mutate(s)}
                label="Same again"
                a11yLabel={`Log another ${describe(s)}`}
                disabled={addSet.isPending}
                className="rounded-2xl bg-[#16221e]"
              >
                <div className={`grid ${cols} items-center gap-2 px-1 py-1`}>
                  <span className="text-center text-sm font-semibold text-emerald-400">{i + 1}</span>
                  {s.seconds !== undefined ? (
                    <span className="col-span-2 py-2 text-center text-base font-semibold tabular-nums text-white">{formatDuration(s.seconds)}</span>
                  ) : (
                    <>
                      <span className="py-2 text-center text-base font-semibold tabular-nums text-white">
                        {kind === "bodyweight" ? bw(s.weight) : show(s.weight)}
                      </span>
                      <span className="py-2 text-center text-base font-semibold tabular-nums text-white">{s.reps}</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeSet.mutate(i)}
                    disabled={removeSet.isPending}
                    aria-label={`Remove set ${i + 1}`}
                    className="grid h-10 w-10 place-items-center rounded-xl text-emerald-400 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
                  >
                    {CHECK}
                  </button>
                </div>
              </SwipeToCopy>
            ))}

            {Array.from({ length: pending }, (_, j) => {
              const i = done.length + j;
              const g = ghostFor(i);
              const d = drafts[i] ?? EMPTY;
              const ready = resolve(i) !== null;
              const set = (patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [i]: { ...(prev[i] ?? d), ...patch } }));
              return (
                <SwipeToCopy
                  key={`pending-${i}`}
                  onCopy={() => log(i)}
                  label="Log set"
                  a11yLabel={`Log set ${i + 1}`}
                  disabled={!ready || addSet.isPending}
                  className="rounded-2xl bg-neutral-900"
                >
                  <div className={`grid ${cols} items-center gap-2 px-1`}>
                    <span className="text-center text-sm font-semibold text-neutral-500">{i + 1}</span>
                    {kind === "duration" ? (
                      <>
                        <StepperField
                          label={`Set ${i + 1} seconds`}
                          value={d.seconds}
                          placeholder={String(g?.seconds ?? DEFAULT_HOLD)}
                          onChange={(v) => set({ seconds: v })}
                          step={(s) => (s < 60 ? 5 : 15)}
                          min={5}
                          max={3600}
                        />
                        <button
                          type="button"
                          onClick={() => ready && setTimerFor(i)}
                          disabled={!ready}
                          aria-label={`Start a timer for set ${i + 1}`}
                          className="grid h-10 w-10 place-items-center rounded-xl bg-sky-400/15 text-sky-300 ring-1 ring-inset ring-sky-400/30 transition hover:bg-sky-400 hover:text-zinc-950 disabled:opacity-30"
                        >
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                            <path d="M8 5.5v13l10.5-6.5z" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <StepperField
                          label={`Set ${i + 1} ${kind === "bodyweight" ? "added weight" : "weight"}`}
                          inputMode="decimal"
                          value={d.weight}
                          placeholder={g ? String(show(g.weight)) : kind === "bodyweight" ? "0" : undefined}
                          onChange={(v) => set({ weight: v })}
                          step={liftStep(units)}
                          min={kind === "bodyweight" ? -200 : 0}
                          max={2000}
                        />
                        <StepperField
                          label={`Set ${i + 1} reps`}
                          value={d.reps}
                          placeholder={g ? String(g.reps) : undefined}
                          onChange={(v) => set({ reps: v })}
                          step={1}
                          min={1}
                          max={200}
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => log(i)}
                      disabled={!ready || addSet.isPending}
                      aria-label={`Log set ${i + 1}`}
                      className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-neutral-300 ring-1 ring-inset ring-white/10 transition hover:bg-emerald-500 hover:text-zinc-950 disabled:opacity-30 disabled:hover:bg-white/[0.06] disabled:hover:text-neutral-300"
                    >
                      {CHECK}
                    </button>
                  </div>
                </SwipeToCopy>
              );
            })}
          </div>
          <p className="m-0 mt-2 text-center text-[11px] text-neutral-600">
            {kind === "duration"
              ? "Tap ▶ for a countdown · ✓ logs without the timer"
              : kind === "bodyweight"
                ? "0 = bodyweight · + for a vest · − for band assistance"
                : "Tap a number to adjust · swipe a set right to log it"}
          </p>

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

      {timerFor !== null && (
        <CountdownRing
          seconds={resolve(timerFor)?.seconds ?? DEFAULT_HOLD}
          label={`${exercise.name} · set ${timerFor + 1}`}
          onCancel={() => setTimerFor(null)}
          onDone={(held) => {
            const i = timerFor;
            setTimerFor(null);
            log(i, { weight: 0, reps: 0, seconds: held });
          }}
        />
      )}
    </div>
  );
}
