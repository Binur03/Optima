import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

// POST /api/profile/targets
//   { calories: number | null, macros: { protein, carbs, fat } | null }
// calories null → back to maintenance + goal offset.
// macros null   → back to the automatic split of the calorie target.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { calories?: unknown; macros?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const int = (v: unknown, min: number, max: number): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
  };

  let customCalories: number | null = null;
  if (body.calories !== null && body.calories !== undefined) {
    customCalories = int(body.calories, 800, 8000);
    if (customCalories === null) return NextResponse.json({ error: "invalid_calories" }, { status: 400 });
  }

  let macros: { protein: number; carbs: number; fat: number } | null = null;
  if (body.macros !== null && body.macros !== undefined) {
    const m = body.macros as Record<string, unknown>;
    const protein = int(m.protein, 0, 1000);
    const carbs = int(m.carbs, 0, 1500);
    const fat = int(m.fat, 0, 600);
    if (protein === null || carbs === null || fat === null) {
      return NextResponse.json({ error: "invalid_macros" }, { status: 400 });
    }
    macros = { protein, carbs, fat };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      customCalories,
      targetProtein: macros?.protein ?? null,
      targetCarbs: macros?.carbs ?? null,
      targetFat: macros?.fat ?? null,
    },
  });
  return NextResponse.json({ ok: true, customCalories, macros });
}
