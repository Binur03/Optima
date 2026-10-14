// Meal planner maths. Pure — shared by the API and the UI.

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const SLOTS = [
  { key: "breakfast", label: "Breakfast", icon: "🍳", weight: 0.25, until: 11 },
  { key: "lunch", label: "Lunch", icon: "🥗", weight: 0.35, until: 17 },
  { key: "dinner", label: "Dinner", icon: "🍽️", weight: 0.4, until: 24 },
] as const;

export type Slot = (typeof SLOTS)[number]["key"];

export function isSlot(v: unknown): v is Slot {
  return SLOTS.some((s) => s.key === v);
}

// The meal you'd be planning at this hour (matches the Breakfast/Lunch/Dinner cards).
export function slotForHour(hour: number): Slot {
  return SLOTS.find((s) => hour < s.until)!.key;
}

export function nextSlot(slot: Slot): Slot | null {
  const i = SLOTS.findIndex((s) => s.key === slot);
  return SLOTS[i + 1]?.key ?? null;
}

// What's left today, never negative.
export function remainingMacros(target: Macros, eaten: Macros): Macros {
  const left = (a: number, b: number) => Math.max(0, Math.round(a - b));
  return {
    calories: left(target.calories, eaten.calories),
    protein: left(target.protein, eaten.protein),
    carbs: left(target.carbs, eaten.carbs),
    fat: left(target.fat, eaten.fat),
  };
}

// Splits what's left across this meal and the meals still to come, by their
// weights (25 / 35 / 40). The last meal of the day — dinner — takes everything
// remaining, so choosing it closes out the day's targets.
export function slotBudget(remaining: Macros, slot: Slot): { budget: Macros; share: number; closesDay: boolean } {
  const i = SLOTS.findIndex((s) => s.key === slot);
  const ahead = SLOTS.slice(i);
  const share = SLOTS[i].weight / ahead.reduce((sum, s) => sum + s.weight, 0);
  const part = (n: number) => Math.round(n * share);
  return {
    budget: {
      calories: part(remaining.calories),
      protein: part(remaining.protein),
      carbs: part(remaining.carbs),
      fat: part(remaining.fat),
    },
    share,
    closesDay: ahead.length === 1,
  };
}
