import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { analyzeMealItems } from "@/lib/gemini";
import { localDateOnly } from "@/lib/datetime";

// AI calls (plus a fallback retry) can outlast the default function timeout.
export const maxDuration = 30;

// POST /api/food/nlp  { text }
// Natural-language / voice quick-log: Gemini splits the description into food
// items, and we persist ALL of them to today's log in one shot (no edit step).
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (text.length < 2 || text.length > 500) {
    return NextResponse.json({ error: "invalid_text" }, { status: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const logDate = localDateOnly(user.timezone);

  try {
    const items = await analyzeMealItems(text);
    if (items.length === 0) {
      return NextResponse.json({ error: "no_items" }, { status: 422 });
    }

    await prisma.foodLog.createMany({
      data: items.map((i) => ({
        userId,
        logDate,
        foodName: i.food_name,
        calories: i.estimated_calories,
        proteinG: i.protein_g,
        carbsG: i.carbs_g,
        fatG: i.fat_g,
        source: "TEXT_SEARCH" as const,
        aiEstimated: true,
      })),
    });

    const totals = items.reduce(
      (a, i) => ({
        calories: a.calories + i.estimated_calories,
        protein: a.protein + i.protein_g,
        carbs: a.carbs + i.carbs_g,
        fat: a.fat + i.fat_g,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    return NextResponse.json({
      saved: items.length,
      items: items.map((i) => ({ foodName: i.food_name, calories: i.estimated_calories })),
      totals,
    });
  } catch (err) {
    console.error("[food/nlp] failed:", err instanceof Error ? err.message : err);
    const busy =
      err instanceof Error && /429|503|rate|quota|resource.?exhausted|overloaded|unavailable/i.test(err.message);
    return NextResponse.json({ error: busy ? "ai_busy" : "nlp_failed" }, { status: busy ? 503 : 502 });
  }
}
