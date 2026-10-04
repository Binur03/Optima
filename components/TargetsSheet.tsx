"use client";

import { useEffect, useState } from "react";
import { defaultMacroTargets } from "@/lib/nutrition";
import type { Goal } from "@/lib/delta";

export interface TargetsSnapshot {
  tdee: number | null;
  goal: Goal;
  cutDelta: number;
  bulkDelta: number;
  targetIntake: number | null;
  customTarget: boolean;
  macroTargets: { protein: number; carbs: number; fat: number } | null;
  customMacros: boolean;
}

export interface TargetsChange {
  offsets: { cutDelta: number; bulkDelta: number } | null; // null → unchanged
  calories: number | null; // null → automatic
  macros: { protein: number; carbs: number; fat: number } | null; // null → automatic
}

interface Props {
  open: boolean;
  snapshot: TargetsSnapshot;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (change: TargetsChange) => void;
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

// Daily targets: calories either follow maintenance + goal offset (Auto) or
// are a number you pick; protein/carbs/fat either split that target (Auto) or
// are grams you pick.
export function TargetsSheet({ open, snapshot: s, busy, error, onClose, onSave }: Props) {
  const [calMode, setCalMode] = useState<"auto" | "custom">("auto");
  const [calories, setCalories] = useState("");
  const [cut, setCut] = useState("");
  const [bulk, setBulk] = useState("");
  const [macroMode, setMacroMode] = useState<"auto" | "custom">("auto");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  // Re-seed from the latest server values every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setCalMode(s.customTarget ? "custom" : "auto");
    setCalories(s.targetIntake != null ? String(s.targetIntake) : "");
    setCut(String(s.cutDelta));
    setBulk(String(s.bulkDelta));
    setMacroMode(s.customMacros ? "custom" : "auto");
    setProtein(s.macroTargets ? String(s.macroTargets.protein) : "");
    setCarbs(s.macroTargets ? String(s.macroTargets.carbs) : "");
    setFat(s.macroTargets ? String(s.macroTargets.fat) : "");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const cutN = Math.round(num(cut));
  const bulkN = Math.round(num(bulk));
  const autoDelta = s.goal === "CUT" ? cutN : s.goal === "BULK" ? bulkN : 0;
  const autoTarget = s.tdee != null && Number.isFinite(autoDelta) ? s.tdee + autoDelta : null;
  const calN = Math.round(num(calories));
  const calValid = Number.isFinite(calN) && calN >= 800 && calN <= 8000;
  const effective = calMode === "custom" ? (calValid ? calN : null) : autoTarget;
  const auto = effective != null ? defaultMacroTargets(effective) : null;

  const p = Math.round(num(protein));
  const c = Math.round(num(carbs));
  const f = Math.round(num(fat));
  const macrosValid = [p, c, f].every((x) => Number.isFinite(x) && x >= 0);
  const macroKcal = macrosValid ? p * 4 + c * 4 + f * 9 : null;
  const offsetsValid = Number.isFinite(cutN) && Number.isFinite(bulkN) && Math.abs(cutN) <= 2000 && Math.abs(bulkN) <= 2000;

  const canSave =
    !busy && (calMode === "auto" ? offsetsValid : calValid) && (macroMode === "auto" || macrosValid);

  function save() {
    const offsetsChanged = offsetsValid && (cutN !== s.cutDelta || bulkN !== s.bulkDelta);
    onSave({
      offsets: calMode === "auto" && offsetsChanged ? { cutDelta: cutN, bulkDelta: bulkN } : null,
      calories: calMode === "custom" ? calN : null,
      macros: macroMode === "custom" ? { protein: p, carbs: c, fat: f } : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Daily targets">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-[480px] animate-sheet-up overflow-y-auto rounded-t-3xl border-t border-white/10 bg-neutral-900 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <h2 className="m-0 text-lg font-semibold text-white">Daily targets</h2>

        {/* Calories */}
        <section className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 text-sm font-semibold text-white">Calories</h3>
            <Toggle value={calMode} onChange={setCalMode} />
          </div>

          {calMode === "custom" ? (
            <label className="mt-3 flex items-baseline gap-2 rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-inset ring-white/5 focus-within:ring-emerald-500/40">
              <input
                type="number"
                inputMode="numeric"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="2000"
                aria-label="Daily calorie target"
                className="w-full min-w-0 bg-transparent text-3xl font-semibold tabular-nums tracking-tight text-white placeholder:text-neutral-700 focus:outline-none"
              />
              <span className="shrink-0 text-sm text-neutral-400">kcal/day</span>
            </label>
          ) : (
            <div className="mt-3 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/5">
              <p className="m-0 text-sm text-neutral-400">
                Maintenance <span className="font-semibold tabular-nums text-white">{s.tdee?.toLocaleString() ?? "—"}</span>
                {s.goal !== "MAINTAIN" && Number.isFinite(autoDelta) && (
                  <> {autoDelta >= 0 ? "+" : "−"} <span className="tabular-nums">{Math.abs(autoDelta)}</span> ({s.goal === "CUT" ? "cut" : "bulk"})</>
                )}
                {" = "}
                <span className="font-semibold tabular-nums text-white">{autoTarget?.toLocaleString() ?? "—"} kcal</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-neutral-500">Cut offset</span>
                  <input type="number" step={50} value={cut} onChange={(e) => setCut(e.target.value)} className={FIELD} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-neutral-500">Bulk offset</span>
                  <input type="number" step={50} value={bulk} onChange={(e) => setBulk(e.target.value)} className={FIELD} />
                </label>
              </div>
            </div>
          )}
          {calMode === "custom" && calories !== "" && !calValid && (
            <p className="m-0 mt-1.5 text-xs text-amber-300">Pick a number between 800 and 8,000.</p>
          )}
        </section>

        {/* Macros */}
        <section className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 text-sm font-semibold text-white">Protein, carbs &amp; fat</h3>
            <Toggle
              value={macroMode}
              onChange={(m) => {
                // Switching to custom starts from the automatic split.
                if (m === "custom" && auto && !s.customMacros) {
                  setProtein(String(auto.protein));
                  setCarbs(String(auto.carbs));
                  setFat(String(auto.fat));
                }
                setMacroMode(m);
              }}
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["Protein", protein, setProtein, auto?.protein, "text-emerald-400"],
                ["Carbs", carbs, setCarbs, auto?.carbs, "text-amber-400"],
                ["Fat", fat, setFat, auto?.fat, "text-violet-400"],
              ] as const
            ).map(([label, value, set, autoValue, tint]) => (
              <label key={label} className="block rounded-2xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-inset ring-white/5 focus-within:ring-emerald-500/40">
                <span className={`text-[11px] font-semibold ${tint}`}>{label}</span>
                {macroMode === "custom" ? (
                  <span className="flex items-baseline gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      aria-label={`${label} grams`}
                      className="w-full min-w-0 bg-transparent text-xl font-semibold tabular-nums text-white focus:outline-none"
                    />
                    <span className="text-xs text-neutral-500">g</span>
                  </span>
                ) : (
                  <span className="block text-xl font-semibold tabular-nums text-neutral-300">
                    {autoValue ?? "—"}
                    <span className="ml-0.5 text-xs font-normal text-neutral-500">g</span>
                  </span>
                )}
              </label>
            ))}
          </div>

          <p className="m-0 mt-2 text-xs text-neutral-500">
            {macroMode === "auto" ? (
              "30% protein · 35% carbs · 35% fat of your calorie target."
            ) : macroKcal != null ? (
              <>
                Adds up to <span className="font-semibold tabular-nums text-neutral-300">{macroKcal.toLocaleString()} kcal</span>
                {effective != null && Math.abs(macroKcal - effective) >= 50 && (
                  <span className="text-amber-300">
                    {" "}
                    · {Math.abs(macroKcal - effective).toLocaleString()} {macroKcal > effective ? "over" : "under"} your target
                  </span>
                )}
              </>
            ) : (
              "Enter grams for all three."
            )}
          </p>
        </section>

        {error && (
          <p role="alert" className="m-0 mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl py-3 text-sm font-medium text-neutral-300 ring-1 ring-inset ring-white/10 transition hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:bg-white/10 disabled:text-neutral-500"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: "auto" | "custom"; onChange: (v: "auto" | "custom") => void }) {
  return (
    <div className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-inset ring-white/5" role="group">
      {(["auto", "custom"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
            value === m ? "bg-white text-zinc-950" : "text-neutral-400 hover:text-white"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

const FIELD =
  "mt-1 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm tabular-nums text-white focus:border-emerald-500/50 focus:outline-none";
