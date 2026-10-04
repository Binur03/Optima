"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExerciseCard, type SplitsData } from "@/components/ExerciseCard";
import { SplitSheet } from "@/components/SplitSheet";
import { formatDay } from "@/components/charts/GlassTooltip";

async function getSplits(): Promise<SplitsData> {
  const res = await fetch("/api/lifts/splits");
  if (!res.ok) throw new Error("splits_failed");
  return res.json();
}

// Small JSON helper: throws with the server's error code so the UI can explain it.
async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "request_failed");
  return json;
}

const ERRORS: Record<string, string> = {
  split_exists: "You already have a split with that name.",
  invalid_name: "Names need 2–40 characters.",
};

export default function TrainPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["lift-splits"], queryFn: getSplits });
  const [splitId, setSplitId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rename, setRename] = useState<string | null>(null);

  const active = data?.splits.find((s) => s.id === splitId) ?? data?.splits[0];
  const refresh = () => qc.invalidateQueries({ queryKey: ["lift-splits"] });

  const addExercise = useMutation({
    mutationFn: (name: string) => send(`/api/lifts/splits/${active?.id}/exercises`, "POST", { name }),
    onSuccess: () => {
      setNewName("");
      refresh();
    },
  });
  const removeExercise = useMutation({
    mutationFn: (exerciseId: string) => send(`/api/lifts/splits/${active?.id}/exercises`, "DELETE", { exerciseId }),
    onSuccess: refresh,
  });
  const moveExercise = useMutation({
    mutationFn: (v: { exerciseId: string; move: 1 | -1 }) => send(`/api/lifts/splits/${active?.id}/exercises`, "PATCH", v),
    onSuccess: refresh,
  });
  const createSplit = useMutation({
    mutationFn: (v: { name: string; exercises: string[] }) =>
      send("/api/lifts/splits", "POST", v) as Promise<{ split: { id: string } }>,
    onSuccess: (res) => {
      setSheetOpen(false);
      setSplitId(res.split.id);
      refresh();
    },
  });
  const updateSplit = useMutation({
    mutationFn: (v: { id: string; name?: string; move?: 1 | -1 }) => send(`/api/lifts/splits/${v.id}`, "PATCH", v),
    onSuccess: () => {
      setRename(null);
      refresh();
    },
  });
  const deleteSplit = useMutation({
    mutationFn: (id: string) => send(`/api/lifts/splits/${id}`, "DELETE"),
    onSuccess: () => {
      setSplitId(null);
      refresh();
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

  // An exercise in two splits appears twice — count each lift's sets once.
  const uniqueToday = [...new Map(data.splits.flatMap((s) => s.exercises).map((e) => [e.id, e.today])).values()].flat();
  const volume = uniqueToday.reduce((sum, s) => sum + s.weight * s.reps, 0);
  const activeIndex = active ? data.splits.findIndex((s) => s.id === active.id) : -1;
  const splitError = updateSplit.error ?? deleteSplit.error;

  return (
    <main className="flex flex-col gap-5 pb-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-medium text-neutral-500">{formatDay(data.today)}</p>
          <h1 className="m-0 text-3xl font-semibold tracking-tight text-white">Train</h1>
        </div>
        <div className="flex items-end gap-3">
          {!editing && (
            <div className="text-right">
              <p className="m-0 text-2xl font-bold tabular-nums text-white">{uniqueToday.length}</p>
              <p className="m-0 text-[11px] text-neutral-500">
                sets today{volume > 0 ? ` · ${volume.toLocaleString()} lb` : ""}
              </p>
            </div>
          )}
          {data.splits.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setEditing((e) => !e);
                setRename(null);
              }}
              aria-pressed={editing}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                editing ? "bg-white text-zinc-950" : "bg-neutral-900 text-neutral-300 ring-1 ring-inset ring-white/10 hover:text-white"
              }`}
            >
              {editing ? "Done" : "Edit"}
            </button>
          )}
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
              onClick={() => {
                setSplitId(s.id);
                setRename(null);
              }}
              className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition ${
                selected ? "bg-white text-zinc-950" : "bg-neutral-900 text-neutral-400 ring-1 ring-inset ring-white/5 hover:text-white"
              }`}
            >
              {s.name}
              {logged && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="logged today" />}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            createSplit.reset();
            setSheetOpen(true);
          }}
          aria-label="Add a split"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-900 text-neutral-400 ring-1 ring-inset ring-white/15 transition hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {data.splits.length === 0 && (
        <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center">
          <p className="m-0 text-sm text-neutral-400">Build your program — Push/Pull/Legs, a bro split, anything.</p>
          <button type="button" onClick={() => setSheetOpen(true)} className="mt-3 text-sm font-semibold text-sky-300 hover:underline">
            Add your first split
          </button>
        </div>
      )}

      {active && editing && (
        <section className="rounded-3xl border border-white/5 bg-neutral-900 p-4" aria-label={`Edit ${active.name}`}>
          <div className="flex items-center gap-2">
            {rename !== null ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateSplit.mutate({ id: active.id, name: rename });
                }}
              >
                <input
                  value={rename}
                  onChange={(e) => setRename(e.target.value)}
                  maxLength={40}
                  autoFocus
                  aria-label="Split name"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-sky-400/50 focus:outline-none"
                />
                <button type="submit" disabled={updateSplit.isPending || rename.trim().length < 2} className={SMALL_BTN}>
                  Save
                </button>
              </form>
            ) : (
              <>
                <p className="m-0 min-w-0 flex-1 truncate text-base font-semibold text-white">{active.name}</p>
                <button type="button" onClick={() => setRename(active.name)} className={SMALL_BTN}>
                  Rename
                </button>
              </>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={activeIndex <= 0 || updateSplit.isPending}
              onClick={() => updateSplit.mutate({ id: active.id, move: -1 })}
              className={`${SMALL_BTN} flex-1`}
            >
              ← Move left
            </button>
            <button
              type="button"
              disabled={activeIndex >= data.splits.length - 1 || updateSplit.isPending}
              onClick={() => updateSplit.mutate({ id: active.id, move: 1 })}
              className={`${SMALL_BTN} flex-1`}
            >
              Move right →
            </button>
            <button
              type="button"
              disabled={deleteSplit.isPending}
              onClick={() => {
                if (window.confirm(`Delete the ${active.name} split? Your logged sets are kept.`)) deleteSplit.mutate(active.id);
              }}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/30 transition hover:bg-rose-500/10 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              createSplit.reset();
              setSheetOpen(true);
            }}
            className="mt-3 w-full rounded-xl border border-dashed border-white/15 py-2.5 text-sm font-semibold text-sky-300 transition hover:bg-white/[0.03]"
          >
            + New split
          </button>
          {splitError && (
            <p role="alert" className="m-0 mt-2 text-xs text-rose-400">
              {ERRORS[splitError.message] ?? "Couldn’t save that change."}
            </p>
          )}
        </section>
      )}

      {active && (
        <div className="flex flex-col gap-3">
          {active.exercises.length === 0 && (
            <p className="m-0 rounded-3xl bg-neutral-900 p-5 text-center text-sm text-neutral-500">
              No exercises in {active.name} yet — add one below.
            </p>
          )}

          {editing ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {active.exercises.map((e, i) => (
                <li key={e.id} className="flex items-center gap-2 rounded-2xl bg-neutral-900 py-2 pl-4 pr-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{e.name}</span>
                  <button
                    type="button"
                    aria-label={`Move ${e.name} up`}
                    disabled={i === 0 || moveExercise.isPending}
                    onClick={() => moveExercise.mutate({ exerciseId: e.id, move: -1 })}
                    className={ICON_BTN}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${e.name} down`}
                    disabled={i === active.exercises.length - 1 || moveExercise.isPending}
                    onClick={() => moveExercise.mutate({ exerciseId: e.id, move: 1 })}
                    className={ICON_BTN}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${e.name} from ${active.name}`}
                    disabled={removeExercise.isPending}
                    onClick={() => removeExercise.mutate(e.id)}
                    className={`${ICON_BTN} text-rose-300 hover:bg-rose-500/10`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            active.exercises.map((e, i) => <ExerciseCard key={e.id} exercise={e} defaultOpen={i === 0} />)
          )}

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
          {editing && (
            <p className="m-0 px-2 text-center text-[11px] text-neutral-600">
              Removing a lift keeps its history — add it back any time and your last session returns.
            </p>
          )}
        </div>
      )}

      <SplitSheet
        open={sheetOpen}
        existing={data.splits.map((s) => s.name)}
        busy={createSplit.isPending}
        error={createSplit.error ? ERRORS[createSplit.error.message] ?? "Couldn’t create that split." : null}
        onClose={() => setSheetOpen(false)}
        onCreate={(v) => createSplit.mutate(v)}
      />
    </main>
  );
}

const SMALL_BTN =
  "rounded-xl px-3 py-2 text-xs font-semibold text-neutral-200 ring-1 ring-inset ring-white/10 transition hover:bg-white/5 disabled:opacity-40";
const ICON_BTN =
  "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm text-neutral-400 transition hover:bg-white/5 hover:text-white disabled:opacity-30";
