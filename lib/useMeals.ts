import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { MealItem } from "@/components/MealGroups";
import { PROGRESS_KEY } from "@/lib/useProgress";

// date null = today (the server resolves "today" in the user's timezone).
export function useMeals(date: string | null) {
  return useQuery({
    queryKey: ["diary-meals", date ?? "today"],
    queryFn: async (): Promise<MealItem[]> => {
      const res = await fetch(`/api/food/list${date ? `?date=${date}` : ""}`);
      if (!res.ok) throw new Error("meals_failed");
      return (await res.json()).meals;
    },
  });
}

// Everything that shows food totals or awards XP for meals.
export function refreshFood(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["diary-meals"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["recents"] });
  qc.invalidateQueries({ queryKey: ["calories-week"] });
  qc.invalidateQueries({ queryKey: PROGRESS_KEY }, { cancelRefetch: false });
}

// Logs an existing meal again, dated today, with its saved macros (no AI call).
export function useCopyMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: MealItem) => {
      const res = await fetch("/api/food/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodName: m.foodName,
          calories: m.calories,
          proteinG: m.proteinG,
          carbsG: m.carbsG,
          fatG: m.fatG,
          source: "MANUAL",
          aiEstimated: m.aiEstimated,
        }),
      });
      if (!res.ok) throw new Error("copy_failed");
    },
    onSuccess: () => refreshFood(qc),
  });
}
