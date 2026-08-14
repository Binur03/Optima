"use client";

import { useMemo, useState } from "react";
import type { MacroEstimate } from "@/lib/gemini";

type Source = "AI_IMAGE" | "MANUAL" | "TEXT_SEARCH";

interface Props {
  initial: MacroEstimate;
  source: Source;
  imageDataUrl?: string;
  onSaved: () => void;
  onCancel: () => void;
}

// The critical screen: AI values are pre-filled but EVERY field is editable,
// and nothing is persisted until the user taps Save. Any manual edit flips
// aiEstimated -> false so we can later measure model accuracy.
export function EditableMacroForm({
  initial,
  source,
  imageDataUrl,
  onSaved,
  onCancel,
}: Props) {
  // Base values captured at 1.0x so the portion multiplier scales predictably.
  const base = useMemo(
    () => ({
      calories: initial.estimated_calories,
      protein: initial.protein_g,
      carbs: initial.carbs_g,
      fat: initial.fat_g,
    }),
    [initial]
  );

  const [foodName, setFoodName] = useState(initial.food_name);
  const [portion, setPortion] = useState(1);
  const [edited, setEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manually-overridden fields; when set, they win over the portion scaling.
  const [overrides, setOverrides] = useState<Partial<Record<
    "calories" | "protein" | "carbs" | "fat",
    number
  >>>({});

  const val = (k: "calories" | "protein" | "carbs" | "fat") =>
    overrides[k] ?? Math.round(base[k] * portion);

  function setField(k: "calories" | "protein" | "carbs" | "fat", v: number) {
    setOverrides((o) => ({ ...o, [k]: Math.max(0, v) }));
    setEdited(true);
  }

  function bumpPortion(delta: number) {
    setPortion((p) => Math.max(0.25, Math.round((p + delta) * 4) / 4));
    setOverrides({}); // portion change re-scales from base; drop stale overrides
    setEdited(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/food/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodName,
          calories: val("calories"),
          proteinG: val("protein"),
          carbsG: val("carbs"),
          fatG: val("fat"),
          source,
          aiEstimated: source !== "MANUAL" && !edited,
          imageUrl: imageDataUrl ?? null,
        }),
      });
      if (!res.ok) throw new Error();
      onSaved();
    } catch {
      setError("Couldn't save. Check your connection and retry.");
    } finally {
      setSaving(false);
    }
  }

  const lowConfidence = initial.confidence === "low";

  return (
    <form
      className={`macro-form${lowConfidence ? " low-confidence" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {imageDataUrl && <img className="meal-thumb" src={imageDataUrl} alt="Your meal" />}

      {lowConfidence && (
        <p className="confidence-hint" role="status">
          ⚠️ Low confidence — double-check the portion and macros.
        </p>
      )}

      <label>
        Food
        <input
          value={foodName}
          onChange={(e) => {
            setFoodName(e.target.value);
            setEdited(true);
          }}
          maxLength={120}
          required
        />
      </label>

      <div className="portion-row" aria-label="Portion multiplier">
        <button type="button" onClick={() => bumpPortion(-0.25)} aria-label="Less">
          −
        </button>
        <span>{portion.toFixed(2)}×</span>
        <button type="button" onClick={() => bumpPortion(0.25)} aria-label="More">
          +
        </button>
      </div>

      <NumberField label="Calories" unit="kcal" value={val("calories")} onChange={(v) => setField("calories", v)} />
      <NumberField label="Protein" unit="g" value={val("protein")} onChange={(v) => setField("protein", v)} />
      <NumberField label="Carbs" unit="g" value={val("carbs")} onChange={(v) => setField("carbs", v)} />
      <NumberField label="Fat" unit="g" value={val("fat")} onChange={(v) => setField("fat", v)} />

      {error && (
        <p role="alert" className="save-error">
          {error}
        </p>
      )}

      <div className="actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save to today"}
        </button>
      </div>
    </form>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="number-field">
      {label}
      <span className="input-wrap">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="unit">{unit}</span>
      </span>
    </label>
  );
}
