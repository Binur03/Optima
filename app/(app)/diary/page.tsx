"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Meal {
  id: string;
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: string;
  aiEstimated: boolean;
}

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

type EditForm = {
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

async function getMeals(): Promise<Meal[]> {
  const res = await fetch("/api/food/list");
  if (!res.ok) throw new Error("meals_failed");
  return (await res.json()).meals as Meal[];
}

export default function DiaryPage() {
  const qc = useQueryClient();
  const { data: meals, isLoading } = useQuery({ queryKey: ["diary-meals"], queryFn: getMeals });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/food/log/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete_failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diary-meals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>({
    foodName: "",
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
  });

  const save = useMutation({
    mutationFn: async (arg: { id: string; body: EditForm }) => {
      const r = await fetch(`/api/food/log/${arg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(arg.body),
      });
      if (!r.ok) throw new Error("save_failed");
    },
    onSuccess: () => {
      setEditId(null);
      qc.invalidateQueries({ queryKey: ["diary-meals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const assist = useMutation({
    mutationFn: async (): Promise<AssistantResponse> => {
      const r = await fetch("/api/assistant/suggest");
      return r.json();
    },
  });

  function startEdit(m: Meal) {
    setEditId(m.id);
    setForm({
      foodName: m.foodName,
      calories: m.calories,
      proteinG: m.proteinG,
      carbsG: m.carbsG,
      fatG: m.fatG,
    });
  }

  if (isLoading) {
    return (
      <main className="diary">
        <h1>Today’s Diary</h1>
        <p className="diary-empty">Loading…</p>
      </main>
    );
  }

  const list = meals ?? [];
  const totals = list.reduce(
    (a, m) => ({
      cals: a.cals + m.calories,
      p: a.p + m.proteinG,
      c: a.c + m.carbsG,
      f: a.f + m.fatG,
    }),
    { cals: 0, p: 0, c: 0, f: 0 }
  );

  const a = assist.data;

  return (
    <main className="diary">
      <h1>Today’s Diary</h1>
      <p className="diary-totals">
        {totals.cals.toLocaleString()} kcal · P {Math.round(totals.p)} · C {Math.round(totals.c)} · F{" "}
        {Math.round(totals.f)}
      </p>

      {list.length === 0 && <p className="diary-empty">No meals logged yet today.</p>}

      <ul className="meal-list">
        {list.map((m) => (
          <li key={m.id} className="meal-item">
            {editId === m.id ? (
              <div className="meal-edit">
                <input
                  value={form.foodName}
                  onChange={(e) => setForm({ ...form, foodName: e.target.value })}
                  maxLength={120}
                />
                <div className="meal-edit-macros">
                  <label>
                    kcal
                    <input
                      type="number"
                      value={form.calories}
                      onChange={(e) => setForm({ ...form, calories: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    P
                    <input
                      type="number"
                      value={form.proteinG}
                      onChange={(e) => setForm({ ...form, proteinG: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    C
                    <input
                      type="number"
                      value={form.carbsG}
                      onChange={(e) => setForm({ ...form, carbsG: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    F
                    <input
                      type="number"
                      value={form.fatG}
                      onChange={(e) => setForm({ ...form, fatG: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <div className="meal-actions">
                  <button onClick={() => setEditId(null)} disabled={save.isPending}>
                    Cancel
                  </button>
                  <button
                    className="primary-sm"
                    onClick={() => save.mutate({ id: m.id, body: form })}
                    disabled={save.isPending}
                  >
                    {save.isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="meal-view">
                <div className="meal-main">
                  <span className="meal-name">
                    {m.foodName}
                    {m.aiEstimated && <span className="ai-tag">AI</span>}
                  </span>
                  <span className="meal-macros">
                    {m.calories.toLocaleString()} kcal · P {Math.round(m.proteinG)} · C{" "}
                    {Math.round(m.carbsG)} · F {Math.round(m.fatG)}
                  </span>
                </div>
                <div className="meal-actions">
                  <button onClick={() => startEdit(m)} aria-label="Edit meal">
                    ✎
                  </button>
                  <button
                    onClick={() => del.mutate(m.id)}
                    disabled={del.isPending}
                    aria-label="Delete meal"
                  >
                    🗑
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <section className="assistant">
        <h2>Macro Assistant</h2>
        <button className="primary" onClick={() => assist.mutate()} disabled={assist.isPending}>
          {assist.isPending ? "Thinking…" : "Suggest meals for my remaining macros"}
        </button>

        {a?.error === "no_target" && <p className="diary-empty">{a.message}</p>}

        {a?.remaining && (
          <div className="assist-result">
            <p className="assist-remaining">
              Remaining today: <strong>{a.remaining.calories.toLocaleString()} kcal</strong> · P{" "}
              {a.remaining.protein} · C {a.remaining.carbs} · F {a.remaining.fat}
            </p>
            {a.suggestions && a.suggestions.length > 0 && (
              <ul className="suggestion-list">
                {a.suggestions.map((s, i) => (
                  <li key={i}>
                    <strong>{s.food}</strong>
                    <span>{s.why}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {assist.isError && (
          <p role="alert" className="diary-error">
            Couldn’t get suggestions — try again.
          </p>
        )}
      </section>
    </main>
  );
}
