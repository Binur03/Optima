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

// Trims and collapses whitespace; null when the length is out of range.
export function cleanName(value: unknown, max: number): string | null {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return name.length >= 2 && name.length <= max ? name : null;
}
export const MAX_SPLIT_NAME = 40;
export const MAX_EXERCISE_NAME = 60;

export interface SplitPreset {
  name: string;
  exercises: string[];
}

// Provisioned the first time a user opens the tracker.
export const DEFAULT_SPLITS: SplitPreset[] = [
  { name: "Push", exercises: ["Bench Press", "Overhead Press", "Incline Dumbbell Press", "Tricep Pushdown"] },
  { name: "Pull", exercises: ["Deadlift", "Pull-Up", "Barbell Row", "Bicep Curl"] },
  { name: "Legs", exercises: ["Back Squat", "Romanian Deadlift", "Leg Press", "Calf Raise"] },
];

// Starting points offered when adding a split. Exercises are shared by name,
// so "Bench Press" in Push and in Chest & Back is the same lift and history.
export const SPLIT_PRESETS: SplitPreset[] = [
  ...DEFAULT_SPLITS,
  { name: "Chest & Back", exercises: ["Bench Press", "Incline Dumbbell Press", "Barbell Row", "Lat Pulldown", "Cable Fly"] },
  { name: "Shoulders & Arms", exercises: ["Overhead Press", "Lateral Raise", "Rear Delt Fly", "Bicep Curl", "Tricep Pushdown"] },
  { name: "Upper", exercises: ["Bench Press", "Barbell Row", "Overhead Press", "Lat Pulldown", "Bicep Curl", "Tricep Pushdown"] },
  { name: "Lower", exercises: ["Back Squat", "Romanian Deadlift", "Leg Press", "Leg Curl", "Calf Raise"] },
  { name: "Full Body", exercises: ["Back Squat", "Bench Press", "Barbell Row", "Overhead Press", "Romanian Deadlift"] },
  { name: "Chest", exercises: ["Bench Press", "Incline Dumbbell Press", "Cable Fly", "Dips"] },
  { name: "Back", exercises: ["Pull-Up", "Barbell Row", "Lat Pulldown", "Seated Cable Row"] },
  { name: "Shoulders", exercises: ["Overhead Press", "Lateral Raise", "Rear Delt Fly", "Face Pull"] },
  { name: "Arms", exercises: ["Bicep Curl", "Hammer Curl", "Tricep Pushdown", "Skull Crusher"] },
];

export const MAX_PROGRAM_NAME = 40;

export interface ProgramTemplate {
  key: string;
  name: string;
  blurb: string;
  days: string[]; // names from SPLIT_PRESETS
}

// Whole programs, each a set of preset days.
export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  { key: "ppl", name: "Push / Pull / Legs", blurb: "3 days · classic", days: ["Push", "Pull", "Legs"] },
  { key: "upper_lower", name: "Upper / Lower", blurb: "2 days · 4×/week", days: ["Upper", "Lower"] },
  { key: "arnold", name: "Arnold Split", blurb: "3 days · high volume", days: ["Chest & Back", "Shoulders & Arms", "Legs"] },
  { key: "bro", name: "Bro Split", blurb: "5 days · one muscle a day", days: ["Chest", "Back", "Shoulders", "Arms", "Legs"] },
  { key: "full_body", name: "Full Body", blurb: "1 day · 2–3×/week", days: ["Full Body"] },
];

export function presetDay(name: string): SplitPreset | undefined {
  return SPLIT_PRESETS.find((p) => p.name === name);
}
