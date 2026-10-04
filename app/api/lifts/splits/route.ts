import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { isoDay, localDateOnly } from "@/lib/datetime";
import { DEFAULT_SPLITS, MAX_EXERCISE_NAME, MAX_SPLIT_NAME, cleanName, parseSets } from "@/lib/lifts";
import { addExercisesToSplit } from "@/lib/splits";

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

  // Only brand-new users get the starter program — someone who deleted every
  // split on purpose shouldn't see Push/Pull/Legs come back.
  const [splitCount, exerciseCount] = await Promise.all([
    prisma.workoutSplit.count({ where: { userId } }),
    prisma.exercise.count({ where: { userId } }),
  ]);
  if (splitCount === 0 && exerciseCount === 0) await provisionDefaults(userId);

  const [splits, todayLogs, lastLogs] = await Promise.all([
    prisma.workoutSplit.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { exercise: { select: { id: true, name: true } } },
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
      exercises: s.items.map(({ exercise: e }) => {
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

// POST /api/lifts/splits  { name, exercises?: string[] } — adds a split at the
// end, optionally seeded with exercises (e.g. from a preset).
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { name?: unknown; exercises?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const name = cleanName(body.name, MAX_SPLIT_NAME);
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  const exercises = (Array.isArray(body.exercises) ? body.exercises : [])
    .map((e) => cleanName(e, MAX_EXERCISE_NAME))
    .filter((e): e is string => !!e)
    .slice(0, 20);

  const last = await prisma.workoutSplit.aggregate({ where: { userId }, _max: { sortOrder: true } });
  let split;
  try {
    split = await prisma.workoutSplit.create({
      data: { userId, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true, name: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "split_exists" }, { status: 409 });
    }
    throw e;
  }
  if (exercises.length > 0) await addExercisesToSplit(userId, split.id, exercises);
  return NextResponse.json({ split });
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
  for (const s of DEFAULT_SPLITS) {
    const id = created.find((c) => c.name === s.name)?.id;
    if (id) await addExercisesToSplit(userId, id, s.exercises);
  }
}
