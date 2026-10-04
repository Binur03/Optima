import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { isoDay, localDateOnly } from "@/lib/datetime";
import { DEFAULT_SPLITS, parseSets } from "@/lib/lifts";

// GET /api/lifts/splits — splits → exercises, each with today's logged sets and
// the most recent PREVIOUS session (the "ghost" data shown as placeholders).
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const today = localDateOnly(user.timezone);

  if ((await prisma.workoutSplit.count({ where: { userId } })) === 0) {
    await provisionDefaults(userId);
  }

  const [splits, todayLogs, lastLogs] = await Promise.all([
    prisma.workoutSplit.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        exercises: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true },
        },
      },
    }),
    prisma.workoutLog.findMany({
      where: { userId, logDate: today },
      select: { exerciseId: true, sets: true },
    }),
    // Latest log before today, one per exercise.
    prisma.workoutLog.findMany({
      where: { userId, logDate: { lt: today } },
      orderBy: { logDate: "desc" },
      distinct: ["exerciseId"],
      select: { exerciseId: true, logDate: true, sets: true },
    }),
  ]);

  const todayBy = new Map(todayLogs.map((l) => [l.exerciseId, parseSets(l.sets)]));
  const lastBy = new Map(lastLogs.map((l) => [l.exerciseId, l]));

  return NextResponse.json({
    today: isoDay(today),
    splits: splits.map((s) => ({
      id: s.id,
      name: s.name,
      exercises: s.exercises.map((e) => {
        const last = lastBy.get(e.id);
        return {
          id: e.id,
          name: e.name,
          today: todayBy.get(e.id) ?? [],
          last: last ? { date: isoDay(last.logDate), sets: parseSets(last.sets) } : null,
        };
      }),
    })),
  });
}

// skipDuplicates makes concurrent first loads safe against the unique keys.
async function provisionDefaults(userId: string) {
  await prisma.workoutSplit.createMany({
    data: DEFAULT_SPLITS.map((s, i) => ({ userId, name: s.name, sortOrder: i })),
    skipDuplicates: true,
  });
  const created = await prisma.workoutSplit.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const idByName = new Map(created.map((s) => [s.name, s.id]));
  await prisma.exercise.createMany({
    data: DEFAULT_SPLITS.flatMap((s) =>
      s.exercises.map((name, i) => ({
        userId,
        splitId: idByName.get(s.name) ?? null,
        name,
        sortOrder: i,
      }))
    ),
    skipDuplicates: true,
  });
}
