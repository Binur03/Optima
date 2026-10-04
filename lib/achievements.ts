// Achievement catalog. Unlocks are stored as rows in `achievements`; the
// titles and rules live here so new badges ship without a migration.

export interface AchievementStats {
  meals: number; // all-time food logs
  highestStreak: number; // best logging streak, in days
  trainingDays: number; // distinct days with at least one set
  proteinDays: number; // days the protein goal was hit
  benchBest: number; // heaviest bench set, lb
}

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  earned: (s: AchievementStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: "first_meal",
    title: "First Bite",
    description: "Log your first meal",
    icon: "🍽️",
    xp: 25,
    earned: (s) => s.meals >= 1,
  },
  {
    key: "streak_3",
    title: "Warming Up",
    description: "3-day logging streak",
    icon: "✨",
    xp: 50,
    earned: (s) => s.highestStreak >= 3,
  },
  {
    key: "streak_7",
    title: "On Fire",
    description: "7-day logging streak",
    icon: "🔥",
    xp: 100,
    earned: (s) => s.highestStreak >= 7,
  },
  {
    key: "streak_30",
    title: "Iron Habit",
    description: "30-day logging streak",
    icon: "💎",
    xp: 300,
    earned: (s) => s.highestStreak >= 30,
  },
  {
    key: "first_workout",
    title: "First Rep",
    description: "Log your first set",
    icon: "🏋️",
    xp: 25,
    earned: (s) => s.trainingDays >= 1,
  },
  {
    key: "workouts_10",
    title: "Gym Regular",
    description: "Train on 10 different days",
    icon: "📅",
    xp: 150,
    earned: (s) => s.trainingDays >= 10,
  },
  {
    key: "protein_7",
    title: "Protein Pro",
    description: "Hit your protein goal 7 times",
    icon: "🥩",
    xp: 150,
    earned: (s) => s.proteinDays >= 7,
  },
  {
    key: "bench_225",
    title: "225 Club",
    description: "Bench press 225 lb",
    icon: "🏆",
    xp: 250,
    earned: (s) => s.benchBest >= 225,
  },
];
