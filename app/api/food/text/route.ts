import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { analyzeFoodText } from "@/lib/gemini";
import { localDateOnly } from "@/lib/datetime";

// POST /api/food/text  { text }
// Quick-add: estimate macros for a text meal (e.g. "Big Mac meal") via Gemini
// AND persist it to today's food_logs in one call. Unlike the photo/search flow,
// there's no editable review step — this is the fast path for standardized fast
// food. Saved as aiEstimated=true so it's flagged as an unconfirmed estimate.
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
  if (text.length < 2 || text.length > 200) {
    return NextResponse.json({ error: "invalid_text" }, { status: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });

  try {
    const est = await analyzeFoodText(text); // sanitized: finite, clamped, rounded
    const row = await prisma.foodLog.create({
      data: {
        userId,
        logDate: localDateOnly(user.timezone),
        foodName: est.food_name,
        calories: est.estimated_calories,
        proteinG: est.protein_g,
        carbsG: est.carbs_g,
        fatG: est.fat_g,
        source: "TEXT_SEARCH",
        aiEstimated: true,
      },
    });

    return NextResponse.json({
      saved: true,
      log: {
        id: row.id,
        foodName: est.food_name,
        calories: est.estimated_calories,
        proteinG: est.protein_g,
        carbsG: est.carbs_g,
        fatG: est.fat_g,
      },
    });
  } catch (err) {
    const rateLimited = err instanceof Error && /429|rate|quota|resource_exhausted/i.test(err.message);
    return NextResponse.json(
      { error: rateLimited ? "rate_limited" : "estimate_failed" },
      { status: rateLimited ? 429 : 502 }
    );
  }
}
