import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { uploadMealImage } from "@/lib/storage";
import { localDateOnly } from "@/lib/datetime";

type Source = "AI_IMAGE" | "MANUAL" | "TEXT_SEARCH";

interface SaveBody {
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: Source;
  aiEstimated: boolean; // false once the user has edited the estimate
  imageUrl?: string | null; // may be a data: URL from the camera; uploaded below
  logDate?: string; // YYYY-MM-DD; defaults to the user's local day
}

// POST /api/food/log — persists a user-CONFIRMED entry to food_logs.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: SaveBody;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const name = (b.foodName ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_food_name" }, { status: 400 });

  const num = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : 0;
  };

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const logDate = b.logDate ? parseDateOnly(b.logDate) : localDateOnly(user.timezone);

  // Move any inline base64 photo to Supabase Storage; never persist base64 in the
  // table. If storage isn't configured (or upload fails), store null.
  let imageUrl: string | null = b.imageUrl ?? null;
  if (imageUrl && imageUrl.startsWith("data:")) {
    try {
      imageUrl = await uploadMealImage(userId, imageUrl);
    } catch {
      imageUrl = null;
    }
  }

  const row = await prisma.foodLog.create({
    data: {
      userId,
      logDate,
      foodName: name.slice(0, 120),
      calories: Math.round(num(b.calories)),
      proteinG: num(b.proteinG),
      carbsG: num(b.carbsG),
      fatG: num(b.fatG),
      source: b.source ?? "MANUAL",
      aiEstimated: Boolean(b.aiEstimated),
      imageUrl,
    },
  });

  return NextResponse.json({ saved: true, id: row.id });
}

function parseDateOnly(s: string): Date {
  const d = new Date(`${s}T00:00:00.000Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
