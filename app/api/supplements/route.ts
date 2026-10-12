import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { addDays, isoDay, localDateOnly } from "@/lib/datetime";
import { TIMES, isTimeOfDay } from "@/lib/supplements";

const ORDER = new Map(TIMES.map((t, i) => [t.key as string, i]));

// GET /api/supplements — today's checklist (with a 7-day history per item) and water.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true, waterGoalMl: true } });
  const today = localDateOnly(user.timezone);
  const since = addDays(today, -6);

  const [supplements, logs, water] = await Promise.all([
    prisma.supplement.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, dose: true, timeOfDay: true },
    }),
    prisma.supplementLog.findMany({
      where: { userId, logDate: { gte: since } },
      select: { supplementId: true, logDate: true, takenAt: true },
    }),
    prisma.waterLog.findMany({
      where: { userId, logDate: today },
      orderBy: { createdAt: "asc" },
      select: { id: true, amountMl: true, createdAt: true },
    }),
  ]);

  const days = Array.from({ length: 7 }, (_, i) => isoDay(addDays(since, i))); // oldest → today
  const taken = new Map(logs.map((l) => [`${l.supplementId}:${isoDay(l.logDate)}`, l.takenAt]));

  return NextResponse.json({
    today: isoDay(today),
    days,
    waterGoalMl: user.waterGoalMl,
    waterMl: water.reduce((s, w) => s + w.amountMl, 0),
    waterEntries: water,
    supplements: supplements
      .sort((a, b) => (ORDER.get(a.timeOfDay) ?? 9) - (ORDER.get(b.timeOfDay) ?? 9))
      .map((s) => ({
        ...s,
        takenAt: taken.get(`${s.id}:${isoDay(today)}`)?.toISOString() ?? null,
        week: days.map((d) => taken.has(`${s.id}:${d}`)),
      })),
  });
}

// POST /api/supplements { name, dose?, timeOfDay }
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: { name?: unknown; dose?: unknown; timeOfDay?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 60) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  const dose = typeof b.dose === "string" && b.dose.trim() ? b.dose.trim().slice(0, 40) : null;
  if (!isTimeOfDay(b.timeOfDay)) return NextResponse.json({ error: "invalid_time" }, { status: 400 });

  const last = await prisma.supplement.aggregate({ where: { userId }, _max: { sortOrder: true } });
  try {
    const s = await prisma.supplement.create({
      data: { userId, name, dose, timeOfDay: b.timeOfDay, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true },
    });
    return NextResponse.json({ id: s.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "supplement_exists" }, { status: 409 });
    }
    throw e;
  }
}
