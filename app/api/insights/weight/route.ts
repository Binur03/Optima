import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { addDays, isoDay, localDateOnly, parseDay } from "@/lib/datetime";

// GET /api/insights/weight — body-weight log (lb) for the last year, oldest first.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const today = localDateOnly(user.timezone);

  const logs = await prisma.weightLog.findMany({
    where: { userId, logDate: { gte: addDays(today, -365) } },
    orderBy: { logDate: "asc" },
    select: { logDate: true, weightLb: true },
  });

  return NextResponse.json({
    today: isoDay(today),
    points: logs.map((l) => ({ date: isoDay(l.logDate), weight: Number(l.weightLb) })),
  });
}

// POST /api/insights/weight  { weightLb, date? } — upserts one weigh-in per day.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { weightLb?: number; date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const weightLb = Number(body.weightLb);
  if (!Number.isFinite(weightLb) || weightLb < 50 || weightLb > 800) {
    return NextResponse.json({ error: "invalid_weight" }, { status: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const today = localDateOnly(user.timezone);
  const logDate = parseDay(body.date) ?? today;
  if (logDate > today) return NextResponse.json({ error: "future_date" }, { status: 400 });

  const value = Math.round(weightLb * 10) / 10;
  await prisma.weightLog.upsert({
    where: { userId_logDate: { userId, logDate } },
    create: { userId, logDate, weightLb: value },
    update: { weightLb: value },
  });

  return NextResponse.json({ ok: true, date: isoDay(logDate), weight: value });
}
