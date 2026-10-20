// Matching exercise names the way a person would: "Pull ups" = "Pull-Up",
// "Hammer curls" = "Hammer Curl". Pure — used by the API and the UI.

// Lowercase, letters and digits only, singular.
export function nameKey(name: string): string {
  const k = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return k.length > 3 && k.endsWith("s") && !k.endsWith("ss") ? k.slice(0, -1) : k;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3; // only small typos matter here
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (name: string) => name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singular);

// Real gym words. Two names that differ by one of these (Back/Hack Squat,
// Abduction/Adduction, Incline/Decline) are different lifts, not typos.
const VOCAB = new Set(
  (
    "ab abduction adduction arm assisted back band barbell bayesian bench bent bicep bird box bridge bulgarian " +
    "cable calf chest chin close crunch curl deadlift decline delt diamond dip dog doorway down dumbbell ez " +
    "extension face flat floor fly front glute goblet grip hack hammer hamstring hang high hip hold hollow incline " +
    "inverted kettlebell kickback lat lateral leg low lunge machine military nordic overhead pec pike plank preacher " +
    "press pull pulldown pullover pushdown push raise rdl rear reverse romanian row seated shoulder shrug side single " +
    "skull smith split squat standing step sumo thrust trap tricep up upright walking wall weighted wide y"
  )
    .split(" ")
    .map(singular)
);

// Probably the same lift: identical once normalised ("Pull ups" / "Pull-Up"),
// or one misspelled word ("Rear felt fly" / "Rear Delt Fly"). Only ever a
// suggestion — the user confirms every merge.
export function looksSame(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const wa = words(a);
  const wb = words(b);
  if (wa.length !== wb.length) return false;
  const diff = wa.map((w, i) => [w, wb[i]] as const).filter(([p, q]) => p !== q);
  if (diff.length !== 1) return false;
  const [p, q] = diff[0];
  if (VOCAB.has(p) && VOCAB.has(q)) return false; // both real words → genuinely different
  return Math.min(p.length, q.length) >= 3 && editDistance(p, q) <= (Math.max(p.length, q.length) <= 5 ? 1 : 2);
}

// Pairs of the user's lifts that look like duplicates.
export function duplicatePairs<T extends { id: string; name: string }>(items: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (looksSame(items[i].name, items[j].name)) out.push([items[i], items[j]]);
    }
  }
  return out;
}
