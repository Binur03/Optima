import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeTarget } from "@/lib/tdee";
import { computeDelta, eatingDayFraction } from "@/lib/delta";
import { localDateOnly, localHourInTimeZone } from "@/lib/datetime";
import { defaultMacroTargets } from "@/lib/nutrition";
import { computeStreak } from "@/lib/gamification";
import { getCurrentUserId } from "@/lib/auth";

// GET /api/dashboard — one call for the three hero metrics + Delta.
// Read-only: does NOT trigger a Fitbit sync (that's POST /api/fitbit/sync).
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Day + pace both keyed to the USER's timezone, never the server's.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      cutDelta: true,
      bulkDelta: true,
      hasWearable: true,
      targetProtein: true,
      targetCarbs: true,
      targetFat: true,
    },
  });
  // Defensive: authenticated but no profile row (e.g. onboarding skipped/failed).
  // Signal the client to send them through onboarding instead of 500-ing.
  if (!user) return NextResponse.json({ error: "no_profile" }, { status: 409 });
  const today = localDateOnly(user.timezone);

  const [target, todayLog, agg, streak] = await Promise.all([
    computeTarget(userId, today),
    prisma.dailyLog.findUnique({
      where: { userId_logDate: { userId, logDate: today } },
    }),
    prisma.foodLog.aggregate({
      where: { userId, logDate: today },
      _sum: { calories: true, proteinG: true, carbsG: true, fatG: true },
    }),
    computeStreak(userId, user.timezone),
  ]);

  const eaten = agg._sum.calories ?? 0;
  const delta = computeDelta({
    targetIntake: target.targetIntake,
    eaten,
    goal: target.goal,
    dayFraction: eatingDayFraction(localHourInTimeZone(user.timezone)),
  });

  // Macro targets: use the stored per-user goals if set, else derive from the
  // calorie target (30/35/35). Null when there's no target yet (no baseline).
  const stored =
    user.targetProtein != null && user.targetCarbs != null && user.targetFat != null
      ? { protein: user.targetProtein, carbs: user.targetCarbs, fat: user.targetFat }
      : null;
  const macroTargets =
    stored ?? (target.targetIntake != null ? defaultMacroTargets(target.targetIntake) : null);

  return NextResponse.json({
    hasWearable: user.hasWearable,
    streak,
    macroTargets,
    customTarget: target.customTarget,
    customMacros: stored !== null,
    burnedToday: todayLog?.caloriesOut ?? null,
    steps: todayLog?.steps ?? null,
    activeZoneMinutes: todayLog?.activeZoneMinutes ?? null,
    lastSyncedAt: todayLog?.syncedAt ?? null,
    eatenToday: eaten,
    macros: {
      protein: Number(agg._sum.proteinG ?? 0),
      carbs: Number(agg._sum.carbsG ?? 0),
      fat: Number(agg._sum.fatG ?? 0),
    },
    tdee: {
      value: target.tdee,
      daysUsed: target.daysUsed,
      estimating: target.estimating,
    },
    goal: target.goal,
    goalDelta: target.goalDelta,
    cutDelta: user.cutDelta,
    bulkDelta: user.bulkDelta,
    delta,
  });
}
