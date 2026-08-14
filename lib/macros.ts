// The app tracks a calorie target; per-macro goals aren't user-set, so we derive
// a sensible default split from the calorie target (30% protein / 40% carbs /
// 30% fat) purely to power the Macro Assistant's "remaining" gaps.

export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
}

export function macroTargetsFromCalories(calories: number): Macros {
  return {
    protein: Math.round((calories * 0.3) / 4), // 4 kcal/g
    carbs: Math.round((calories * 0.4) / 4),
    fat: Math.round((calories * 0.3) / 9), // 9 kcal/g
  };
}

export function remainingMacros(target: Macros, consumed: Macros): Macros {
  return {
    protein: Math.max(0, Math.round(target.protein - consumed.protein)),
    carbs: Math.max(0, Math.round(target.carbs - consumed.carbs)),
    fat: Math.max(0, Math.round(target.fat - consumed.fat)),
  };
}
