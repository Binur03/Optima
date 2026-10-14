"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { SLOTS, nextSlot, slotForHour, type Macros, type Slot } from "@/lib/mealPlan";
import type { PlannedMeal } from "@/lib/gemini";
import { refreshFood } from "@/lib/useMeals";

interface PlanResponse {
  slot: Slot;
  remaining: Macros;
  budget: Macros;
  closesDay: boolean;
  options: PlannedMeal[];
  done: boolean;
}

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "request_failed");
  return json as T;
}

const ERRORS: Record<string, string> = {
  ai_busy: "The AI is busy right now. Give it a few seconds and try again.",
  no_target: "Set your daily calorie target first (Today → sliders button), then come back.",
};

export default function PlanPage() {
  const qc = useQueryClient();
  const [slot, setSlot] = useState<Slot>(() => slotForHour(new Date().getHours()));
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [seen, setSeen] = useState<string[]>([]); // shown this session → never repeated
  const [logged, setLogged] = useState<{ name: string; slot: Slot } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const suggest = useMutation({
    mutationFn: (v: { slot: Slot; exclude: string[] }) => send<PlanResponse>("/api/plan/suggest", "POST", v),
    onSuccess: (res) => {
      setPlan(res);
      setSeen((s) => [...s, ...res.options.map((o) => o.name)]);
    },
  });

  const eat = useMutation({
    mutationFn: (m: PlannedMeal) =>
      send("/api/food/log", "POST", {
        foodName: m.name,
        calories: m.calories,
        proteinG: m.protein,
        carbsG: m.carbs,
        fatG: m.fat,
        source: "TEXT_SEARCH",
        aiEstimated: true,
      }),
    onSuccess: (_r, m) => {
      refreshFood(qc);
      const eatenSlot = plan?.slot ?? slot;
      setLogged({ name: m.name, slot: eatenSlot });
      // Move on to the next meal and plan it from what's left now.
      const next = nextSlot(eatenSlot);
      setPlan(null);
      if (next) {
        setSlot(next);
        suggest.mutate({ slot: next, exclude: seen });
      }
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  });

  function pickSlot(s: Slot) {
    setSlot(s);
    setPlan(null);
    suggest.reset();
  }

  const dayDone = logged?.slot === "dinner" && !plan;
  const slotMeta = SLOTS.find((s) => s.key === slot)!;

  return (
    <main className="flex flex-col gap-5 pb-4">
      <div ref={top} />
      <Link href="/dashboard" className="-ml-1 inline-flex w-fit items-center gap-1 py-1 text-sm font-semibold text-emerald-400">
        <span aria-hidden className="text-lg leading-none">‹</span> Today
      </Link>
      <header>
        <h1 className="m-0 text-3xl font-semibold tracking-tight text-white">Meal Planner</h1>
        <p className="m-0 mt-1 text-sm text-neutral-400">Meals from what you have, sized to what you have left.</p>
      </header>

      <Pantry />

      {/* Which meal are we planning? Defaults to the time of day. */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/5" role="radiogroup" aria-label="Meal">
        {SLOTS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={slot === s.key}
            onClick={() => pickSlot(s.key)}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition ${
              slot === s.key ? "bg-white text-zinc-950" : "text-neutral-400 hover:text-white"
            }`}
          >
            <span aria-hidden>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {logged && (
          <motion.p
            key={logged.name}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            className="m-0 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
          >
            ✓ Logged <strong className="font-semibold">{logged.name}</strong> for {logged.slot}.
            {logged.slot !== "dinner" && " Planning your next meal from what’s left…"}
          </motion.p>
        )}
      </AnimatePresence>

      {dayDone ? (
        <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6 text-center">
          <p className="m-0 text-3xl" aria-hidden>🎯</p>
          <h2 className="m-0 mt-2 text-lg font-semibold text-white">Today’s macros are planned</h2>
          <p className="m-0 mt-1 text-sm text-neutral-400">Dinner used everything that was left. See how the day landed on Today.</p>
          <Link href="/dashboard" className="mt-4 inline-block rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950">
            View Today
          </Link>
        </section>
      ) : suggest.isPending ? (
        <section className="flex flex-col gap-3" aria-busy="true" aria-label="Planning">
          <p className="m-0 text-center text-sm text-neutral-400">Planning {slotMeta.label.toLowerCase()} from your pantry…</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl bg-white/5" />
          ))}
        </section>
      ) : plan ? (
        plan.done ? (
          <section className="rounded-3xl border border-white/5 bg-neutral-900 p-6 text-center">
            <h2 className="m-0 text-lg font-semibold text-white">Nothing left to plan</h2>
            <p className="m-0 mt-1 text-sm text-neutral-400">
              Only {plan.remaining.calories} kcal remain today, too little for a full {slotMeta.label.toLowerCase()}.
            </p>
          </section>
        ) : (
          <section className="flex flex-col gap-3" aria-label={`${slotMeta.label} options`}>
            <BudgetBar plan={plan} />
            {plan.options.map((o) => (
              <OptionCard key={o.name} option={o} budget={plan.budget} onEat={() => eat.mutate(o)} busy={eat.isPending} />
            ))}
            {eat.isError && <p role="alert" className="m-0 text-xs text-rose-400">Couldn’t log that meal. Try again.</p>}
            <button
              type="button"
              onClick={() => suggest.mutate({ slot: plan.slot, exclude: seen })}
              className="rounded-2xl py-3 text-sm font-semibold text-neutral-300 ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.03] hover:text-white"
            >
              ↻ Show different options
            </button>
          </section>
        )
      ) : (
        <section className="rounded-3xl border border-white/5 bg-neutral-900 p-6 text-center">
          <p className="m-0 text-3xl" aria-hidden>{slotMeta.icon}</p>
          <h2 className="m-0 mt-2 text-lg font-semibold text-white">What should I have for {slotMeta.label.toLowerCase()}?</h2>
          <p className="m-0 mt-1 text-sm text-neutral-400">
            {slot === "dinner"
              ? "Dinner uses everything you have left today."
              : `${slotMeta.label} gets its share of what's left, saving room for later meals.`}
          </p>
          {suggest.isError && (
            <p role="alert" className="m-0 mt-3 text-sm text-rose-400">{ERRORS[suggest.error.message] ?? "Couldn’t plan that. Try again."}</p>
          )}
          <button
            type="button"
            onClick={() => suggest.mutate({ slot, exclude: seen })}
            className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            Suggest {slotMeta.label.toLowerCase()}
          </button>
        </section>
      )}
    </main>
  );
}

function BudgetBar({ plan }: { plan: PlanResponse }) {
  const b = plan.budget;
  return (
    <div className="rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-inset ring-white/5">
      <p className="m-0 text-xs font-medium text-neutral-500">
        {plan.closesDay ? "Dinner budget · everything left today" : `This meal’s share of the ${plan.remaining.calories.toLocaleString()} kcal left`}
      </p>
      <p className="m-0 mt-1 text-sm font-semibold tabular-nums text-white">
        {b.calories.toLocaleString()} kcal · <span className="text-emerald-400">P {b.protein}</span> ·{" "}
        <span className="text-amber-400">C {b.carbs}</span> · <span className="text-rose-400">F {b.fat}</span>
      </p>
    </div>
  );
}

function OptionCard({ option: o, budget, onEat, busy }: { option: PlannedMeal; budget: Macros; onEat: () => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const off = budget.calories ? Math.round(((o.calories - budget.calories) / budget.calories) * 100) : 0;
  const have = o.ingredients.filter((i) => i.fromPantry);
  const need = o.ingredients.filter((i) => !i.fromPantry);

  return (
    <article className="rounded-3xl border border-white/5 bg-neutral-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 text-base font-semibold text-white">{o.name}</h3>
          <p className="m-0 mt-0.5 text-sm text-neutral-400">{o.summary}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-neutral-300">{o.prepMinutes} min</span>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
        <span className="font-semibold text-white">{o.calories.toLocaleString()} kcal</span>
        <span className={`text-xs ${Math.abs(off) <= 10 ? "text-emerald-400" : "text-amber-300"}`}>
          {off === 0 ? "on target" : `${off > 0 ? "+" : ""}${off}% vs budget`}
        </span>
        <span className="text-emerald-400">P {o.protein}</span>
        <span className="text-amber-400">C {o.carbs}</span>
        <span className="text-rose-400">F {o.fat}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {have.map((i) => (
          <span key={i.item} className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            ✓ {i.amount} {i.item}
          </span>
        ))}
        {need.map((i) => (
          <span key={i.item} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-neutral-400">
            {i.amount} {i.item}
          </span>
        ))}
      </div>
      {need.length > 0 && <p className="m-0 mt-1.5 text-[11px] text-neutral-600">Grey items aren’t in your pantry list.</p>}

      {open && (
        <ol className="m-0 mt-3 flex flex-col gap-1.5 pl-5 text-sm text-neutral-300">
          {o.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={onEat}
          disabled={busy}
          className="rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {busy ? "Logging…" : "Eat this"}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-xl px-4 text-sm font-semibold text-neutral-300 ring-1 ring-inset ring-white/10 hover:bg-white/5"
        >
          {open ? "Hide steps" : "How to make"}
        </button>
      </div>
    </article>
  );
}

// Ingredients on hand. Type several at once: "eggs, rice, spinach".
function Pantry() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["pantry"],
    queryFn: () => send<{ items: { id: string; name: string }[] }>("/api/pantry", "GET").then((r) => r.items),
  });
  const items = data ?? [];
  useEffect(() => {
    if (data && data.length === 0) setOpen(true); // first visit: start with the list open
  }, [data]);

  const add = useMutation({
    mutationFn: (names: string[]) => send("/api/pantry", "POST", { names }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["pantry"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => send(`/api/pantry/${id}`, "DELETE"),
    onMutate: (id) => {
      const prev = qc.getQueryData<{ id: string; name: string }[]>(["pantry"]);
      qc.setQueryData(["pantry"], prev?.filter((p) => p.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(["pantry"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["pantry"] }),
  });

  const submit = () => {
    const names = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (names.length) add.mutate(names);
  };

  return (
    <section className="rounded-3xl border border-white/5 bg-neutral-900 p-4" aria-label="Your ingredients">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-lg" aria-hidden>
          🧺
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-white">Your ingredients</span>
          <span className="block truncate text-xs text-neutral-500">
            {items.length ? items.map((i) => i.name).join(", ") : "Add what’s in your fridge and cupboard"}
          </span>
        </span>
        <span className="text-xs font-semibold text-neutral-400">{open ? "Done" : "Edit"}</span>
      </button>

      {open && (
        <div className="mt-3">
          {items.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {items.map((i) => (
                <span key={i.id} className="flex items-center gap-1 rounded-full bg-white/[0.06] py-1 pl-3 pr-1 text-xs font-medium text-neutral-200">
                  {i.name}
                  <button
                    type="button"
                    onClick={() => remove.mutate(i.id)}
                    aria-label={`Remove ${i.name}`}
                    className="grid h-6 w-6 place-items-center rounded-full text-neutral-500 hover:bg-white/10 hover:text-rose-300"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. chicken, rice, eggs, spinach"
              aria-label="Add ingredients, separated by commas"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-amber-400/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={add.isPending || !text.trim()}
              className="rounded-xl bg-amber-400 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:bg-white/10 disabled:text-neutral-500"
            >
              Add
            </button>
          </form>
          <p className="m-0 mt-1.5 text-[11px] text-neutral-600">Separate with commas. Salt, pepper, oil and spices are assumed.</p>
        </div>
      )}
    </section>
  );
}
