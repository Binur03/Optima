"use client";

import { useState, type ReactNode } from "react";
import { SwipeToCopy } from "./SwipeToCopy";

export interface MealItem {
  id: string;
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  aiEstimated: boolean;
  createdAt: string;
}

// Meals carry no "type" in the log, so they're grouped by the local time they
// were logged: before 11 → Breakfast, 11–5 PM → Lunch, after → Dinner.
const GROUPS = [
  { key: "breakfast", title: "Breakfast", icon: "🍳", until: 11 },
  { key: "lunch", title: "Lunch", icon: "🥗", until: 17 },
  { key: "dinner", title: "Dinner", icon: "🍽️", until: 24 },
] as const;

function groupOf(m: MealItem) {
  const hour = new Date(m.createdAt).getHours();
  return GROUPS.find((g) => hour < g.until)!.key;
}

interface Props {
  meals: MealItem[];
  copyLabel: string; // "Log again" (today) or "Copy to today" (past days)
  onCopy: (m: MealItem) => void;
  copying?: boolean;
  renderActions?: (m: MealItem) => ReactNode; // e.g. edit / delete buttons
  renderEditor?: (m: MealItem) => ReactNode | null; // replaces the row while editing
}

export function MealGroups({ meals, copyLabel, onCopy, copying, renderActions, renderEditor }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-2">
      {GROUPS.map((g) => {
        const items = meals.filter((m) => groupOf(m) === g.key);
        if (items.length === 0) return null;
        const total = items.reduce(
          (a, m) => ({ kcal: a.kcal + m.calories, p: a.p + m.proteinG, c: a.c + m.carbsG, f: a.f + m.fatG }),
          { kcal: 0, p: 0, c: 0, f: 0 }
        );
        const expanded = open[g.key] ?? false;
        return (
          <section key={g.key} className="overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-inset ring-white/5" aria-label={g.title}>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [g.key]: !expanded }))}
              aria-expanded={expanded}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-lg" aria-hidden>
                {g.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-white">{g.title}</span>
                <span className="block text-xs text-neutral-500">
                  {items.length} {items.length === 1 ? "item" : "items"} ·{" "}
                  <span className="text-emerald-400/90">P {Math.round(total.p)}</span> ·{" "}
                  <span className="text-amber-400/90">C {Math.round(total.c)}</span> ·{" "}
                  <span className="text-rose-400/90">F {Math.round(total.f)}</span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-base font-bold tabular-nums text-white">{total.kcal.toLocaleString()}</span>
                <span className="block text-[11px] text-neutral-500">kcal</span>
              </span>
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${expanded ? "rotate-180" : ""}`}
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

            {expanded && (
              <ul className="m-0 list-none border-t border-white/5 p-0">
                {items.map((m) => {
                  const editor = renderEditor?.(m);
                  return (
                    <li key={m.id} className="border-b border-white/5 last:border-b-0">
                      {editor ?? (
                        <SwipeToCopy
                          onCopy={() => onCopy(m)}
                          label={copyLabel}
                          a11yLabel={`${copyLabel}: ${m.foodName}`}
                          disabled={copying}
                          className="bg-neutral-900"
                        >
                          <div className="flex items-center gap-3 py-3 pl-4 pr-2">
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-medium text-white">{m.foodName}</span>
                                {m.aiEstimated && (
                                  <span className="shrink-0 rounded bg-white/[0.06] px-1 text-[10px] font-semibold text-neutral-400">AI</span>
                                )}
                              </span>
                              <span className="block text-xs tabular-nums text-neutral-500">
                                {m.calories.toLocaleString()} kcal · P {Math.round(m.proteinG)} · C {Math.round(m.carbsG)} · F {Math.round(m.fatG)}
                              </span>
                            </span>
                            {renderActions?.(m)}
                          </div>
                        </SwipeToCopy>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
