// Lift tracker helpers. Weights are in lb.

// One logged set. Weighted: weight × reps. Bodyweight: weight is the ADDED
// load (0 = just bodyweight, negative = band/machine assisted). Timed holds:
// `seconds` only (weight and reps are 0).
export interface LiftSet {
  weight: number;
  reps: number;
  seconds?: number;
}

export type ExerciseKind = "weight" | "bodyweight" | "duration";

// Normalizes the JSON `sets` column into a typed, sanitized array.
export function parseSets(value: unknown): LiftSet[] {
  if (!Array.isArray(value)) return [];
  const out: LiftSet[] = [];
  for (const raw of value) {
    const s = raw as Partial<LiftSet> | null;
    if (s && s.seconds !== undefined) {
      const seconds = Number(s.seconds);
      if (Number.isFinite(seconds) && seconds > 0) out.push({ weight: 0, reps: 0, seconds: Math.round(seconds) });
      continue;
    }
    const weight = Number(s?.weight);
    const reps = Number(s?.reps);
    if (Number.isFinite(weight) && weight >= -500 && Number.isInteger(reps) && reps > 0) out.push({ weight, reps });
  }
  return out;
}

const isLoaded = (s: LiftSet) => s.seconds === undefined && s.weight > 0;

// Epley estimated one-rep max.
export function estimate1RM(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

export function bestE1RM(sets: LiftSet[]): number {
  return sets.filter(isLoaded).reduce((best, s) => Math.max(best, estimate1RM(s.weight, s.reps)), 0);
}

// lb moved — only sets with external load count (not holds or plain bodyweight).
export function totalVolume(sets: LiftSet[]): number {
  return sets.filter(isLoaded).reduce((sum, s) => sum + s.weight * s.reps, 0);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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
  // Low- / no-equipment days.
  { name: "Bodyweight Essentials", exercises: ["Push-Up", "Bodyweight Squat", "Lunge", "Plank", "Inverted Row"] },
  { name: "Dumbbell Full-Body", exercises: ["Goblet Squat", "Dumbbell Romanian Deadlift", "Dumbbell Overhead Press", "Dumbbell Floor Press", "Dumbbell Row"] },
  { name: "Mobility & Core", exercises: ["Cat-Cow", "World's Greatest Stretch", "Dead Bug", "Hollow Hold", "Glute Bridge", "Side Plank"] },
];

export const MAX_PROGRAM_NAME = 40;

export type Equipment = "gym" | "dumbbells" | "bodyweight";

export interface ProgramTemplate {
  key: string;
  name: string;
  blurb: string;
  equipment: Equipment; // the most it needs
  days: string[]; // names from SPLIT_PRESETS
}

// Whole programs, each a set of preset days.
export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  { key: "ppl", name: "Push / Pull / Legs", blurb: "3 days · classic", equipment: "gym", days: ["Push", "Pull", "Legs"] },
  { key: "upper_lower", name: "Upper / Lower", blurb: "2 days · 4×/week", equipment: "gym", days: ["Upper", "Lower"] },
  { key: "arnold", name: "Arnold Split", blurb: "3 days · high volume", equipment: "gym", days: ["Chest & Back", "Shoulders & Arms", "Legs"] },
  { key: "bro", name: "Bro Split", blurb: "5 days · one muscle a day", equipment: "gym", days: ["Chest", "Back", "Shoulders", "Arms", "Legs"] },
  { key: "full_body", name: "Full Body", blurb: "1 day · 2–3×/week", equipment: "gym", days: ["Full Body"] },
  { key: "bw_essentials", name: "Bodyweight Essentials", blurb: "No equipment · 3×/week", equipment: "bodyweight", days: ["Bodyweight Essentials"] },
  { key: "db_full_body", name: "Dumbbell Full-Body", blurb: "A pair of dumbbells · 3×/week", equipment: "dumbbells", days: ["Dumbbell Full-Body"] },
  { key: "mobility", name: "15-Min Mobility & Core", blurb: "Desk-break friendly · daily", equipment: "bodyweight", days: ["Mobility & Core"] },
];

const EQUIPMENT_RANK: Record<Equipment, number> = { bodyweight: 0, dumbbells: 1, gym: 2 };

// Templates that fit the user's setup first, then the rest.
export function templatesFor(equipment: Equipment): ProgramTemplate[] {
  const fits = (t: ProgramTemplate) => EQUIPMENT_RANK[t.equipment] <= EQUIPMENT_RANK[equipment];
  return equipment === "gym"
    ? PROGRAM_TEMPLATES
    : [...PROGRAM_TEMPLATES.filter((t) => fits(t) && t.equipment !== "gym"), ...PROGRAM_TEMPLATES.filter((t) => !fits(t))];
}

export function needsMoreThan(needs: Equipment, have: Equipment) {
  return EQUIPMENT_RANK[needs] > EQUIPMENT_RANK[have];
}

export function presetDay(name: string): SplitPreset | undefined {
  return SPLIT_PRESETS.find((p) => p.name === name);
}
