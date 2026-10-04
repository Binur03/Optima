// Cardio activities and the thresholds that close the Workout ring.

export const CARDIO_ACTIVITIES = [
  { key: "walk", label: "Walking", icon: "🚶", distance: true, steps: true },
  { key: "run", label: "Running", icon: "🏃", distance: true, steps: true },
  { key: "cycle", label: "Cycling", icon: "🚴", distance: true, steps: false },
  { key: "row", label: "Rowing", icon: "🚣", distance: true, steps: false },
  { key: "hiit", label: "HIIT", icon: "⚡", distance: false, steps: false },
] as const;

export type CardioActivity = (typeof CARDIO_ACTIVITIES)[number]["key"];

// Any ONE of these closes the Workout ring for the day.
export const WORKOUT_GOAL = { sets: 12, cardioMinutes: 20, steps: 8000 } as const;

export function activityMeta(key: string) {
  return CARDIO_ACTIVITIES.find((a) => a.key === key) ?? CARDIO_ACTIVITIES[0];
}
