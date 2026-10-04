"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MealGroups, type MealItem } from "@/components/MealGroups";
import { StepperField } from "@/components/StepperField";
import { localKey } from "@/components/MonthCalendar";
import { refreshFood, useCopyMeal, useMeals } from "@/lib/useMeals";

interface Suggestion {
  food: string;
  why: string;
}

interface AssistantResponse {
  remaining?: { calories: number; protein: number; carbs: number; fat: number };
  macroTarget?: { protein: number; carbs: number; fat: number };
  suggestions?: Suggestion[];
  error?: string;
  message?: string;
}

type EditForm = { foodName: string; calories: string; proteinG: string; carbsG: string; fatG: string };

export default function DiaryPage() {
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0); // days before today
  const day = new Date();
  day.setDate(day.getDate() - offset);
  const isToday = offset === 0;
  const { data: meals, isLoading } = useMeals(isToday ? null : localKey(day));
  const copy = useCopyMeal();
  const [copied, setCopied] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/food/log/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete_failed");
    },
    onSuccess: () => refreshFood(qc),
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>({ foodName: "", calories: "", proteinG: "", carbsG: "", fatG: "" });

  const save = useMutation({
    mutationFn: async (arg: { id: string; body: EditForm }) => {
      const r = await fetch(`/api/food/log/${arg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodName: arg.body.foodName,
          calories: Number(arg.body.calories) || 0,
          proteinG: Number(arg.body.proteinG) || 0,
          carbsG: Number(arg.body.carbsG) || 0,
          fatG: Number(arg.body.fatG) || 0,
        }),
      });
      if (!r.ok) throw new Error("save_failed");
    },
    onSuccess: () => {
      setEditId(null);
      refreshFood(qc);
    },
  });

  const assist = useMutation({
    mutationFn: async (): Promise<AssistantResponse> => {
      const r = await fetch("/api/assistant/suggest");
      return r.json();
    },
  });

  function startEdit(m: MealItem) {
    setEditId(m.id);
    setForm({
      foodName: m.foodName,
      calories: String(m.calories),
      proteinG: String(Math.round(m.proteinG)),
      carbsG: String(Math.round(m.carbsG)),
      fatG: String(Math.round(m.fatG)),
    });
  }

  // An edit left open belongs to the day it was opened on.
  function changeDay(by: number) {
    setEditId(null);
    setOffset((o) => Math.max(0, o + by));
  }

  function copyToToday(m: MealItem) {
    copy.mutate(m, {
      onSuccess: () => {
        setCopied(m.foodName);
        setTimeout(() => setCopied(null), 2200);
      },
    });
  }

  const list = meals ?? [];
  const totals = list.reduce(
    (a, m) => ({ cals: a.cals + m.calories, p: a.p + m.proteinG, c: a.c + m.carbsG, f: a.f + m.fatG }),
    { cals: 0, p: 0, c: 0, f: 0 }
  );
  const a = assist.data;
  const dayLabel = isToday
    ? "Today"
    : offset === 1
      ? "Yesterday"
      : day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <main className="flex flex-col gap-4 pb-4">
      <Link href="/dashboard" className="-ml-1 inline-flex w-fit items-center gap-1 py-1 text-sm font-semibold text-emerald-400">
        <span aria-hidden className="text-lg leading-none">‹</span> Today
      </Link>

      <header>
        <h1 className="m-0 text-3xl font-semibold tracking-tight text-white">Diary</h1>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-neutral-900 p-1.5 ring-1 ring-inset ring-white/5">
          <button type="button" onClick={() => changeDay(1)} aria-label="Previous day" className={ARROW}>
            ‹
          </button>
          <div className="text-center">
            <p className="m-0 text-sm font-semibold text-white">{dayLabel}</p>
            <p className="m-0 text-[11px] tabular-nums text-neutral-500">
              {totals.cals.toLocaleString()} kcal ·{" "}
              <span className="text-emerald-400/90">P {Math.round(totals.p)}</span> ·{" "}
              <span className="text-amber-400/90">C {Math.round(totals.c)}</span> ·{" "}
              <span className="text-rose-400/90">F {Math.round(totals.f)}</span>
            </p>
          </div>
          <button type="button" onClick={() => changeDay(-1)} disabled={isToday} aria-label="Next day" className={ARROW}>
            ›
          </button>
        </div>
      </header>

      {copied && (
        <p role="status" className="m-0 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
          ✓ {copied} {isToday ? "logged again" : "copied to today"}
        </p>
      )}
      {copy.isError && <p role="alert" className="m-0 text-xs text-rose-400">Couldn’t copy that meal — try again.</p>}

      {isLoading ? (
        <div className="flex animate-pulse flex-col gap-2">
          <div className="h-16 rounded-2xl bg-white/5" />
          <div className="h-16 rounded-2xl bg-white/5" />
        </div>
      ) : list.length === 0 ? (
        <p className="m-0 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-neutral-500">
          Nothing logged {isToday ? "yet today" : `on ${dayLabel}`}.
        </p>
      ) : (
        <>
          <MealGroups
            meals={list}
            copyLabel={isToday ? "Log again" : "Copy to today"}
            onCopy={copyToToday}
            copying={copy.isPending}
            renderActions={(m) => (
              <>
                <button type="button" onClick={() => startEdit(m)} aria-label={`Edit ${m.foodName}`} className={ICON_BTN}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => window.confirm(`Delete ${m.foodName}?`) && del.mutate(m.id)}
                  disabled={del.isPending}
                  aria-label={`Delete ${m.foodName}`}
                  className={`${ICON_BTN} hover:text-rose-300`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
                  </svg>
                </button>
              </>
            )}
            renderEditor={(m) =>
              editId === m.id ? (
                <div className="flex flex-col gap-3 p-4">
                  <input
                    value={form.foodName}
                    onChange={(e) => setForm({ ...form, foodName: e.target.value })}
                    maxLength={120}
                    aria-label="Food name"
                    className="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["calories", "kcal", 10, "text-white"],
                        ["proteinG", "Protein g", 1, "text-emerald-400"],
                        ["carbsG", "Carbs g", 1, "text-amber-400"],
                        ["fatG", "Fat g", 1, "text-rose-400"],
                      ] as const
                    ).map(([key, label, step, tint]) => (
                      <label key={key} className="block">
                        <span className={`text-[11px] font-semibold ${tint}`}>{label}</span>
                        <StepperField
                          label={label}
                          value={form[key]}
                          onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                          step={step}
                          max={key === "calories" ? 10000 : 1000}
                          className="mt-1"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditId(null)}
                      disabled={save.isPending}
                      className="rounded-xl py-2.5 text-sm font-medium text-neutral-300 ring-1 ring-inset ring-white/10 transition hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => save.mutate({ id: m.id, body: form })}
                      disabled={save.isPending || form.foodName.trim().length === 0}
                      className="rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {save.isPending ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : null
            }
          />
          <p className="m-0 text-center text-[11px] text-neutral-600">
            Tap a meal to expand · swipe an item right to {isToday ? "log it again" : "copy it to today"}
          </p>
        </>
      )}

      {isToday && (
        <section className="rounded-3xl border border-white/5 bg-gradient-to-br from-emerald-500/[0.08] via-neutral-900/80 to-neutral-900/80 p-5">
          <h2 className="m-0 text-sm font-semibold text-white">Macro Assistant</h2>
          <p className="m-0 mt-1 text-xs text-neutral-500">Meal ideas that fit what you have left today.</p>
          <button
            type="button"
            onClick={() => assist.mutate()}
            disabled={assist.isPending}
            className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {assist.isPending ? "Thinking…" : "Suggest meals for my remaining macros"}
          </button>

          {a?.error === "no_target" && <p className="m-0 mt-3 text-sm text-neutral-400">{a.message}</p>}
          {a?.remaining && (
            <div className="mt-4">
              <p className="m-0 text-sm text-neutral-300">
                Remaining: <strong className="text-white">{a.remaining.calories.toLocaleString()} kcal</strong> ·{" "}
                <span className="text-emerald-400">P {a.remaining.protein}</span> ·{" "}
                <span className="text-amber-400">C {a.remaining.carbs}</span> ·{" "}
                <span className="text-rose-400">F {a.remaining.fat}</span>
              </p>
              {a.suggestions && a.suggestions.length > 0 && (
                <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                  {a.suggestions.map((s, i) => (
                    <li key={i} className="rounded-xl bg-white/[0.03] p-3">
                      <strong className="block text-sm text-white">{s.food}</strong>
                      <span className="block text-xs text-neutral-400">{s.why}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {assist.isError && (
            <p role="alert" className="m-0 mt-2 text-xs text-rose-400">
              Couldn’t get suggestions — try again.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

const ARROW =
  "grid h-10 w-10 place-items-center rounded-xl text-xl text-neutral-400 transition hover:bg-white/5 hover:text-white disabled:opacity-25";
const ICON_BTN =
  "grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-500 transition hover:bg-white/5 hover:text-white disabled:opacity-40";
