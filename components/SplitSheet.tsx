"use client";

import { useEffect, useState } from "react";
import { SPLIT_PRESETS, type SplitPreset } from "@/lib/lifts";

interface Props {
  open: boolean;
  existing: string[]; // current split names, to flag duplicates
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (split: { name: string; exercises: string[] }) => void;
}

// Bottom sheet for adding a split: name it yourself or start from a preset,
// then trim the preset's exercises before creating it.
export function SplitSheet({ open, existing, busy, error, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [exercises, setExercises] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setExercises([]);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const taken = existing.map((n) => n.toLowerCase());
  const trimmed = name.trim();
  const duplicate = taken.includes(trimmed.toLowerCase());
  const pick = (p: SplitPreset) => {
    setName(p.name);
    setExercises(p.exercises);
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="New split">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-[480px] animate-sheet-up overflow-y-auto rounded-t-3xl border-t border-white/10 bg-neutral-900 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <h2 className="m-0 text-lg font-semibold text-white">New split</h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed.length >= 2 && !duplicate) onCreate({ name: trimmed, exercises });
          }}
        >
          <label className="mt-4 block">
            <span className="text-xs font-medium text-neutral-400">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chest & Back"
              maxLength={40}
              autoFocus
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-sky-400/50 focus:outline-none"
            />
          </label>
          {duplicate && <p className="m-0 mt-1.5 text-xs text-amber-300">You already have a split with this name.</p>}

          <p className="m-0 mb-2 mt-5 text-xs font-medium text-neutral-500">Or start from</p>
          <div className="flex flex-wrap gap-2">
            {SPLIT_PRESETS.filter((p) => !taken.includes(p.name.toLowerCase())).map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => pick(p)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  name === p.name
                    ? "bg-sky-400 text-zinc-950"
                    : "bg-white/[0.04] text-neutral-300 ring-1 ring-inset ring-white/5 hover:text-white"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {exercises.length > 0 && (
            <div className="mt-5">
              <p className="m-0 mb-2 text-xs font-medium text-neutral-500">Exercises · tap × to drop any you don’t do</p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {exercises.map((ex) => (
                  <li key={ex} className="flex items-center justify-between rounded-xl bg-white/[0.03] py-2 pl-3.5 pr-1.5 text-sm text-white">
                    {ex}
                    <button
                      type="button"
                      onClick={() => setExercises((list) => list.filter((x) => x !== ex))}
                      aria-label={`Remove ${ex}`}
                      className="grid h-7 w-7 place-items-center rounded-full text-neutral-500 transition hover:bg-white/5 hover:text-rose-300"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p role="alert" className="m-0 mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || trimmed.length < 2 || duplicate}
            className="mt-5 w-full rounded-xl bg-sky-400 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-sky-300 disabled:bg-white/10 disabled:text-neutral-500"
          >
            {busy ? "Creating…" : exercises.length > 0 ? `Create with ${exercises.length} exercises` : "Create empty split"}
          </button>
        </form>
      </div>
    </div>
  );
}
