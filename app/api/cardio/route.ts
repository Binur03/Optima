import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { localDateOnly, parseDay } from "@/lib/datetime";
import { CARDIO_ACTIVITIES } from "@/lib/cardio";

async function userDay(userId: string, date: string | null) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  return parseDay(date) ?? localDateOnly(user.timezone);
}

// GET /api/cardio[?date=YYYY-MM-DD] — the day's cardio (defaults to today).
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const logDate = await userDay(userId, req.nextUrl.searchParams.get("date"));
  const rows = await prisma.cardioLog.findMany({
    where: { userId, logDate },
    orderBy: { createdAt: "asc" },
    select: { id: true, activity: true, minutes: true, distanceKm: true, steps: true, createdAt: true },
  });
  return NextResponse.json({
    entries: rows.map((r) => ({ ...r, distanceKm: r.distanceKm === null ? null : Number(r.distanceKm) })),
  });
}

// POST /api/cardio { activity, minutes, distanceKm?, steps? } — logs to today.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: { activity?: unknown; minutes?: unknown; distanceKm?: unknown; steps?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!CARDIO_ACTIVITIES.some((a) => a.key === b.activity)) {
    return NextResponse.json({ error: "invalid_activity" }, { status: 400 });
  }
  const minutes = Math.round(Number(b.minutes));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600) {
    return NextResponse.json({ error: "invalid_minutes" }, { status: 400 });
  }
  const optional = (v: unknown, max: number) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= max ? n : undefined;
  };
  const distanceKm = optional(b.distanceKm, 500);
  const steps = optional(b.steps, 100_000);
  if (distanceKm === undefined || steps === undefined) {
    return NextResponse.json({ error: "invalid_value" }, { status: 400 });
  }

  const row = await prisma.cardioLog.create({
    data: {
      userId,
      logDate: await userDay(userId, null),
      activity: b.activity as string,
      minutes,
      distanceKm: distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
      steps: steps === null ? null : Math.round(steps),
    },
    select: { id: true },
  });
  return NextResponse.json({ id: row.id });
}
