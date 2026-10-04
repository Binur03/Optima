import type { Equipment, ExerciseKind } from "@/lib/lifts";
import { needsMoreThan } from "@/lib/lifts";

// What each known exercise needs, how its sets are recorded, and what to do
// instead with less equipment. Unknown (user-typed) names fall back to a
// name-based guess and simply get no swap suggestions.
interface Entry {
  needs: Equipment;
  kind: ExerciseKind;
  swaps?: Partial<Record<Exclude<Equipment, "gym">, string[]>>;
}

const E = (needs: Equipment, kind: ExerciseKind, swaps?: Entry["swaps"]): Entry => ({ needs, kind, swaps });

const CATALOG: Record<string, Entry> = {
  // Gym staples → dumbbell / bodyweight alternatives
  "bench press": E("gym", "weight", { dumbbells: ["Dumbbell Floor Press", "Dumbbell Bench Press"], bodyweight: ["Push-Up", "Decline Push-Up"] }),
  "overhead press": E("gym", "weight", { dumbbells: ["Dumbbell Overhead Press"], bodyweight: ["Pike Push-Up"] }),
  "incline dumbbell press": E("dumbbells", "weight", { bodyweight: ["Decline Push-Up"] }),
  "tricep pushdown": E("gym", "weight", { dumbbells: ["Overhead Dumbbell Extension", "Dumbbell Skull Crusher"], bodyweight: ["Bench Dip", "Diamond Push-Up"] }),
  deadlift: E("gym", "weight", { dumbbells: ["Dumbbell Romanian Deadlift"], bodyweight: ["Single-Leg Hip Hinge", "Glute Bridge"] }),
  "barbell row": E("gym", "weight", { dumbbells: ["Dumbbell Row"], bodyweight: ["Inverted Row", "Doorway Row"] }),
  "lat pulldown": E("gym", "weight", { dumbbells: ["Dumbbell Pullover", "Dumbbell Row"], bodyweight: ["Doorway Row", "Pull-Up"] }),
  "seated cable row": E("gym", "weight", { dumbbells: ["Dumbbell Row"], bodyweight: ["Inverted Row", "Doorway Row"] }),
  "cable fly": E("gym", "weight", { dumbbells: ["Dumbbell Fly"], bodyweight: ["Wide Push-Up"] }),
  "face pull": E("gym", "weight", { dumbbells: ["Rear Delt Fly"], bodyweight: ["Prone Y-Raise"] }),
  "back squat": E("gym", "weight", { dumbbells: ["Goblet Squat"], bodyweight: ["Bodyweight Squat", "Bulgarian Split Squat"] }),
  "romanian deadlift": E("gym", "weight", { dumbbells: ["Dumbbell Romanian Deadlift"], bodyweight: ["Single-Leg Hip Hinge", "Glute Bridge"] }),
  "leg press": E("gym", "weight", { dumbbells: ["Goblet Squat"], bodyweight: ["Bulgarian Split Squat", "Bodyweight Squat"] }),
  "leg curl": E("gym", "weight", { dumbbells: ["Dumbbell Romanian Deadlift"], bodyweight: ["Glute Bridge", "Nordic Curl"] }),
  "skull crusher": E("gym", "weight", { dumbbells: ["Dumbbell Skull Crusher"], bodyweight: ["Diamond Push-Up"] }),
  // Dumbbell moves → bodyweight alternatives
  "bicep curl": E("dumbbells", "weight", { bodyweight: ["Towel Curl"] }),
  "hammer curl": E("dumbbells", "weight", { bodyweight: ["Towel Curl"] }),
  "lateral raise": E("dumbbells", "weight", { bodyweight: ["Pike Push-Up"] }),
  "rear delt fly": E("dumbbells", "weight", { bodyweight: ["Prone Y-Raise"] }),
  "goblet squat": E("dumbbells", "weight", { bodyweight: ["Bodyweight Squat"] }),
  "dumbbell romanian deadlift": E("dumbbells", "weight", { bodyweight: ["Single-Leg Hip Hinge"] }),
  "dumbbell overhead press": E("dumbbells", "weight", { bodyweight: ["Pike Push-Up"] }),
  "dumbbell floor press": E("dumbbells", "weight", { bodyweight: ["Push-Up"] }),
  "dumbbell bench press": E("dumbbells", "weight", { bodyweight: ["Push-Up"] }),
  "dumbbell row": E("dumbbells", "weight", { bodyweight: ["Inverted Row", "Doorway Row"] }),
  "dumbbell fly": E("dumbbells", "weight", { bodyweight: ["Wide Push-Up"] }),
  "dumbbell pullover": E("dumbbells", "weight", { bodyweight: ["Doorway Row"] }),
  "dumbbell skull crusher": E("dumbbells", "weight", { bodyweight: ["Diamond Push-Up"] }),
  "overhead dumbbell extension": E("dumbbells", "weight", { bodyweight: ["Bench Dip"] }),
  // Bodyweight
  "push-up": E("bodyweight", "bodyweight"),
  "decline push-up": E("bodyweight", "bodyweight"),
  "wide push-up": E("bodyweight", "bodyweight"),
  "diamond push-up": E("bodyweight", "bodyweight"),
  "pike push-up": E("bodyweight", "bodyweight"),
  "pull-up": E("bodyweight", "bodyweight"),
  "chin-up": E("bodyweight", "bodyweight"),
  dips: E("bodyweight", "bodyweight"),
  "bench dip": E("bodyweight", "bodyweight"),
  "inverted row": E("bodyweight", "bodyweight"),
  "doorway row": E("bodyweight", "bodyweight"),
  "towel curl": E("bodyweight", "bodyweight"),
  "prone y-raise": E("bodyweight", "bodyweight"),
  "bodyweight squat": E("bodyweight", "bodyweight"),
  lunge: E("bodyweight", "bodyweight"),
  "bulgarian split squat": E("bodyweight", "bodyweight"),
  "glute bridge": E("bodyweight", "bodyweight"),
  "single-leg hip hinge": E("bodyweight", "bodyweight"),
  "nordic curl": E("bodyweight", "bodyweight"),
  "calf raise": E("bodyweight", "weight"), // usually loaded at the gym; 0 lb works at home
  "dead bug": E("bodyweight", "bodyweight"),
  "bird dog": E("bodyweight", "bodyweight"),
  // Timed holds & mobility
  plank: E("bodyweight", "duration"),
  "side plank": E("bodyweight", "duration"),
  "hollow hold": E("bodyweight", "duration"),
  "wall sit": E("bodyweight", "duration"),
  "dead hang": E("bodyweight", "duration"),
  "cat-cow": E("bodyweight", "duration"),
  "world's greatest stretch": E("bodyweight", "duration"),
  "hip flexor stretch": E("bodyweight", "duration"),
};

const key = (name: string) => name.trim().toLowerCase();

// How a new exercise's sets should be recorded.
export function kindFor(name: string): ExerciseKind {
  const hit = CATALOG[key(name)];
  if (hit) return hit.kind;
  const n = key(name);
  if (/\b(plank|hold|wall sit|hang|stretch|mobility|yoga)\b/.test(n)) return "duration";
  if (/\b(push-?ups?|pull-?ups?|chin-?ups?|dips?|burpees?|bodyweight|lunges?|crunch(es)?|sit-?ups?)\b/.test(n)) return "bodyweight";
  return "weight";
}

// Alternatives that fit the user's equipment, or [] when the lift already fits.
export function swapsFor(name: string, equipment: Equipment): string[] {
  const hit = CATALOG[key(name)];
  if (!hit || equipment === "gym" || !needsMoreThan(hit.needs, equipment)) return [];
  return hit.swaps?.[equipment] ?? [];
}
