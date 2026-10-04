"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CARDIO_ACTIVITIES, WORKOUT_GOAL, activityMeta, type CardioActivity } from "@/lib/cardio";
import { PROGRESS_KEY } from "@/lib/useProgress";
import { useUnits } from "@/lib/useUnits";
import { displayToKm, distanceUnit, kmToDisplay } from "@/lib/units";
import { StepperField } from "./StepperField";

interface Entry {
  id: string;
  activity: string;
  minutes: number;
  distanceKm: number | null;
  steps: number | null;
}

// Today's walks / runs / rides / rows / HIIT, with a quick-log sheet. Any 20
// minutes here (or 8,000 steps) closes the Workout ring, same as lifting.
export function CardioCard({ autoOpen = false, openSignal = 0 }: { autoOpen?: boolean; openSignal?: number }) {
  const qc = useQueryClient();
  const { units } = useUnits();
  const [open, setOpen] = useState(false);
  // Opens on arrival via ?cardio=1, and again each time the speed dial asks.
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen, openSignal]);

  const { data: entries } = useQuery({
    queryKey: ["cardio", "today"],
    queryFn: async (): Promise<Entry[]> => {
      const res = await fetch("/api/cardio");
      if (!res.ok) throw new Error("cardio_failed");
      return (await res.json()).entries;
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["cardio"] });
    qc.invalidateQueries({ queryKey: PROGRESS_KEY }, { cancelRefetch: false });
  };
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/cardio/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
    },
    onSuccess: refresh,
  });

  const minutes = (entries ?? []).reduce((s, e) => s + e.minutes, 0);
  const pct = Math.min(1, minutes / WORKOUT_GOAL.cardioMinutes);

  return (
    <section className="rounded-3xl border border-white/5 bg-neutral-900 p-4" aria-label="Cardio">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-400/15 text-lg" aria-hidden>
          🏃
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-white">Cardio &amp; movement</span>
          <span className="block text-xs text-neutral-500">
            {minutes > 0
              ? `${minutes} min today${minutes >= WORKOUT_GOAL.cardioMinutes ? " · workout ring closed ✓" : ` · ${WORKOUT_GOAL.cardioMinutes - minutes} min to close your ring`}`
              : `${WORKOUT_GOAL.cardioMinutes} min closes your workout ring`}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-xl bg-sky-400 px-3.5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-sky-300"
        >
          + Log
        </button>
      </div>
      {minutes > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
          <div className="h-full rounded-full bg-sky-400 transition-[width] duration-500" style={{ width: `${pct * 100}%` }} />
        </div>
      )}
      {(entries ?? []).length > 0 && (
        <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
          {entries!.map((e) => {
            const meta = activityMeta(e.activity);
            const extras = [
              e.distanceKm ? `${kmToDisplay(e.distanceKm, units)} ${distanceUnit(units)}` : null,
              e.steps ? `${e.steps.toLocaleString()} steps` : null,
            ].filter(Boolean);
            return (
              <li key={e.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] py-2 pl-3 pr-1">
                <span aria-hidden>{meta.icon}</span>
                <span className="min-w-0 flex-1 text-sm text-white">
                  {meta.label} · <span className="tabular-nums">{e.minutes} min</span>
                  {extras.length > 0 && <span className="text-neutral-500"> · {extras.join(" · ")}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => remove.mutate(e.id)}
                  disabled={remove.isPending}
                  aria-label={`Delete ${meta.label}`}
                  className="grid h-8 w-8 place-items-center rounded-full text-neutral-500 transition hover:bg-white/5 hover:text-rose-300"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && <CardioSheet onClose={() => setOpen(false)} onSaved={refresh} />}
    </section>
  );
}

function CardioSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { units } = useUnits();
  const [activity, setActivity] = useState<CardioActivity>("walk");
  const [minutes, setMinutes] = useState("20");
  const [distance, setDistance] = useState("");
  const [steps, setSteps] = useState("");
  const meta = activityMeta(activity);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/cardio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity,
          minutes: Number(minutes),
          distanceKm: meta.distance && distance ? displayToKm(Number(distance), units) : null,
          steps: meta.steps && steps ? Number(steps) : null,
        }),
      });
      if (!res.ok) throw new Error("save_failed");
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Log cardio">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-[480px] animate-sheet-up overflow-y-auto rounded-t-3xl border-t border-white/10 bg-neutral-900 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <h2 className="m-0 text-lg font-semibold text-white">Log cardio</h2>

        <div className="mt-4 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Activity">
          {CARDIO_ACTIVITIES.map((a) => (
            <button
              key={a.key}
              type="button"
              role="radio"
              aria-checked={activity === a.key}
              onClick={() => setActivity(a.key)}
              className={`flex flex-col items-center gap-1 rounded-2xl py-3 text-[11px] font-semibold transition ${
                activity === a.key ? "bg-sky-400/15 text-sky-200 ring-1 ring-inset ring-sky-400/50" : "bg-white/[0.03] text-neutral-400 ring-1 ring-inset ring-white/5"
              }`}
            >
              <span className="text-xl" aria-hidden>
                {a.icon}
              </span>
              {a.label}
            </button>
          ))}
        </div>

        <div className={`mt-5 grid gap-3 ${meta.distance && meta.steps ? "grid-cols-3" : meta.distance ? "grid-cols-2" : "grid-cols-1"}`}>
          <label className="block">
            <span className="text-xs font-medium text-neutral-400">Minutes</span>
            <StepperField label="Minutes" value={minutes} onChange={setMinutes} step={5} min={1} max={600} className="mt-1.5" />
          </label>
          {meta.distance && (
            <label className="block">
              <span className="text-xs font-medium text-neutral-400">{distanceUnit(units)} (optional)</span>
              <StepperField label="Distance" inputMode="decimal" value={distance} placeholder="—" onChange={setDistance} step={0.5} max={300} className="mt-1.5" />
            </label>
          )}
          {meta.steps && (
            <label className="block">
              <span className="text-xs font-medium text-neutral-400">Steps (optional)</span>
              <StepperField label="Steps" value={steps} placeholder="—" onChange={setSteps} step={500} max={100000} className="mt-1.5" />
            </label>
          )}
        </div>
        <p className="m-0 mt-2 text-xs text-neutral-500">
          {WORKOUT_GOAL.cardioMinutes} min of cardio — or {WORKOUT_GOAL.steps.toLocaleString()} steps — closes today’s workout ring.
        </p>

        {save.isError && <p role="alert" className="m-0 mt-3 text-xs text-rose-400">Couldn’t save that — try again.</p>}
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || !(Number(minutes) >= 1)}
          className="mt-5 w-full rounded-xl bg-sky-400 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-sky-300 disabled:bg-white/10 disabled:text-neutral-500"
        >
          {save.isPending ? "Saving…" : `Log ${meta.label.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}
