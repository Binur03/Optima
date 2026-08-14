import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { computeTarget } from "@/lib/tdee";
import { macroTargetsFromCalories, remainingMacros } from "@/lib/macros";
import { suggestMeals } from "@/lib/gemini";
import { localDateOnly } from "@/lib/datetime";

// GET /api/assistant/suggest — remaining macros for today + AI meal suggestions
// that help fill the gaps.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const today = localDateOnly(user.timezone);

  const [target, agg] = await Promise.all([
    computeTarget(userId, today),
    prisma.foodLog.aggregate({
      where: { userId, logDate: today },
      _sum: { calories: true, proteinG: true, carbsG: true, fatG: true },
    }),
  ]);

  if (target.targetIntake === null) {
    return NextResponse.json({
      error: "no_target",
      message: "Connect your wearable to set a calorie target first.",
    });
  }

  const eatenCals = agg._sum.calories ?? 0;
  const consumed = {
    protein: Number(agg._sum.proteinG ?? 0),
    carbs: Number(agg._sum.carbsG ?? 0),
    fat: Number(agg._sum.fatG ?? 0),
  };
  const macroTarget = macroTargetsFromCalories(target.targetIntake);
  const remaining = {
    calories: Math.max(0, target.targetIntake - eatenCals),
    ...remainingMacros(macroTarget, consumed),
  };

  try {
    const suggestions = await suggestMeals(remaining);
    return NextResponse.json({ remaining, macroTarget, suggestions });
  } catch (err) {
    const rateLimited = err instanceof Error && /429|rate|quota|resource_exhausted/i.test(err.message);
    return NextResponse.json(
      { error: rateLimited ? "rate_limited" : "suggest_failed", remaining },
      { status: rateLimited ? 429 : 502 }
    );
  }
}
