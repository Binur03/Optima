"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExerciseCard, type SplitsData } from "@/components/ExerciseCard";
import { ProgramSheet } from "@/components/ProgramSheet";
import { formatDay } from "@/components/charts/GlassTooltip";
import { send } from "@/lib/trainApi";
import { CardioCard } from "@/components/CardioCard";
import { totalVolume, type Equipment } from "@/lib/lifts";

const EQUIPMENT: { key: Equipment; label: string; icon: string }[] = [
  { key: "gym", label: "Gym", icon: "🏢" },
  { key: "dumbbells", label: "Dumbbells", icon: "🏋️" },
  { key: "bodyweight", label: "Bodyweight", icon: "🤸" },
];
import { UnitToggle } from "@/components/UnitToggle";
import { useUnits } from "@/lib/useUnits";
import { lbToDisplay, weightUnit } from "@/lib/units";

async function getSplits(): Promise<SplitsData> {
  const res = await fetch("/api/lifts/splits");
  if (!res.ok) throw new Error("splits_failed");
  return res.json();
}

// Remembers the last day picked per program, so reopening Train lands on it.
const dayKey = (programId: string) => `optima:train-day:${programId}`;
function readDay(programId: string): string | null {
  try {
    return localStorage.getItem(dayKey(programId));
  } catch {
    return null;
  }
}
function saveDay(programId: string, splitId: string) {
  try {
    localStorage.setItem(dayKey(programId), splitId);
  } catch {
    /* storage unavailable — fine */
  }
}

export default function TrainPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["lift-splits"], queryFn: getSplits });
  const [splitId, setSplitId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const { units } = useUnits();
  // The + speed dial's "Cardio" bubble links here with ?cardio=1.
  const [cardioOpen, setCardioOpen] = useState(false);
  const [cardioNonce, setCardioNonce] = useState(0);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("cardio")) setCardioOpen(true);
    const open = () => {
      setCardioOpen(true);
      setCardioNonce((n) => n + 1);
    };
    window.addEventListener("optima:open-cardio", open);
    return () => window.removeEventListener("optima:open-cardio", open);
  }, []);

  const setEquipment = useMutation({
    mutationFn: (equipment: Equipment) => send("/api/profile/equipment", "POST", { equipment }),
    // Instant: swap suggestions update before the save lands.
    onMutate: (equipment) => {
      const prev = qc.getQueryData<SplitsData>(["lift-splits"]);
      if (prev) qc.setQueryData<SplitsData>(["lift-splits"], { ...prev, equipment });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["lift-splits"], ctx.prev),
  });

  // Default day: one already trained today, else the last one picked, else the first.
  const programId = data?.program?.id;
  useEffect(() => {
    if (!data || !programId) return;
    if (splitId && data.splits.some((s) => s.id === splitId)) return;
    const trained = data.splits.find((s) => s.exercises.some((e) => e.today.length > 0));
    const remembered = readDay(programId);
    setSplitId(trained?.id ?? (data.splits.some((s) => s.id === remembered) ? remembered : data.splits[0]?.id ?? null));
  }, [data, programId, splitId]);

  const active = data?.splits.find((s) => s.id === splitId) ?? data?.splits[0];

  const addExercise = useMutation({
    mutationFn: (name: string) => send(`/api/lifts/splits/${active?.id}/exercises`, "POST", { name }),
    onSuccess: () => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["lift-splits"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex animate-pulse flex-col gap-4" aria-busy="true">
        <div className="h-9 w-24 rounded-lg bg-white/5" />
        <div className="h-14 rounded-2xl bg-white/5" />
        <div className="h-10 rounded-full bg-white/5" />
        <div className="h-20 rounded-3xl bg-white/5" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p role="alert" className="mt-24 rounded-3xl border border-white/5 bg-neutral-900 p-6 text-center text-sm text-neutral-400">
        Couldn’t load your workouts. Pull to retry.
      </p>
    );
  }

  // An exercise in two days appears twice — count each lift's sets once.
  const uniqueToday = [...new Map(data.splits.flatMap((s) => s.exercises).map((e) => [e.id, e.today])).values()].flat();
  const volume = totalVolume(uniqueToday);

  return (
    <main className="flex flex-col gap-4 pb-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-medium text-neutral-500">{formatDay(data.today)}</p>
          <h1 className="m-0 text-3xl font-semibold tracking-tight text-white">Train</h1>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <UnitToggle />
          <p className="m-0 text-[11px] text-neutral-500">
            <span className="text-base font-bold tabular-nums text-white">{uniqueToday.length}</span> sets today
            {volume > 0 ? ` · ${Math.round(lbToDisplay(volume, units)).toLocaleString()} ${weightUnit(units)}` : ""}
          </p>
        </div>
      </header>

      {/* Where are you training? Drives swap suggestions and template picks. */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/5" role="radiogroup" aria-label="Equipment">
        {EQUIPMENT.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={data.equipment === o.key}
            onClick={() => setEquipment.mutate(o.key)}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition ${
              data.equipment === o.key ? "bg-white text-zinc-950" : "text-neutral-400 hover:text-white"
            }`}
          >
            <span aria-hidden>{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>

      {/* Program switcher */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-haspopup="dialog"
        className="flex items-center gap-3 rounded-2xl bg-neutral-900 px-4 py-3 text-left ring-1 ring-inset ring-white/5 transition hover:ring-white/15 active:scale-[0.99]"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-400/15 text-sky-300" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
            <path d="M3.5 9.5h17M8 3v3M16 3v3" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-neutral-500">Program</span>
          <span className="block truncate text-base font-semibold text-white">{data.program?.name ?? "Pick a program"}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-sky-300">Switch ▾</span>
      </button>

      {!data.program ? (
        <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center">
          <p className="m-0 text-sm text-neutral-400">No program yet — start from Push/Pull/Legs, Arnold, Upper/Lower, or build your own.</p>
          <button type="button" onClick={() => setSheetOpen(true)} className="mt-3 text-sm font-semibold text-sky-300 hover:underline">
            Choose a program
          </button>
        </div>
      ) : data.splits.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center">
          <p className="m-0 text-sm text-neutral-400">{data.program.name} has no training days yet.</p>
          <Link href={`/train/program/${data.program.id}`} className="mt-3 inline-block text-sm font-semibold text-sky-300 hover:underline">
            Add days
          </Link>
        </div>
      ) : (
        <>
          {/* Days wrap onto extra rows instead of scrolling sideways, so every day stays visible. */}
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Training day">
            {data.splits.map((s) => {
              const selected = s.id === active?.id;
              const logged = s.exercises.some((e) => e.today.length > 0);
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setSplitId(s.id);
                    if (programId) saveDay(programId, s.id);
                  }}
                  className={`relative min-h-[44px] rounded-xl px-2 py-2 text-[13px] font-semibold leading-tight transition ${
                    selected ? "bg-white text-zinc-950" : "bg-neutral-900 text-neutral-300 ring-1 ring-inset ring-white/5 hover:text-white"
                  }`}
                >
                  <span className="line-clamp-2">{s.name}</span>
                  {logged && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="trained today" />
                  )}
                </button>
              );
            })}
          </div>

          {active && (
            <div className="flex flex-col gap-3">
              {active.exercises.length === 0 && (
                <p className="m-0 rounded-3xl bg-neutral-900 p-5 text-center text-sm text-neutral-500">
                  No exercises in {active.name} yet — add one below.
                </p>
              )}
              {active.exercises.map((e, i) => (
                <ExerciseCard
                  key={`${active.id}-${e.id}`}
                  exercise={e}
                  defaultOpen={i === 0}
                  splitId={active.id}
                  equipment={data.equipment}
                />
              ))}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newName.trim().length >= 2) addExercise.mutate(newName.trim());
                }}
                className="flex items-center gap-2 rounded-3xl border border-dashed border-white/10 p-1.5 pl-5"
              >
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`Add an exercise to ${active.name}`}
                  maxLength={60}
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={addExercise.isPending || newName.trim().length < 2}
                  className="shrink-0 rounded-2xl bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
                >
                  Add
                </button>
              </form>
            </div>
          )}

          <Link
            href={`/train/program/${data.program.id}`}
            className="mt-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-neutral-400 ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.03] hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
            </svg>
            Edit {data.program.name}
          </Link>
        </>
      )}

      <CardioCard autoOpen={cardioOpen} openSignal={cardioNonce} />

      <ProgramSheet open={sheetOpen} onClose={() => setSheetOpen(false)} equipment={data.equipment} />
    </main>
  );
}
