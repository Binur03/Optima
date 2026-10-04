import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { isoDay, localDateOnly } from "@/lib/datetime";
import { MAX_EXERCISE_NAME, MAX_SPLIT_NAME, cleanName, parseSets } from "@/lib/lifts";
import { addDay, isUniqueViolation, ownedProgram, resolveActiveProgram } from "@/lib/splits";

// GET /api/lifts/splits[?programId=] — a program's days → exercises, each with
// today's logged sets and the most recent PREVIOUS session (the "ghost" data).
// Without programId it returns the active program (what Train shows).
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, equipment: true },
  });
  const today = localDateOnly(user.timezone);

  const requested = req.nextUrl.searchParams.get("programId");
  const program = requested ? await ownedProgram(userId, requested) : await resolveActiveProgram(userId);
  if (requested && !program) return NextResponse.json({ error: "program_not_found" }, { status: 404 });

  const [splits, todayLogs, lastLogs, meta] = await Promise.all([
    program
      ? prisma.workoutSplit.findMany({
          where: { userId, programId: program.id },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            items: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              select: { exercise: { select: { id: true, name: true, kind: true } } },
            },
          },
        })
      : Promise.resolve([]),
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
    program ? prisma.workoutProgram.findUnique({ where: { id: program.id }, select: { isActive: true } }) : null,
  ]);

  const todayBy = new Map(todayLogs.map((l) => [l.exerciseId, parseSets(l.sets)]));
  const lastBy = new Map(lastLogs.map((l) => [l.exerciseId, l]));

  return NextResponse.json({
    today: isoDay(today),
    equipment: user.equipment,
    program: program ? { id: program.id, name: program.name, isActive: meta?.isActive ?? false } : null,
    splits: splits.map((s) => ({
      id: s.id,
      name: s.name,
      exercises: s.items.map(({ exercise: e }) => {
        const last = lastBy.get(e.id);
        return {
          id: e.id,
          name: e.name,
          kind: e.kind,
          today: todayBy.get(e.id) ?? [],
          last: last ? { date: isoDay(last.logDate), sets: parseSets(last.sets) } : null,
        };
      }),
    })),
  });
}

// POST /api/lifts/splits  { programId, name, exercises?: string[] } — adds a
// training day to the end of a program, optionally seeded with exercises.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { programId?: unknown; name?: unknown; exercises?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const program = typeof body.programId === "string" ? await ownedProgram(userId, body.programId) : null;
  if (!program) return NextResponse.json({ error: "program_not_found" }, { status: 404 });
  const name = cleanName(body.name, MAX_SPLIT_NAME);
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  const exercises = (Array.isArray(body.exercises) ? body.exercises : [])
    .map((e) => cleanName(e, MAX_EXERCISE_NAME))
    .filter((e): e is string => !!e)
    .slice(0, 20);

  try {
    const split = await addDay(userId, program.id, name, exercises);
    return NextResponse.json({ split });
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: "split_exists" }, { status: 409 });
    throw e;
  }
}
