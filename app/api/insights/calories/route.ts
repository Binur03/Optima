import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { computeTarget } from "@/lib/tdee";
import { addDays, isoDay, localDateOnly } from "@/lib/datetime";

// GET /api/insights/calories — calories eaten per day for the last 7 days
// (user's timezone), plus the current daily target for the reference line.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const today = localDateOnly(user.timezone);
  const start = addDays(today, -6);

  const [grouped, target] = await Promise.all([
    prisma.foodLog.groupBy({
      by: ["logDate"],
      where: { userId, logDate: { gte: start, lte: today } },
      _sum: { calories: true },
    }),
    computeTarget(userId, today),
  ]);

  const byDay = new Map(grouped.map((g) => [isoDay(g.logDate), g._sum.calories ?? 0]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return {
      date: isoDay(d),
      // log_date is a UTC-midnight key for the user's local day.
      label: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      calories: byDay.get(isoDay(d)) ?? 0,
      isToday: i === 6,
    };
  });

  const logged = days.filter((d) => d.calories > 0);
  const average = logged.length
    ? Math.round(logged.reduce((s, d) => s + d.calories, 0) / logged.length)
    : null;

  return NextResponse.json({ days, target: target.targetIntake, average });
}
