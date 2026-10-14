import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { addDays, localDateOnly } from "@/lib/datetime";
import { computeTarget } from "@/lib/tdee";
import { defaultMacroTargets } from "@/lib/nutrition";
import { planMeals } from "@/lib/gemini";
import { isSlot, remainingMacros, slotBudget } from "@/lib/mealPlan";

// AI calls (plus a fallback retry) can outlast the default function timeout.
export const maxDuration = 30;

const MIN_MEAL_KCAL = 150; // below this there's nothing worth planning

// POST /api/plan/suggest { slot, exclude?: string[] }
// Works out what's left today, gives this meal its share (dinner gets all of
// it), and asks Gemini for three different meals from the user's pantry —
// avoiding anything eaten in the last week or already shown.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { slot?: unknown; exclude?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!isSlot(body.slot)) return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
  const slot = body.slot;
  const exclude = (Array.isArray(body.exclude) ? body.exclude : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.slice(0, 80))
    .slice(0, 30);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, targetProtein: true, targetCarbs: true, targetFat: true },
  });
  const today = localDateOnly(user.timezone);

  const [target, eaten, pantry, recent] = await Promise.all([
    computeTarget(userId, today),
    prisma.foodLog.aggregate({
      where: { userId, logDate: today },
      _sum: { calories: true, proteinG: true, carbsG: true, fatG: true },
    }),
    prisma.pantryItem.findMany({ where: { userId }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.foodLog.findMany({
      where: { userId, logDate: { gte: addDays(today, -7) } },
      select: { foodName: true },
      distinct: ["foodName"],
      take: 40,
    }),
  ]);

  if (target.targetIntake == null) return NextResponse.json({ error: "no_target" }, { status: 409 });
  // Same macro goals the dashboard uses: stored grams if set, else a split of the calorie target.
  const macros =
    user.targetProtein != null && user.targetCarbs != null && user.targetFat != null
      ? { protein: user.targetProtein, carbs: user.targetCarbs, fat: user.targetFat }
      : defaultMacroTargets(target.targetIntake);

  const remaining = remainingMacros(
    { calories: target.targetIntake, ...macros },
    {
      calories: eaten._sum.calories ?? 0,
      protein: Number(eaten._sum.proteinG ?? 0),
      carbs: Number(eaten._sum.carbsG ?? 0),
      fat: Number(eaten._sum.fatG ?? 0),
    }
  );
  const { budget, closesDay } = slotBudget(remaining, slot);

  if (budget.calories < MIN_MEAL_KCAL) {
    return NextResponse.json({ slot, remaining, budget, closesDay, options: [], done: true });
  }

  try {
    const options = await planMeals({
      slot,
      budget,
      pantry: pantry.map((p) => p.name),
      avoid: [...new Set([...recent.map((r) => r.foodName), ...exclude])],
    });
    return NextResponse.json({ slot, remaining, budget, closesDay, options, done: false });
  } catch (err) {
    console.error("[plan/suggest] failed:", err instanceof Error ? err.message : err);
    const busy =
      err instanceof Error && /429|503|rate|quota|resource.?exhausted|overloaded|unavailable/i.test(err.message);
    return NextResponse.json({ error: busy ? "ai_busy" : "plan_failed" }, { status: busy ? 503 : 502 });
  }
}
