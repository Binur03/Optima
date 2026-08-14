import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

// GET /api/food/recents — the user's most recent DISTINCT meals (by name), with
// their last-used macros, for one-tap re-logging. Deduped in-app because Prisma
// can't do Postgres DISTINCT ON through the query client cleanly.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const recent = await prisma.foodLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 40, // scan window; dedupe below
    select: { foodName: true, calories: true, proteinG: true, carbsG: true, fatG: true },
  });

  const seen = new Set<string>();
  const recents: {
    foodName: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }[] = [];

  for (const m of recent) {
    const key = m.foodName.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    recents.push({
      foodName: m.foodName,
      calories: m.calories,
      proteinG: Number(m.proteinG),
      carbsG: Number(m.carbsG),
      fatG: Number(m.fatG),
    });
    if (recents.length >= 8) break;
  }

  return NextResponse.json({ recents });
}
