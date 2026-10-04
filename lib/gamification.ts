import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, isoDay, localDateOnly } from "@/lib/datetime";
import { computeTarget } from "@/lib/tdee";
import { defaultMacroTargets } from "@/lib/nutrition";
import { parseSets } from "@/lib/lifts";
import { WORKOUT_GOAL } from "@/lib/cardio";
import { ACHIEVEMENTS, type AchievementStats } from "@/lib/achievements";
import {
  CALORIE_TOLERANCE,
  LIFT_COMPLETE_SETS,
  WORKOUT_GOAL_SETS,
  XP,
  levelForXp,
  levelProgress,
} from "@/lib/xp";

// Current logging streak: consecutive days (in the user's timezone) with at
// least one food log. The streak only BREAKS if nothing was logged yesterday —
// today counts as a grace day, so an un-logged "today" doesn't kill the streak
// until it becomes yesterday.
export async function computeStreak(userId: string, timezone: string): Promise<number> {
  const today = localDateOnly(timezone);
  const since = addDays(today, -60); // scan window is plenty for a display streak

  const rows = await prisma.foodLog.findMany({
    where: { userId, logDate: { gte: since } },
    select: { logDate: true },
    distinct: ["logDate"],
  });
  const logged = new Set(rows.map((r) => isoDay(r.logDate)));

  // Anchor at today if it has a log, else yesterday (grace); if neither, no streak.
  let cursor: Date;
  if (logged.has(isoDay(today))) cursor = today;
  else if (logged.has(isoDay(addDays(today, -1)))) cursor = addDays(today, -1);
  else return 0;

  let streak = 0;
  while (logged.has(isoDay(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// ---------- Progression ----------

const BACKFILL_DAYS = 7; // meals/lifts logged elsewhere still earn XP within a week

interface Candidate {
  key: string;
  amount: number;
  label: string;
}

export interface Quest {
  key: "breakfast" | "protein" | "lift";
  title: string;
  sub: string;
  xp: number;
  done: boolean;
  href: string;
}

// Inserts ledger rows, skipping any already earned, and returns only the rows
// THIS call created — so concurrent evaluations can never double-award.
async function grant(userId: string, items: Candidate[]): Promise<Candidate[]> {
  if (items.length === 0) return [];
  const values = Prisma.join(
    items.map((c) => Prisma.sql`(gen_random_uuid()::text, ${userId}, ${c.key}, ${c.amount})`)
  );
  const inserted = await prisma.$queryRaw<{ key: string }[]>(Prisma.sql`
    INSERT INTO xp_events (id, user_id, key, amount)
    VALUES ${values}
    ON CONFLICT (user_id, key) DO NOTHING
    RETURNING key`);
  const created = new Set(inserted.map((r) => r.key));
  return items.filter((c) => created.has(c.key));
}

async function unlock(userId: string, keys: string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const values = Prisma.join(keys.map((k) => Prisma.sql`(gen_random_uuid()::text, ${userId}, ${k})`));
  const inserted = await prisma.$queryRaw<{ key: string }[]>(Prisma.sql`
    INSERT INTO achievements (id, user_id, key)
    VALUES ${values}
    ON CONFLICT (user_id, key) DO NOTHING
    RETURNING key`);
  return inserted.map((r) => r.key);
}

async function proteinTarget(
  userId: string,
  day: Date,
  stored: number | null
): Promise<number | null> {
  if (stored != null) return stored;
  const { targetIntake } = await computeTarget(userId, day);
  return targetIntake != null ? defaultMacroTargets(targetIntake).protein : null;
}

// Evaluates everything XP-worthy in the recent window, writes any new ledger
// rows / badges, refreshes the cached totals on `users`, and returns the
// player state for the UI. Idempotent: safe to call on every app open.
export async function syncProgress(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      targetProtein: true,
      targetCarbs: true,
      targetFat: true,
      highestStreak: true,
      level: true,
    },
  });
  if (!user) return null;

  const today = localDateOnly(user.timezone);
  const yesterday = addDays(today, -1);
  const since = addDays(today, -(BACKFILL_DAYS - 1));
  const todayKey = isoDay(today);
  const yesterdayKey = isoDay(yesterday);
  // Stored macro goals only count when all three are set (matches the dashboard).
  const storedProtein =
    user.targetProtein != null && user.targetCarbs != null && user.targetFat != null
      ? user.targetProtein
      : null;

  const [meals, lifts, cardio, wearable, streak, proteinToday, proteinYesterday, targetYesterday] =
    await Promise.all([
      prisma.foodLog.findMany({
        where: { userId, logDate: { gte: since } },
        select: { id: true, logDate: true, calories: true, proteinG: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.workoutLog.findMany({
        where: { userId, logDate: { gte: since } },
        select: { logDate: true, sets: true },
      }),
      prisma.cardioLog.findMany({
        where: { userId, logDate: { gte: since } },
        select: { logDate: true, minutes: true, steps: true },
      }),
      prisma.dailyLog.findMany({
        where: { userId, logDate: { gte: since }, steps: { not: null } },
        select: { logDate: true, steps: true },
      }),
      computeStreak(userId, user.timezone),
      proteinTarget(userId, today, storedProtein),
      proteinTarget(userId, yesterday, storedProtein),
      computeTarget(userId, yesterday),
    ]);

  // Per-day rollups.
  type Day = { meals: string[]; kcal: number; protein: number; sets: number; liftDone: boolean; cardioMin: number; steps: number };
  const day = new Map<string, Day>();
  const roll = (key: string) => {
    let d = day.get(key);
    if (!d) day.set(key, (d = { meals: [], kcal: 0, protein: 0, sets: 0, liftDone: false, cardioMin: 0, steps: 0 }));
    return d;
  };
  for (const m of meals) {
    const d = roll(isoDay(m.logDate));
    d.meals.push(m.id);
    d.kcal += m.calories;
    d.protein += Number(m.proteinG);
  }
  for (const l of lifts) {
    const d = roll(isoDay(l.logDate));
    const n = parseSets(l.sets).length;
    d.sets += n;
    if (n >= LIFT_COMPLETE_SETS) d.liftDone = true;
  }
  for (const c of cardio) {
    const d = roll(isoDay(c.logDate));
    d.cardioMin += c.minutes;
    d.steps += c.steps ?? 0;
  }
  // A wearable's step count wins when it's higher than what was logged by hand.
  for (const w of wearable) {
    const d = roll(isoDay(w.logDate));
    d.steps = Math.max(d.steps, w.steps ?? 0);
  }
  // A workout counts whether it's lifting, cardio, or simply moving a lot.
  const workoutDone = (d: Day) => d.liftDone || d.cardioMin >= WORKOUT_GOAL.cardioMinutes;
  const ringClosed = (d: Day) =>
    d.sets >= WORKOUT_GOAL_SETS || d.cardioMin >= WORKOUT_GOAL.cardioMinutes || d.steps >= WORKOUT_GOAL.steps;

  const candidates: Candidate[] = [];
  for (const [date, d] of day) {
    for (const id of d.meals.slice(0, XP.mealsPerDay)) {
      candidates.push({ key: `meal:${id}`, amount: XP.meal, label: "Meal logged" });
    }
    if (workoutDone(d)) candidates.push({ key: `lift:${date}`, amount: XP.lift, label: "Workout complete" });
    if (ringClosed(d)) {
      candidates.push({ key: `workout:${date}`, amount: XP.workout, label: "Workout ring closed" });
    }
  }

  // Daily targets: protein is live for today; calories are judged on a finished day.
  const questsFor = (date: string, target: number | null) => {
    const d = day.get(date);
    return {
      breakfast: (d?.meals.length ?? 0) > 0,
      protein: target != null && target > 0 && (d?.protein ?? 0) >= target,
      lift: d ? workoutDone(d) : false,
    };
  };
  const qToday = questsFor(todayKey, proteinToday);
  const qYesterday = questsFor(yesterdayKey, proteinYesterday);
  for (const [date, q] of [
    [todayKey, qToday],
    [yesterdayKey, qYesterday],
  ] as const) {
    if (q.protein) candidates.push({ key: `protein:${date}`, amount: XP.protein, label: "Protein goal hit" });
    if (q.breakfast && q.protein && q.lift) {
      candidates.push({ key: `quests:${date}`, amount: XP.quests, label: "Daily quests cleared" });
    }
  }
  const kcalYesterday = day.get(yesterdayKey)?.kcal ?? 0;
  const tY = targetYesterday.targetIntake;
  if (tY != null && kcalYesterday > 0 && Math.abs(kcalYesterday - tY) <= tY * CALORIE_TOLERANCE) {
    candidates.push({ key: `calories:${yesterdayKey}`, amount: XP.calories, label: "On-target day" });
  }

  const awarded = await grant(userId, candidates);

  // Achievements — evaluated after the grant so today's protein counts.
  const highestStreak = Math.max(user.highestStreak, streak);
  const [mealCount, trainingDays, proteinDays, benchLogs, owned] = await Promise.all([
    prisma.foodLog.count({ where: { userId } }),
    prisma.workoutLog.groupBy({ by: ["logDate"], where: { userId } }),
    prisma.xpEvent.count({ where: { userId, key: { startsWith: "protein:" } } }),
    prisma.workoutLog.findMany({
      where: { userId, exercise: { name: { contains: "bench", mode: "insensitive" } } },
      select: { sets: true },
    }),
    prisma.achievement.findMany({ where: { userId }, select: { key: true, unlockedAt: true } }),
  ]);
  const stats: AchievementStats = {
    meals: mealCount,
    highestStreak,
    trainingDays: trainingDays.length,
    proteinDays,
    benchBest: Math.max(
      0,
      ...benchLogs.flatMap((l) => parseSets(l.sets).filter((s) => s.reps >= 1).map((s) => s.weight))
    ),
  };
  const ownedAt = new Map(owned.map((a) => [a.key, a.unlockedAt]));
  const newlyUnlocked = await unlock(
    userId,
    ACHIEVEMENTS.filter((a) => !ownedAt.has(a.key) && a.earned(stats)).map((a) => a.key)
  );
  const unlockedDefs = ACHIEVEMENTS.filter((a) => newlyUnlocked.includes(a.key));
  awarded.push(
    ...(await grant(
      userId,
      unlockedDefs.map((a) => ({ key: `ach:${a.key}`, amount: a.xp, label: a.title }))
    ))
  );
  const now = new Date();
  for (const k of newlyUnlocked) ownedAt.set(k, now);

  // Refresh the cached totals from the ledger (the source of truth).
  const sum = await prisma.xpEvent.aggregate({ where: { userId }, _sum: { amount: true } });
  const totalXP = sum._sum.amount ?? 0;
  const level = levelForXp(totalXP);
  await prisma.user.update({
    where: { id: userId },
    data: { totalXP, level, currentStreak: streak, highestStreak },
  });

  const todayRoll = day.get(todayKey);
  const quests: Quest[] = [
    {
      key: "breakfast",
      title: "Log Breakfast",
      sub: "Your first meal of the day",
      xp: XP.meal,
      done: qToday.breakfast,
      href: "/log",
    },
    {
      key: "protein",
      title: "Hit Protein Goal",
      sub:
        proteinToday != null
          ? `${Math.round(day.get(todayKey)?.protein ?? 0)} / ${proteinToday} g`
          : "Set a target in Setup",
      xp: XP.protein,
      done: qToday.protein,
      href: proteinToday != null ? "/log" : "/onboarding",
    },
    {
      key: "lift",
      title: "Complete a Workout",
      sub: `${LIFT_COMPLETE_SETS} sets of a lift, or ${WORKOUT_GOAL.cardioMinutes} min of cardio`,
      xp: XP.lift,
      done: qToday.lift,
      href: "/train",
    },
  ];

  return {
    xp: levelProgress(totalXP),
    levelUp: level > user.level ? level : null,
    streak: { current: streak, highest: highestStreak },
    today: {
      date: todayKey,
      sets: todayRoll?.sets ?? 0,
      setGoal: WORKOUT_GOAL_SETS,
      cardioMinutes: todayRoll?.cardioMin ?? 0,
      cardioGoal: WORKOUT_GOAL.cardioMinutes,
      steps: todayRoll?.steps ?? 0,
      stepGoal: WORKOUT_GOAL.steps,
    },
    quests,
    questBonus: { xp: XP.quests, done: quests.every((q) => q.done) },
    achievements: ACHIEVEMENTS.map((a) => ({
      key: a.key,
      title: a.title,
      description: a.description,
      icon: a.icon,
      xp: a.xp,
      unlockedAt: ownedAt.get(a.key)?.toISOString() ?? null,
    })),
    awarded: awarded.map(({ key, amount, label }) => ({ key, amount, label })),
  };
}

export type ProgressState = NonNullable<Awaited<ReturnType<typeof syncProgress>>>;
