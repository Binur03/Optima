"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ActivityRing } from "@/components/ActivityRing";
import { StepperField } from "@/components/StepperField";
import { UnitToggle } from "@/components/UnitToggle";
import { formatDay } from "@/components/charts/GlassTooltip";
import { PROGRESS_KEY } from "@/lib/useProgress";
import { SUPPS_KEY, useSupps, type SuppItem, type SuppsState } from "@/lib/useSupps";
import { useUnits } from "@/lib/useUnits";
import { displayToMl, formatWater, waterNumber, waterUnit } from "@/lib/units";
import { TIMES, WATER_GOALS, WATER_QUICK, currentTime, waterPaceTarget, type TimeOfDay } from "@/lib/supplements";

const WATER_RING = { from: "#67e8f9", to: "#06b6d4" }; // cyan

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "request_failed");
  return json as Record<string, unknown>;
}

export default function SupplementsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useSupps();
  const { units } = useUnits();
  const [hour, setHour] = useState(() => new Date().getHours() + new Date().getMinutes() / 60);
  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours() + new Date().getMinutes() / 60), 60_000);
    return () => clearInterval(t);
  }, []);

  // Apply a change to the cached state immediately; roll back if the save fails.
  function optimistic<V>(fn: (s: SuppsState, v: V) => SuppsState) {
    return {
      onMutate: async (v: V) => {
        await qc.cancelQueries({ queryKey: SUPPS_KEY });
        const prev = qc.getQueryData<SuppsState>(SUPPS_KEY);
        if (prev) qc.setQueryData(SUPPS_KEY, fn(prev, v));
        return { prev };
      },
      onError: (_e: unknown, _v: V, ctx?: { prev?: SuppsState }) => ctx?.prev && qc.setQueryData(SUPPS_KEY, ctx.prev),
      onSettled: () => {
        qc.invalidateQueries({ queryKey: SUPPS_KEY });
        qc.invalidateQueries({ queryKey: PROGRESS_KEY }, { cancelRefetch: false });
      },
    };
  }

  const addWater = useMutation({
    mutationFn: (ml: number) => send("/api/water", "POST", { amountMl: ml }),
    ...optimistic<number>((s, ml) => ({
      ...s,
      waterMl: s.waterMl + ml,
      waterEntries: [...s.waterEntries, { id: `tmp-${Date.now()}`, amountMl: ml, createdAt: new Date().toISOString() }],
    })),
  });
  const undoWater = useMutation({
    mutationFn: (id: string) => send(`/api/water/${id}`, "DELETE"),
    ...optimistic<string>((s, id) => {
      const gone = s.waterEntries.find((e) => e.id === id);
      return { ...s, waterMl: s.waterMl - (gone?.amountMl ?? 0), waterEntries: s.waterEntries.filter((e) => e.id !== id) };
    }),
  });
  const setGoal = useMutation({
    mutationFn: (goalMl: number) => send("/api/water", "PATCH", { goalMl }),
    ...optimistic<number>((s, goalMl) => ({ ...s, waterGoalMl: goalMl })),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; taken: boolean }) => send(`/api/supplements/${v.id}`, "PATCH", { taken: v.taken }),
    ...optimistic<{ id: string; taken: boolean }>((s, v) => ({
      ...s,
      supplements: s.supplements.map((x) =>
        x.id === v.id
          ? { ...x, takenAt: v.taken ? new Date().toISOString() : null, week: [...x.week.slice(0, 6), v.taken] }
          : x
      ),
    })),
  });

  if (isLoading) {
    return (
      <div className="flex animate-pulse flex-col gap-4" aria-busy="true">
        <div className="h-9 w-40 rounded-lg bg-white/5" />
        <div className="h-56 rounded-3xl bg-white/5" />
        <div className="h-40 rounded-3xl bg-white/5" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p role="alert" className="mt-24 rounded-3xl border border-white/5 bg-neutral-900 p-6 text-center text-sm text-neutral-400">
        Couldn’t load your supplements. Pull to retry.
      </p>
    );
  }

  return (
    <main className="flex flex-col gap-5 pb-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-medium text-neutral-500">{formatDay(data.today)}</p>
          <h1 className="m-0 text-3xl font-semibold tracking-tight text-white">Supps &amp; Water</h1>
        </div>
        <UnitToggle labels={["oz", "ml"]} />
      </header>

      <WaterCard
        data={data}
        hour={hour}
        units={units}
        onAdd={(ml) => addWater.mutate(ml)}
        onUndo={(id) => undoWater.mutate(id)}
        onGoal={(ml) => setGoal.mutate(ml)}
        busy={addWater.isPending}
        error={addWater.isError || undoWater.isError || setGoal.isError}
      />

      <SupplementsCard
        data={data}
        now={currentTime(Math.floor(hour))}
        onToggle={(id, taken) => toggle.mutate({ id, taken })}
        toggleError={toggle.isError}
      />
    </main>
  );
}

function WaterCard({
  data,
  hour,
  units,
  onAdd,
  onUndo,
  onGoal,
  busy,
  error,
}: {
  data: SuppsState;
  hour: number;
  units: "imperial" | "metric";
  onAdd: (ml: number) => void;
  onUndo: (id: string) => void;
  onGoal: (ml: number) => void;
  busy: boolean;
  error: boolean;
}) {
  const [custom, setCustom] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const { waterMl, waterGoalMl } = data;
  const left = Math.max(0, waterGoalMl - waterMl);
  const pace = waterPaceTarget(waterGoalMl, hour);
  const behind = pace - waterMl;
  const done = waterMl >= waterGoalMl;
  const last = data.waterEntries[data.waterEntries.length - 1];
  const goalPreset = WATER_GOALS[units].find((g) => Math.abs(g.ml - waterGoalMl) < 30);

  return (
    <section className="rounded-3xl border border-white/5 bg-neutral-900 p-5" aria-label="Water">
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <ActivityRing rings={[{ label: "Water", value: waterMl, goal: waterGoalMl, ...WATER_RING }]} size={124} stroke={14} />
          <div className="absolute inset-0 grid place-items-center text-center">
            <span>
              <span className="block text-2xl font-bold tabular-nums leading-none text-white">{waterNumber(waterMl, units).toLocaleString()}</span>
              <span className="block text-[11px] text-neutral-500">of {formatWater(waterGoalMl, units)}</span>
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs font-semibold text-cyan-400">Water{done && " ✓"}</p>
          <p className="m-0 mt-0.5 text-lg font-semibold text-white">
            {done ? "Goal hit 💧" : `${formatWater(left, units)} to go`}
          </p>
          {!done && (
            <p className={`m-0 mt-1 text-xs ${behind > 120 ? "text-amber-300" : "text-emerald-400"}`}>
              {hour < 7
                ? "Start with a glass when you wake up"
                : behind > 120
                  ? `${formatWater(behind, units)} behind pace`
                  : "On pace"}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setGoalInput(String(waterNumber(waterGoalMl, units)));
              setEditingGoal((v) => !v);
            }}
            className="mt-2 text-xs font-semibold text-neutral-400 underline-offset-2 hover:text-white hover:underline"
          >
            Goal: {goalPreset?.label ?? formatWater(waterGoalMl, units)} · Change
          </button>
        </div>
      </div>

      {editingGoal && (
        <div className="mt-4 rounded-2xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
          <div className="flex flex-wrap gap-2">
            {WATER_GOALS[units].map((g) => (
              <button
                key={g.label}
                type="button"
                onClick={() => {
                  onGoal(g.ml);
                  setEditingGoal(false);
                }}
                aria-pressed={goalPreset?.label === g.label}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  goalPreset?.label === g.label ? "bg-cyan-400 text-zinc-950" : "bg-white/[0.06] text-neutral-300 hover:text-white"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <StepperField
              label={`Custom goal in ${waterUnit(units)}`}
              value={goalInput}
              onChange={setGoalInput}
              step={units === "imperial" ? 8 : 250}
              min={units === "imperial" ? 17 : 500}
              max={units === "imperial" ? 338 : 10000}
              className="flex-1"
            />
            <span className="text-xs text-neutral-500">{waterUnit(units)}</span>
            <button
              type="button"
              onClick={() => {
                const v = Number(goalInput);
                if (v > 0) {
                  onGoal(displayToMl(v, units));
                  setEditingGoal(false);
                }
              }}
              className="rounded-xl bg-white/[0.08] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-white/15"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-2">
        {WATER_QUICK[units].map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => onAdd(q.ml)}
            disabled={busy}
            className="flex flex-col items-center rounded-2xl bg-cyan-400/10 py-3 ring-1 ring-inset ring-cyan-400/25 transition hover:bg-cyan-400/20 active:scale-[0.97] disabled:opacity-60"
          >
            <span className="text-sm font-bold tabular-nums text-cyan-200">{q.label}</span>
            <span className="text-[11px] text-neutral-500">{q.sub}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <StepperField
          label={`Custom amount in ${waterUnit(units)}`}
          value={custom}
          placeholder={units === "imperial" ? "12" : "330"}
          onChange={setCustom}
          step={units === "imperial" ? 4 : 50}
          min={1}
          max={units === "imperial" ? 160 : 5000}
          className="flex-1"
        />
        <span className="text-xs text-neutral-500">{waterUnit(units)}</span>
        <button
          type="button"
          disabled={busy || !(Number(custom || (units === "imperial" ? 12 : 330)) > 0)}
          onClick={() => {
            onAdd(displayToMl(Number(custom || (units === "imperial" ? 12 : 330)), units));
            setCustom("");
          }}
          className="rounded-xl bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {last && (
        <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
          <span>
            {data.waterEntries.length} {data.waterEntries.length === 1 ? "drink" : "drinks"} today · last at{" "}
            {new Date(last.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
          <button
            type="button"
            onClick={() => onUndo(last.id)}
            disabled={last.id.startsWith("tmp-")}
            className="rounded-lg px-2 py-1 font-semibold text-neutral-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            ↶ Undo {formatWater(last.amountMl, units)}
          </button>
        </div>
      )}
      {error && <p role="alert" className="m-0 mt-2 text-xs text-rose-400">Couldn’t save that — check your connection and try again.</p>}
    </section>
  );
}

function SupplementsCard({
  data,
  now,
  onToggle,
  toggleError,
}: {
  data: SuppsState;
  now: TimeOfDay;
  onToggle: (id: string, taken: boolean) => void;
  toggleError: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const taken = data.supplements.filter((s) => s.takenAt).length;
  const groups = TIMES.map((t) => ({ ...t, items: data.supplements.filter((s) => s.timeOfDay === t.key) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <section className="rounded-3xl border border-white/5 bg-neutral-900 p-5" aria-label="Supplements">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-semibold text-white">Supplements</h2>
          <p className="m-0 text-xs text-neutral-500">
            {data.supplements.length === 0 ? "Add what you take and when" : `${taken} of ${data.supplements.length} taken today`}
          </p>
        </div>
        {data.supplements.length > 0 && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            aria-pressed={editing}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              editing ? "bg-white text-zinc-950" : "bg-white/[0.06] text-neutral-300 hover:text-white"
            }`}
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="m-0 mb-1.5 flex items-center gap-2 text-xs font-semibold text-neutral-400">
              <span aria-hidden>{g.icon}</span> {g.label}
              {g.key === now && g.items.some((i) => !i.takenAt) && (
                <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">Due now</span>
              )}
            </p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {g.items.map((s) =>
                editing ? <EditRow key={s.id} item={s} /> : <TakeRow key={s.id} item={s} days={data.days} onToggle={onToggle} />
              )}
            </ul>
          </div>
        ))}
      </div>
      {toggleError && <p role="alert" className="m-0 mt-2 text-xs text-rose-400">Couldn’t save that — try again.</p>}

      {(editing || data.supplements.length === 0) && <AddSupplement />}
    </section>
  );
}

function TakeRow({ item, days, onToggle }: { item: SuppItem; days: string[]; onToggle: (id: string, taken: boolean) => void }) {
  const taken = !!item.takenAt;
  const streak = item.week.filter(Boolean).length;
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(item.id, !taken)}
        aria-pressed={taken}
        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left ring-1 ring-inset transition active:scale-[0.99] ${
          taken ? "bg-emerald-500/[0.07] ring-emerald-500/20" : "bg-white/[0.03] ring-white/5 hover:ring-white/15"
        }`}
      >
        <span className="relative grid h-7 w-7 shrink-0 place-items-center" aria-hidden>
          <span className="absolute inset-0 rounded-full ring-2 ring-inset ring-white/15" />
          <motion.span
            className="absolute inset-0 rounded-full bg-emerald-400"
            initial={false}
            animate={{ scale: taken ? 1 : 0, opacity: taken ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 20 }}
          />
          <svg viewBox="0 0 24 24" className="relative h-4 w-4" fill="none">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="#09090b"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: taken ? 1 : 0, opacity: taken ? 1 : 0 }}
              transition={{ duration: 0.25 }}
            />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[15px] font-semibold ${taken ? "text-neutral-300" : "text-white"}`}>
            {item.name}
            {item.dose && <span className="font-normal text-neutral-500"> · {item.dose}</span>}
          </span>
          <span className="block text-xs text-neutral-500">
            {taken
              ? `Taken at ${new Date(item.takenAt!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : "Tap when you take it"}
          </span>
        </span>
        {/* Last 7 days, oldest first — today is the right-most dot. */}
        <span className="flex shrink-0 flex-col items-end gap-1" aria-label={`Taken ${streak} of the last 7 days`}>
          <span className="flex gap-1">
            {item.week.map((d, i) => (
              <span
                key={days[i]}
                className={`h-1.5 w-1.5 rounded-full ${d ? "bg-emerald-400" : "bg-white/15"} ${i === 6 ? "ring-1 ring-white/40 ring-offset-1 ring-offset-neutral-900" : ""}`}
              />
            ))}
          </span>
          <span className="text-[10px] tabular-nums text-neutral-500">{streak}/7</span>
        </span>
      </button>
    </li>
  );
}

function EditRow({ item }: { item: SuppItem }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: SUPPS_KEY });
  const update = useMutation({ mutationFn: (v: Record<string, unknown>) => send(`/api/supplements/${item.id}`, "PATCH", v), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => send(`/api/supplements/${item.id}`, "DELETE"), onSuccess: refresh });
  const [dose, setDose] = useState(item.dose ?? "");

  return (
    <li className="rounded-2xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">{item.name}</span>
        <button
          type="button"
          onClick={() => window.confirm(`Remove ${item.name} and its history?`) && remove.mutate()}
          disabled={remove.isPending}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
        >
          Remove
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`When you take ${item.name}`}>
        {TIMES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={item.timeOfDay === t.key}
            onClick={() => update.mutate({ timeOfDay: t.key })}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              item.timeOfDay === t.key ? "bg-white text-zinc-950" : "bg-white/[0.06] text-neutral-400 hover:text-white"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ dose });
        }}
      >
        <input
          value={dose}
          onChange={(e) => setDose(e.target.value)}
          placeholder="Dose, e.g. 400 mg"
          maxLength={40}
          aria-label={`${item.name} dose`}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500/50 focus:outline-none"
        />
        <button type="submit" disabled={update.isPending || dose === (item.dose ?? "")} className="rounded-xl bg-white/[0.08] px-3 text-xs font-semibold text-white disabled:opacity-40">
          Save
        </button>
      </form>
    </li>
  );
}

function AddSupplement() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [time, setTime] = useState<TimeOfDay>("morning");
  const add = useMutation({
    mutationFn: () => send("/api/supplements", "POST", { name: name.trim(), dose, timeOfDay: time }),
    onSuccess: () => {
      setName("");
      setDose("");
      qc.invalidateQueries({ queryKey: SUPPS_KEY });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length >= 2) add.mutate();
      }}
      className="mt-4 rounded-2xl border border-dashed border-white/10 p-3"
    >
      <p className="m-0 mb-2 text-xs font-semibold text-neutral-400">Add a supplement</p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Creatine"
          maxLength={60}
          aria-label="Supplement name"
          className="min-w-0 flex-[3] rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500/50 focus:outline-none"
        />
        <input
          value={dose}
          onChange={(e) => setDose(e.target.value)}
          placeholder="Dose"
          maxLength={40}
          aria-label="Dose (optional)"
          className="min-w-0 flex-[2] rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500/50 focus:outline-none"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="When you take it">
        {TIMES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={time === t.key}
            onClick={() => setTime(t.key)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              time === t.key ? "bg-white text-zinc-950" : "bg-white/[0.06] text-neutral-400 hover:text-white"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {add.isError && (
        <p role="alert" className="m-0 mt-2 text-xs text-rose-400">
          {add.error.message === "supplement_exists" ? "That’s already on your list." : "Couldn’t add it — try again."}
        </p>
      )}
      <button
        type="submit"
        disabled={add.isPending || name.trim().length < 2}
        className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:bg-white/10 disabled:text-neutral-500"
      >
        {add.isPending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
