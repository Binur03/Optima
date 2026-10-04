// XP + leveling rules. Pure — imported by both the server evaluator and the UI.

export const XP = {
  meal: 10, // per food log…
  mealsPerDay: 5, // …for the first 5 of a day, so spamming entries can't farm XP
  protein: 50, // protein goal hit
  calories: 50, // finished a day within ±10% of the calorie target
  lift: 40, // completed a lift (3+ sets of one exercise)
  workout: 60, // closed the workout ring
  quests: 25, // all three daily quests cleared
} as const;

export const LIFT_COMPLETE_SETS = 3;
export const WORKOUT_GOAL_SETS = 12;
export const CALORIE_TOLERANCE = 0.1;

const RANKS = [
  { min: 1, name: "Rookie" },
  { min: 3, name: "Contender" },
  { min: 6, name: "Athlete" },
  { min: 10, name: "Elite" },
  { min: 15, name: "Champion" },
  { min: 20, name: "Legend" },
] as const;

// Cumulative XP needed to REACH `level`. Each level costs 50 more than the
// last: 1→2 is 100 XP, 2→3 is 150, 3→4 is 200, …
export function xpForLevel(level: number): number {
  const n = Math.max(0, level - 1);
  return 100 * n + 25 * n * (n - 1);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function rankFor(level: number): string {
  let name: string = RANKS[0].name;
  for (const r of RANKS) if (level >= r.min) name = r.name;
  return name;
}

export function nextRank(level: number): { name: string; level: number } | null {
  const r = RANKS.find((r) => r.min > level);
  return r ? { name: r.name, level: r.min } : null;
}

export function levelProgress(totalXP: number) {
  const level = levelForXp(totalXP);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return {
    total: totalXP,
    level,
    rank: rankFor(level),
    nextRank: nextRank(level),
    into: totalXP - floor,
    span: ceil - floor,
    pct: (totalXP - floor) / (ceil - floor),
  };
}

export type LevelProgress = ReturnType<typeof levelProgress>;
