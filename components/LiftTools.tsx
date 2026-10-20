"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { duplicatePairs } from "@/lib/exerciseNames";

export interface LiftSummary {
  id: string;
  name: string;
  kind: string;
  days: number;
  sessions: number;
}

export const LIFTS_KEY = ["lift-names"] as const;

export function useLifts() {
  return useQuery({
    queryKey: LIFTS_KEY,
    queryFn: async (): Promise<LiftSummary[]> => {
      const res = await fetch("/api/lifts/exercises");
      if (!res.ok) throw new Error("lifts_failed");
      return (await res.json()).exercises;
    },
    staleTime: 60_000,
  });
}

// Everything that shows lifts by name.
export function refreshLifts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["lift-splits"] });
  qc.invalidateQueries({ queryKey: ["lift-programs"] });
  qc.invalidateQueries({ queryKey: ["lift-insights"] });
  qc.invalidateQueries({ queryKey: LIFTS_KEY });
}

// Native suggestions under an "Add exercise" box: picking an existing lift
// reuses it (and its history) instead of creating a near-duplicate.
export function LiftDatalist({ id }: { id: string }) {
  const { data } = useLifts();
  return (
    <datalist id={id}>
      {(data ?? []).map((l) => (
        <option key={l.id} value={l.name} />
      ))}
    </datalist>
  );
}

export function useMergeLifts(onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { fromId: string; intoId: string }) => {
      const res = await fetch("/api/lifts/exercises/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error("merge_failed");
    },
    onSuccess: () => {
      refreshLifts(qc);
      onDone?.();
    },
  });
}

const DISMISS_KEY = "optima:not-duplicates";
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

// "Same lift?" — lifts whose names differ only by spelling, spacing or a
// plural. Merging keeps every set from both.
export function DuplicateBanner() {
  const { data } = useLifts();
  const merge = useMergeLifts();
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]"));
    } catch {
      /* storage unavailable — show everything */
    }
  }, []);
  const dismiss = (k: string) => {
    const next = [...dismissed, k];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* fine — just won't remember */
    }
  };

  const pairs = duplicatePairs(data ?? []).filter(([a, b]) => !dismissed.includes(pairKey(a.id, b.id)));
  if (pairs.length === 0) return null;

  return (
    <section className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] p-4" aria-label="Possible duplicate lifts">
      <p className="m-0 text-sm font-semibold text-white">Same lift under two names?</p>
      <p className="m-0 mt-0.5 text-xs text-neutral-400">
        Merging links them across every day, so your last session carries over. All sets from both are kept.
      </p>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {pairs.map(([a, b]) => {
          // Suggest keeping the one with more history.
          const [keep, other] = a.sessions >= b.sessions ? [a, b] : [b, a];
          return (
            <li key={pairKey(a.id, b.id)} className="rounded-xl bg-neutral-900 p-3 ring-1 ring-inset ring-white/5">
              <p className="m-0 text-sm text-white">
                <strong className="font-semibold">{keep.name}</strong>
                <span className="text-neutral-500"> ({keep.sessions} sessions)</span> and{" "}
                <strong className="font-semibold">{other.name}</strong>
                <span className="text-neutral-500"> ({other.sessions})</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={merge.isPending}
                  onClick={() => merge.mutate({ fromId: other.id, intoId: keep.id })}
                  className="rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-sky-300 disabled:opacity-50"
                >
                  Merge as “{keep.name}”
                </button>
                <button
                  type="button"
                  disabled={merge.isPending}
                  onClick={() => merge.mutate({ fromId: keep.id, intoId: other.id })}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-200 ring-1 ring-inset ring-white/15 hover:bg-white/5 disabled:opacity-50"
                >
                  Use “{other.name}”
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(pairKey(a.id, b.id))}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:text-white"
                >
                  Keep separate
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {merge.isError && <p role="alert" className="m-0 mt-2 text-xs text-rose-400">Couldn’t merge those. Try again.</p>}
    </section>
  );
}
