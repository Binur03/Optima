// Lift tracker helpers. Weights are in lb.

export interface LiftSet {
  weight: number;
  reps: number;
}

// Normalizes the JSON `sets` column into a typed, sanitized array.
export function parseSets(value: unknown): LiftSet[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((s) => ({
      weight: Number((s as LiftSet)?.weight),
      reps: Number((s as LiftSet)?.reps),
    }))
    .filter((s) => Number.isFinite(s.weight) && s.weight >= 0 && Number.isInteger(s.reps) && s.reps > 0);
}

// Epley estimated one-rep max.
export function estimate1RM(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

export function bestE1RM(sets: LiftSet[]): number {
  return sets.reduce((best, s) => Math.max(best, estimate1RM(s.weight, s.reps)), 0);
}

export function totalVolume(sets: LiftSet[]): number {
  return sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
}

// Provisioned the first time a user opens the tracker.
export const DEFAULT_SPLITS: { name: string; exercises: string[] }[] = [
  { name: "Push", exercises: ["Bench Press", "Overhead Press", "Incline Dumbbell Press", "Tricep Pushdown"] },
  { name: "Pull", exercises: ["Deadlift", "Pull-Up", "Barbell Row", "Bicep Curl"] },
  { name: "Legs", exercises: ["Back Squat", "Romanian Deadlift", "Leg Press", "Calf Raise"] },
];
