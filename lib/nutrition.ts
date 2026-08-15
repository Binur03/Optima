// Manual (no-wearable) maintenance + macro-target math.

export type BiologicalSex = "MALE" | "FEMALE" | "OTHER";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2, // little/no exercise
  light: 1.375, // 1-3 days/week
  moderate: 1.55, // 3-5 days/week
  active: 1.725, // 6-7 days/week
  very_active: 1.9, // hard daily training / physical job
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary (little/no exercise)",
  light: "Light (1–3 days/week)",
  moderate: "Moderate (3–5 days/week)",
  active: "Active (6–7 days/week)",
  very_active: "Very active (hard daily training)",
};

// Mifflin-St Jeor BMR → TDEE. Returns rounded daily maintenance calories, or
// null if any required input is missing/invalid.
export function calculateTdee(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: BiologicalSex;
  activity: ActivityLevel;
}): number | null {
  const { weightKg, heightCm, age, sex, activity } = input;
  if (![weightKg, heightCm, age].every((n) => Number.isFinite(n) && n > 0)) return null;

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  // OTHER: average of the +5 (male) and -161 (female) offsets.
  const bmr = sex === "MALE" ? base + 5 : sex === "FEMALE" ? base - 161 : base - 78;
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activity]);
}

export interface MacroGrams {
  protein: number;
  carbs: number;
  fat: number;
}

// Default macro split from a calorie target: 30% protein / 35% carbs / 35% fat.
export function defaultMacroTargets(calories: number): MacroGrams {
  return {
    protein: Math.round((calories * 0.3) / 4), // 4 kcal/g
    carbs: Math.round((calories * 0.35) / 4),
    fat: Math.round((calories * 0.35) / 9), // 9 kcal/g
  };
}
