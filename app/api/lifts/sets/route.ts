import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { localDateOnly } from "@/lib/datetime";
import { parseSets, type LiftSet } from "@/lib/lifts";

async function context(req: NextRequest, exerciseId: unknown) {
  const userId = await getCurrentUserId(req);
  if (!userId) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const owned = await prisma.exercise.findFirst({
    where: { id: typeof exerciseId === "string" ? exerciseId : "", userId },
    select: { id: true, kind: true },
  });
  if (!owned) return { error: NextResponse.json({ error: "exercise_not_found" }, { status: 404 }) };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  return { userId, exerciseId: owned.id, kind: owned.kind, today: localDateOnly(user.timezone) };
}

async function todaysSets(userId: string, exerciseId: string, today: Date): Promise<LiftSet[]> {
  const log = await prisma.workoutLog.findUnique({
    where: { userId_exerciseId_logDate: { userId, exerciseId, logDate: today } },
    select: { sets: true },
  });
  return parseSets(log?.sets);
}

// POST /api/lifts/sets — appends one set to today.
//   weighted / bodyweight: { exerciseId, weight, reps } (bodyweight weight = added lb, may be negative)
//   timed hold:            { exerciseId, seconds }
export async function POST(req: NextRequest) {
  let body: { exerciseId?: string; weight?: number; reps?: number; seconds?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const ctx = await context(req, body.exerciseId);
  if ("error" in ctx) return ctx.error;

  let set: string;
  if (ctx.kind === "duration") {
    const seconds = Math.round(Number(body.seconds));
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 7200) {
      return NextResponse.json({ error: "invalid_set" }, { status: 400 });
    }
    set = JSON.stringify([{ seconds }]);
  } else {
    const weight = Number(body.weight ?? 0);
    const reps = Number(body.reps);
    const minWeight = ctx.kind === "bodyweight" ? -500 : 0; // assisted pull-ups go negative
    if (!Number.isFinite(weight) || weight < minWeight || weight > 2000 || !Number.isInteger(reps) || reps < 1 || reps > 200) {
      return NextResponse.json({ error: "invalid_set" }, { status: 400 });
    }
    set = JSON.stringify([{ weight: Math.round(weight * 4) / 4, reps }]);
  }

  // Atomic append — rapid confirm taps can't overwrite each other.
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO workout_logs (id, user_id, exercise_id, log_date, sets, updated_at)
    VALUES (gen_random_uuid()::text, ${ctx.userId}, ${ctx.exerciseId}, ${ctx.today}::date, ${set}::jsonb, now())
    ON CONFLICT (user_id, exercise_id, log_date)
    DO UPDATE SET sets = workout_logs.sets || EXCLUDED.sets, updated_at = now()
  `);

  return NextResponse.json({ today: await todaysSets(ctx.userId, ctx.exerciseId, ctx.today) });
}

// DELETE /api/lifts/sets  { exerciseId, index } — removes one of today's sets.
export async function DELETE(req: NextRequest) {
  let body: { exerciseId?: string; index?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const ctx = await context(req, body.exerciseId);
  if ("error" in ctx) return ctx.error;

  const sets = await todaysSets(ctx.userId, ctx.exerciseId, ctx.today);
  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= sets.length) {
    return NextResponse.json({ error: "invalid_index" }, { status: 400 });
  }
  sets.splice(index, 1);

  const where = {
    userId_exerciseId_logDate: { userId: ctx.userId, exerciseId: ctx.exerciseId, logDate: ctx.today },
  };
  if (sets.length === 0) await prisma.workoutLog.delete({ where });
  else await prisma.workoutLog.update({ where, data: { sets: sets as unknown as Prisma.InputJsonValue } });

  return NextResponse.json({ today: sets });
}
