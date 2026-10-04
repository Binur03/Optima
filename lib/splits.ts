import { prisma } from "@/lib/db";

// The user's split, or null if it isn't theirs.
export function ownedSplit(userId: string, splitId: string) {
  return prisma.workoutSplit.findFirst({ where: { id: splitId, userId }, select: { id: true, name: true } });
}

// Appends exercises (by name) to a split. Names match the user's existing
// lifts case-insensitively, so "bench press" reuses "Bench Press" and its
// history; only genuinely new names create exercises. Already-present
// members are left where they are.
export async function addExercisesToSplit(userId: string, splitId: string, names: string[]) {
  const existing = await prisma.exercise.findMany({ where: { userId }, select: { id: true, name: true } });
  const byKey = new Map(existing.map((e) => [e.name.toLowerCase(), e.id]));

  const missing = [...new Set(names.filter((n) => !byKey.has(n.toLowerCase())))];
  if (missing.length > 0) {
    await prisma.exercise.createMany({
      data: missing.map((name) => ({ userId, name })),
      skipDuplicates: true,
    });
    const created = await prisma.exercise.findMany({
      where: { userId, name: { in: missing } },
      select: { id: true, name: true },
    });
    for (const e of created) byKey.set(e.name.toLowerCase(), e.id);
  }

  const last = await prisma.splitExercise.aggregate({ where: { splitId }, _max: { sortOrder: true } });
  let order = (last._max.sortOrder ?? -1) + 1;
  const ids = [...new Set(names.map((n) => byKey.get(n.toLowerCase())).filter((id): id is string => !!id))];
  await prisma.splitExercise.createMany({
    data: ids.map((exerciseId) => ({ splitId, exerciseId, sortOrder: order++ })),
    skipDuplicates: true,
  });
  return ids;
}

// Swaps an item with its neighbour and rewrites sort orders as 0..n-1.
export function reorder<T extends { id: string }>(items: T[], id: string, move: number): T[] | null {
  const i = items.findIndex((x) => x.id === id);
  const j = i + move;
  if (i < 0 || j < 0 || j >= items.length) return null;
  const out = [...items];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
