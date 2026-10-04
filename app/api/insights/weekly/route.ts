import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { computeTarget } from "@/lib/tdee";
import { defaultMacroTargets } from "@/lib/nutrition";
import { weeklyInsight, type WeeklyStat } from "@/lib/gemini";
import { localDateOnly } from "@/lib/datetime";

// AI calls (plus a fallback retry) can outlast the default function timeout.
export const maxDuration = 30;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const o = new Date(d);
  o.setUTCDate(o.getUTCDate() + n);
  return o;
}

// GET /api/insights/weekly — an empathetic weekly coaching note. Generated at
// most once per week (cached on the user row) to save API calls.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      timezone: true,
      targetProtein: true,
      targetCarbs: true,
      targetFat: true,
      weeklyInsight: true,
      weeklyInsightAt: true,
    },
  });

  // Serve the cached note if it's less than a week old.
  if (
    user.weeklyInsight &&
    user.weeklyInsightAt &&
    Date.now() - user.weeklyInsightAt.getTime() < WEEK_MS
  ) {
    return NextResponse.json({ insight: user.weeklyInsight, cached: true });
  }

  const today = localDateOnly(user.timezone);
  const start = addDays(today, -6);

  const [target, grouped] = await Promise.all([
    computeTarget(userId, today),
    prisma.foodLog.groupBy({
      by: ["logDate"],
      where: { userId, logDate: { gte: start, lte: today } },
      _sum: { calories: true, proteinG: true, carbsG: true, fatG: true },
    }),
  ]);

  if (target.targetIntake === null) {
    return NextResponse.json({ insight: null, message: "Set your baseline to unlock weekly reviews." });
  }
  if (grouped.length < 2) {
    return NextResponse.json({
      insight: null,
      message: "Log a couple more days to unlock your weekly review.",
    });
  }

  const byDate = new Map(grouped.map((g) => [isoDate(g.logDate), g]));
  const days: WeeklyStat[] = [];
  for (let i = 6; i >= 0; i--) {
    const g = byDate.get(isoDate(addDays(today, -i)));
    days.push({
      date: isoDate(addDays(today, -i)),
      calories: g?._sum.calories ?? 0,
      protein: Number(g?._sum.proteinG ?? 0),
      carbs: Number(g?._sum.carbsG ?? 0),
      fat: Number(g?._sum.fatG ?? 0),
    });
  }

  const macroTargets =
    user.targetProtein != null && user.targetCarbs != null && user.targetFat != null
      ? { protein: user.targetProtein, carbs: user.targetCarbs, fat: user.targetFat }
      : defaultMacroTargets(target.targetIntake);

  try {
    const insight = await weeklyInsight({ calorieTarget: target.targetIntake, macroTargets, days });
    await prisma.user.update({
      where: { id: userId },
      data: { weeklyInsight: insight, weeklyInsightAt: new Date() },
    });
    return NextResponse.json({ insight, cached: false });
  } catch (err) {
    const rateLimited = err instanceof Error && /429|rate|quota|resource_exhausted/i.test(err.message);
    return NextResponse.json(
      { insight: user.weeklyInsight ?? null, error: rateLimited ? "rate_limited" : "insight_failed" },
      { status: rateLimited ? 429 : 502 }
    );
  }
}
