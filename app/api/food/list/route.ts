import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { localDateOnly } from "@/lib/datetime";

// GET /api/food/list?date=YYYY-MM-DD — the day's logged meals (defaults to today).
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });

  const dateParam = new URL(req.url).searchParams.get("date");
  const base = dateParam ? new Date(`${dateParam}T00:00:00.000Z`) : localDateOnly(user.timezone);
  const logDate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));

  const meals = await prisma.foodLog.findMany({
    where: { userId, logDate },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      foodName: true,
      calories: true,
      proteinG: true,
      carbsG: true,
      fatG: true,
      source: true,
      aiEstimated: true,
    },
  });

  return NextResponse.json({
    meals: meals.map((m) => ({
      id: m.id,
      foodName: m.foodName,
      calories: m.calories,
      proteinG: Number(m.proteinG),
      carbsG: Number(m.carbsG),
      fatG: Number(m.fatG),
      source: m.source,
      aiEstimated: m.aiEstimated,
    })),
  });
}
