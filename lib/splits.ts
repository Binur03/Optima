import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_SPLITS, PROGRAM_TEMPLATES, presetDay } from "@/lib/lifts";
import { kindFor } from "@/lib/exerciseCatalog";
import { nameKey } from "@/lib/exerciseNames";

// Folds one lift into another: every logged set moves over (same-day sessions
// are combined), every day it was on now lists the kept lift instead (in the
// same position), and the duplicate is deleted. One transaction.
export async function mergeExercises(userId: string, fromId: string, intoId: string) {
  if (fromId === intoId) return false;
  const owned = await prisma.exercise.findMany({ where: { userId, id: { in: [fromId, intoId] } }, select: { id: true } });
  if (owned.length !== 2) return false;

  await prisma.$transaction([
    // Same day on both → append the duplicate's sets to the kept session.
    prisma.$executeRaw(Prisma.sql`
      UPDATE workout_logs AS keep
      SET sets = keep.sets || dup.sets, updated_at = now()
      FROM workout_logs AS dup
      WHERE keep.exercise_id = ${intoId} AND dup.exercise_id = ${fromId}
        AND keep.user_id = ${userId} AND dup.user_id = ${userId}
        AND keep.log_date = dup.log_date`),
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM workout_logs AS dup
      USING workout_logs AS keep
      WHERE dup.exercise_id = ${fromId} AND keep.exercise_id = ${intoId}
        AND dup.user_id = ${userId} AND keep.log_date = dup.log_date`),
    // Every other day's log simply changes owner.
    prisma.workoutLog.updateMany({ where: { userId, exerciseId: fromId }, data: { exerciseId: intoId } }),
    // Days that already list the kept lift drop the duplicate; the rest swap it in place.
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM split_exercises AS dup
      USING split_exercises AS keep
      WHERE dup.exercise_id = ${fromId} AND keep.exercise_id = ${intoId} AND keep.split_id = dup.split_id`),
    prisma.splitExercise.updateMany({ where: { exerciseId: fromId }, data: { exerciseId: intoId } }),
    prisma.exercise.delete({ where: { id: fromId } }),
  ]);
  return true;
}

// The user's split, or null if it isn't theirs.
export function ownedSplit(userId: string, splitId: string) {
  return prisma.workoutSplit.findFirst({
    where: { id: splitId, userId },
    select: { id: true, name: true, programId: true },
  });
}

export function ownedProgram(userId: string, programId: string) {
  return prisma.workoutProgram.findFirst({
    where: { id: programId, userId },
    select: { id: true, name: true, isActive: true },
  });
}

export function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// Appends exercises (by name) to a split. Names match the user's existing
// lifts case-insensitively, so "bench press" reuses "Bench Press" and its
// history; only genuinely new names create exercises. Already-present
// members are left where they are.
export async function addExercisesToSplit(userId: string, splitId: string, names: string[]) {
  const existing = await prisma.exercise.findMany({ where: { userId }, select: { id: true, name: true } });
  // "pull ups" finds "Pull-Up": spacing, punctuation, case and plurals don't split a lift in two.
  const byKey = new Map(existing.map((e) => [nameKey(e.name), e.id]));

  const missing = [...new Map(names.filter((n) => !byKey.has(nameKey(n))).map((n) => [nameKey(n), n])).values()];
  if (missing.length > 0) {
    await prisma.exercise.createMany({
      // Planks become timed, push-ups bodyweight, everything else weight × reps.
      data: missing.map((name) => ({ userId, name, kind: kindFor(name) })),
      skipDuplicates: true,
    });
    const created = await prisma.exercise.findMany({
      where: { userId, name: { in: missing } },
      select: { id: true, name: true },
    });
    for (const e of created) byKey.set(nameKey(e.name), e.id);
  }

  const last = await prisma.splitExercise.aggregate({ where: { splitId }, _max: { sortOrder: true } });
  let order = (last._max.sortOrder ?? -1) + 1;
  const ids = [...new Set(names.map((n) => byKey.get(nameKey(n))).filter((id): id is string => !!id))];
  await prisma.splitExercise.createMany({
    data: ids.map((exerciseId) => ({ splitId, exerciseId, sortOrder: order++ })),
    skipDuplicates: true,
  });
  return ids;
}

// Swaps one lift in a day for another (e.g. Bench Press → Push-Up), keeping its
// position. The old lift's history is untouched; only the day's line-up changes.
export async function replaceInSplit(userId: string, splitId: string, exerciseId: string, replacement: string) {
  const current = await prisma.splitExercise.findUnique({
    where: { splitId_exerciseId: { splitId, exerciseId } },
    select: { id: true, sortOrder: true },
  });
  if (!current) return false;
  const [newId] = await addExercisesToSplit(userId, splitId, [replacement]);
  if (!newId || newId === exerciseId) return true;
  await prisma.$transaction([
    prisma.splitExercise.update({
      where: { splitId_exerciseId: { splitId, exerciseId: newId } },
      data: { sortOrder: current.sortOrder },
    }),
    prisma.splitExercise.delete({ where: { id: current.id } }),
  ]);
  return true;
}

// Adds a day to the end of a program, optionally seeded with exercises.
export async function addDay(userId: string, programId: string, name: string, exercises: string[]) {
  const last = await prisma.workoutSplit.aggregate({ where: { programId }, _max: { sortOrder: true } });
  const split = await prisma.workoutSplit.create({
    data: { userId, programId, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    select: { id: true, name: true },
  });
  if (exercises.length > 0) await addExercisesToSplit(userId, split.id, exercises);
  return split;
}

// Makes one program active and every other one inactive.
export async function activateProgram(userId: string, programId: string) {
  await prisma.$transaction([
    prisma.workoutProgram.updateMany({ where: { userId, id: { not: programId } }, data: { isActive: false } }),
    prisma.workoutProgram.update({ where: { id: programId }, data: { isActive: true } }),
  ]);
}

// Creates a program (from a template key, or empty) at the end of the list.
export async function createProgram(userId: string, name: string, templateKey: string | null, activate: boolean) {
  const last = await prisma.workoutProgram.aggregate({ where: { userId }, _max: { sortOrder: true } });
  const program = await prisma.workoutProgram.create({
    data: { userId, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    select: { id: true, name: true },
  });
  const templateDays = (PROGRAM_TEMPLATES.find((t) => t.key === templateKey)?.days ?? [])
    .map((d) => presetDay(d))
    .filter((d): d is NonNullable<typeof d> => !!d);
  const days = templateKey === "__default" ? DEFAULT_SPLITS : templateDays;
  for (const d of days) await addDay(userId, program.id, d.name, d.exercises);
  if (activate) await activateProgram(userId, program.id);
  return program;
}

// The program Train shows. Repairs state if none is flagged active, and
// gives brand-new users a starter Push / Pull / Legs.
export async function resolveActiveProgram(userId: string) {
  const active = await prisma.workoutProgram.findFirst({ where: { userId, isActive: true }, select: { id: true, name: true } });
  if (active) return active;

  const first = await prisma.workoutProgram.findFirst({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });
  if (first) {
    await activateProgram(userId, first.id);
    return first;
  }

  // Only brand-new users get the starter program — someone who deleted every
  // program on purpose shouldn't see one come back.
  if ((await prisma.exercise.count({ where: { userId } })) > 0) return null;
  try {
    return await createProgram(userId, "Push / Pull / Legs", "__default", true);
  } catch (e) {
    // A concurrent first load already created it.
    if (isUniqueViolation(e)) return prisma.workoutProgram.findFirst({ where: { userId }, select: { id: true, name: true } });
    throw e;
  }
}

// Swaps an item with its neighbour; the caller rewrites sort orders as 0..n-1.
export function reorder<T extends { id: string }>(items: T[], id: string, move: number): T[] | null {
  const i = items.findIndex((x) => x.id === id);
  const j = i + move;
  if (i < 0 || j < 0 || j >= items.length) return null;
  const out = [...items];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
