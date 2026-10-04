"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SplitsData } from "@/components/ExerciseCard";
import { SplitSheet } from "@/components/SplitSheet";
import { send, trainError } from "@/lib/trainApi";
import type { ExerciseKind } from "@/lib/lifts";

type Day = SplitsData["splits"][number];

const KIND_LABEL: Record<ExerciseKind, string> = { weight: "Weight", bodyweight: "BW", duration: "Timed" };
const NEXT_KIND: Record<ExerciseKind, ExerciseKind> = { weight: "bodyweight", bodyweight: "duration", duration: "weight" };

export default function ProgramEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const key = ["lift-splits", "program", id];
  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<SplitsData> => {
      const res = await fetch(`/api/lifts/splits?programId=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("program_failed");
      return res.json();
    },
  });

  const [openDay, setOpenDay] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Every change here can alter what Train shows, so refresh both views.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lift-splits"] });
    qc.invalidateQueries({ queryKey: ["lift-programs"] });
  };
  const programUpdate = useMutation({
    mutationFn: (v: { name?: string; activate?: true }) => send(`/api/lifts/programs/${id}`, "PATCH", v),
    onSuccess: () => {
      setRenaming(null);
      refresh();
    },
  });
  const programDelete = useMutation({
    mutationFn: () => send(`/api/lifts/programs/${id}`, "DELETE"),
    onSuccess: () => {
      refresh();
      router.push("/train");
    },
  });
  const addDay = useMutation({
    mutationFn: (v: { name: string; exercises: string[] }) =>
      send<{ split: { id: string } }>("/api/lifts/splits", "POST", { programId: id, ...v }),
    onSuccess: ({ split }) => {
      setSheetOpen(false);
      setOpenDay(split.id);
      refresh();
    },
  });

  if (isLoading) {
    return (
      <div className="flex animate-pulse flex-col gap-4" aria-busy="true">
        <div className="h-6 w-20 rounded bg-white/5" />
        <div className="h-9 w-48 rounded-lg bg-white/5" />
        <div className="h-16 rounded-2xl bg-white/5" />
        <div className="h-16 rounded-2xl bg-white/5" />
      </div>
    );
  }
  if (isError || !data?.program) {
    return (
      <div className="mt-24 rounded-3xl border border-white/5 bg-neutral-900 p-6 text-center text-sm text-neutral-400">
        <p className="m-0">This program doesn’t exist anymore.</p>
        <Link href="/train" className="mt-3 inline-block font-semibold text-sky-300 hover:underline">
          Back to Train
        </Link>
      </div>
    );
  }

  const program = data.program;
  const isRenamingProgram = renaming === "__program";

  return (
    <main className="flex flex-col gap-4 pb-4">
      <Link href="/train" className="-ml-1 inline-flex w-fit items-center gap-1 py-1 text-sm font-semibold text-sky-300">
        <span aria-hidden className="text-lg leading-none">‹</span> Train
      </Link>

      <header className="flex flex-col gap-3">
        {isRenamingProgram ? (
          <RenameForm
            initial={program.name}
            busy={programUpdate.isPending}
            onCancel={() => setRenaming(null)}
            onSave={(name) => programUpdate.mutate({ name })}
          />
        ) : (
          <div className="flex items-start justify-between gap-3">
            <h1 className="m-0 min-w-0 text-3xl font-semibold tracking-tight text-white [overflow-wrap:anywhere]">{program.name}</h1>
            <button type="button" onClick={() => setRenaming("__program")} className={SMALL_BTN}>
              Rename
            </button>
          </div>
        )}
        {program.isActive ? (
          <p className="m-0 inline-flex w-fit items-center gap-1.5 rounded-full bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-300">
            <span aria-hidden>✓</span> Active on Train
          </p>
        ) : (
          <button
            type="button"
            disabled={programUpdate.isPending}
            onClick={() => programUpdate.mutate({ activate: true })}
            className="w-full rounded-xl bg-sky-400 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-sky-300 disabled:opacity-60"
          >
            Use this program
          </button>
        )}
        {programUpdate.isError && (
          <p role="alert" className="m-0 text-xs text-rose-400">{trainError(programUpdate.error)}</p>
        )}
      </header>

      <section aria-label="Training days" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="m-0 text-sm font-semibold text-white">Training days</h2>
          <span className="text-xs text-neutral-500">{data.splits.length} {data.splits.length === 1 ? "day" : "days"}</span>
        </div>

        {data.splits.length === 0 && (
          <p className="m-0 rounded-2xl bg-neutral-900 p-5 text-center text-sm text-neutral-500">
            No days yet. Add your first one below.
          </p>
        )}

        {data.splits.map((day, i) => (
          <DayCard
            key={day.id}
            day={day}
            index={i}
            total={data.splits.length}
            open={openDay === day.id}
            onToggle={() => setOpenDay(openDay === day.id ? null : day.id)}
            onChanged={refresh}
          />
        ))}

        <button
          type="button"
          onClick={() => {
            addDay.reset();
            setSheetOpen(true);
          }}
          className="mt-1 w-full rounded-2xl border border-dashed border-white/15 py-3.5 text-sm font-semibold text-sky-300 transition hover:bg-white/[0.03]"
        >
          + Add day
        </button>
      </section>

      <button
        type="button"
        disabled={programDelete.isPending}
        onClick={() => {
          if (window.confirm(`Delete ${program.name}? Its days are removed, but every set you’ve logged is kept.`)) {
            programDelete.mutate();
          }
        }}
        className="mt-4 w-full rounded-xl py-3 text-sm font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/30 transition hover:bg-rose-500/10 disabled:opacity-40"
      >
        Delete program
      </button>

      <SplitSheet
        open={sheetOpen}
        existing={data.splits.map((s) => s.name)}
        busy={addDay.isPending}
        error={addDay.isError ? trainError(addDay.error, "Couldn’t add that day.") : null}
        onClose={() => setSheetOpen(false)}
        onCreate={(v) => addDay.mutate(v)}
      />
    </main>
  );
}

function DayCard({
  day,
  index,
  total,
  open,
  onToggle,
  onChanged,
}: {
  day: Day;
  index: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const base = `/api/lifts/splits/${day.id}`;

  const update = useMutation({
    mutationFn: (v: { name?: string; move?: 1 | -1 }) => send(base, "PATCH", v),
    onSuccess: () => {
      setRenaming(false);
      onChanged();
    },
  });
  const remove = useMutation({ mutationFn: () => send(base, "DELETE"), onSuccess: onChanged });
  const addExercise = useMutation({
    mutationFn: (name: string) => send(`${base}/exercises`, "POST", { name }),
    onSuccess: () => {
      setNewName("");
      onChanged();
    },
  });
  const removeExercise = useMutation({
    mutationFn: (exerciseId: string) => send(`${base}/exercises`, "DELETE", { exerciseId }),
    onSuccess: onChanged,
  });
  const moveExercise = useMutation({
    mutationFn: (v: { exerciseId: string; move: 1 | -1 }) => send(`${base}/exercises`, "PATCH", v),
    onSuccess: onChanged,
  });
  // How the lift is recorded: weight × reps → bodyweight → timed hold → …
  const setKind = useMutation({
    mutationFn: (v: { exerciseId: string; kind: ExerciseKind }) =>
      send(`/api/lifts/exercises/${v.exerciseId}`, "PATCH", { kind: v.kind }),
    onSuccess: onChanged,
  });
  const error =
    update.error ?? remove.error ?? addExercise.error ?? removeExercise.error ?? moveExercise.error ?? setKind.error;

  return (
    <div className="overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-inset ring-white/5">
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 text-left"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-xs font-bold tabular-nums text-neutral-300">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-white">{day.name}</span>
            <span className="block text-xs text-neutral-500">
              {day.exercises.length} {day.exercises.length === 1 ? "exercise" : "exercises"}
            </span>
          </span>
          <span className={`ml-auto text-neutral-500 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
            ›
          </span>
        </button>
        <button
          type="button"
          aria-label={`Move ${day.name} up`}
          disabled={index === 0 || update.isPending}
          onClick={() => update.mutate({ move: -1 })}
          className={ICON_BTN}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move ${day.name} down`}
          disabled={index === total - 1 || update.isPending}
          onClick={() => update.mutate({ move: 1 })}
          className={ICON_BTN}
        >
          ↓
        </button>
      </div>

      {open && (
        <div className="border-t border-white/5 p-3">
          {day.exercises.length === 0 && (
            <p className="m-0 px-1 pb-2 text-sm text-neutral-500">No exercises yet.</p>
          )}
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {day.exercises.map((e, i) => (
              <li key={e.id} className="flex items-center gap-1 rounded-xl bg-white/[0.03] py-1 pl-3 pr-1">
                <span className="min-w-0 flex-1 truncate text-sm text-white">{e.name}</span>
                <button
                  type="button"
                  onClick={() => setKind.mutate({ exerciseId: e.id, kind: NEXT_KIND[e.kind] })}
                  disabled={setKind.isPending}
                  aria-label={`${e.name} is recorded as ${KIND_LABEL[e.kind]}. Tap to change`}
                  title="Tap to change how sets are recorded"
                  className="shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-300 transition hover:bg-white/10 disabled:opacity-50"
                >
                  {KIND_LABEL[e.kind]}
                </button>
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
                  disabled={i === day.exercises.length - 1 || moveExercise.isPending}
                  onClick={() => moveExercise.mutate({ exerciseId: e.id, move: 1 })}
                  className={ICON_BTN}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${e.name}`}
                  disabled={removeExercise.isPending}
                  onClick={() => removeExercise.mutate(e.id)}
                  className={`${ICON_BTN} text-rose-300 hover:bg-rose-500/10`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              if (newName.trim().length >= 2) addExercise.mutate(newName.trim());
            }}
            className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-white/10 p-1 pl-3"
          >
            <input
              value={newName}
              onChange={(ev) => setNewName(ev.target.value)}
              placeholder="Add exercise"
              maxLength={60}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={addExercise.isPending || newName.trim().length < 2}
              className="shrink-0 rounded-lg bg-white/[0.06] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
            >
              Add
            </button>
          </form>

          {renaming ? (
            <div className="mt-3">
              <RenameForm
                initial={day.name}
                busy={update.isPending}
                onCancel={() => setRenaming(false)}
                onSave={(name) => update.mutate({ name })}
              />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRenaming(true)} className={SMALL_BTN}>
                Rename day
              </button>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete ${day.name}? Logged sets are kept.`)) remove.mutate();
                }}
                className="rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/30 transition hover:bg-rose-500/10 disabled:opacity-40"
              >
                Delete day
              </button>
            </div>
          )}
          {error && <p role="alert" className="m-0 mt-2 text-xs text-rose-400">{trainError(error)}</p>}
        </div>
      )}
    </div>
  );
}

function RenameForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: string;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim().length >= 2) onSave(value.trim());
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={40}
        autoFocus
        aria-label="New name"
        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-sky-400/50 focus:outline-none"
      />
      <button type="submit" disabled={busy || value.trim().length < 2} className={SMALL_BTN}>
        Save
      </button>
      <button type="button" onClick={onCancel} className="px-2 text-xs font-semibold text-neutral-500 hover:text-white">
        Cancel
      </button>
    </form>
  );
}

const SMALL_BTN =
  "shrink-0 rounded-xl px-3 py-2.5 text-xs font-semibold text-neutral-200 ring-1 ring-inset ring-white/10 transition hover:bg-white/5 disabled:opacity-40";
const ICON_BTN =
  "grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm text-neutral-400 transition hover:bg-white/5 hover:text-white disabled:opacity-25";
