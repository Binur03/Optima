"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExerciseCard, type SplitsData } from "@/components/ExerciseCard";
import { formatDay } from "@/components/charts/GlassTooltip";

async function getSplits(): Promise<SplitsData> {
  const res = await fetch("/api/lifts/splits");
  if (!res.ok) throw new Error("splits_failed");
  return res.json();
}

export default function TrainPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["lift-splits"], queryFn: getSplits });
  const [splitId, setSplitId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const active = data?.splits.find((s) => s.id === splitId) ?? data?.splits[0];

  const addExercise = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/lifts/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ splitId: active?.id, name }),
      });
      if (!res.ok) throw new Error("add_failed");
    },
    onSuccess: () => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["lift-splits"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex animate-pulse flex-col gap-4" aria-busy="true">
        <div className="h-9 w-24 rounded-lg bg-white/5" />
        <div className="h-10 rounded-full bg-white/5" />
        <div className="h-20 rounded-3xl bg-white/5" />
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

  const allToday = data.splits.flatMap((s) => s.exercises).flatMap((e) => e.today);
  const volume = allToday.reduce((sum, s) => sum + s.weight * s.reps, 0);

  return (
    <main className="flex flex-col gap-5 pb-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-medium text-neutral-500">{formatDay(data.today)}</p>
          <h1 className="m-0 text-3xl font-semibold tracking-tight text-white">Train</h1>
        </div>
        <div className="text-right">
          <p className="m-0 text-2xl font-bold tabular-nums text-white">{allToday.length}</p>
          <p className="m-0 text-[11px] text-neutral-500">
            sets today{volume > 0 ? ` · ${volume.toLocaleString()} lb` : ""}
          </p>
        </div>
      </header>

      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Workout split"
      >
        {data.splits.map((s) => {
          const selected = s.id === active?.id;
          const logged = s.exercises.some((e) => e.today.length > 0);
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSplitId(s.id)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition ${
                selected ? "bg-white text-zinc-950" : "bg-neutral-900 text-neutral-400 ring-1 ring-inset ring-white/5 hover:text-white"
              }`}
            >
              {s.name}
              {logged && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="logged today" />}
            </button>
          );
        })}
      </div>

      {active && (
        <div className="flex flex-col gap-3">
          {active.exercises.map((e, i) => (
            <ExerciseCard key={e.id} exercise={e} defaultOpen={i === 0} />
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
    </main>
  );
}
