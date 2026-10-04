import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { MAX_EXERCISE_NAME, cleanName } from "@/lib/lifts";
import { addExercisesToSplit, ownedSplit, reorder, replaceInSplit } from "@/lib/splits";

type Ctx = { params: { id: string } };

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// POST /api/lifts/splits/[id]/exercises  { name } — adds a lift to the end of
// this split (reusing the user's existing lift of that name, if any).
export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedSplit(userId, params.id))) {
    return NextResponse.json({ error: "split_not_found" }, { status: 404 });
  }

  const body = await readBody(req);
  const name = cleanName(body?.name, MAX_EXERCISE_NAME);
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });

  await addExercisesToSplit(userId, params.id, [name]);
  return NextResponse.json({ ok: true });
}

// PATCH /api/lifts/splits/[id]/exercises
//   { exerciseId, move: -1 | 1 } reorders · { exerciseId, replaceWith } swaps in place
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedSplit(userId, params.id))) {
    return NextResponse.json({ error: "split_not_found" }, { status: 404 });
  }

  const body = await readBody(req);
  if (typeof body?.exerciseId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // { exerciseId, replaceWith } — swap for another lift in the same spot.
  if (body.replaceWith !== undefined) {
    const name = cleanName(body.replaceWith, MAX_EXERCISE_NAME);
    if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    const ok = await replaceInSplit(userId, params.id, body.exerciseId, name);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "exercise_not_found" }, { status: 404 });
  }

  const move = body.move;
  if (move !== 1 && move !== -1) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const items = await prisma.splitExercise.findMany({
    where: { splitId: params.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, exerciseId: true },
  });
  const target = items.find((x) => x.exerciseId === body.exerciseId);
  const next = target && reorder(items, target.id, move);
  if (next) {
    await prisma.$transaction(
      next.map((x, i) => prisma.splitExercise.update({ where: { id: x.id }, data: { sortOrder: i } }))
    );
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/lifts/splits/[id]/exercises  { exerciseId } — takes the lift out
// of this split only. Logged sets are kept (they still count toward charts and
// achievements), and re-adding the lift restores its ghost data.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedSplit(userId, params.id))) {
    return NextResponse.json({ error: "split_not_found" }, { status: 404 });
  }

  const body = await readBody(req);
  if (typeof body?.exerciseId !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  await prisma.splitExercise.deleteMany({ where: { splitId: params.id, exerciseId: body.exerciseId } });
  return NextResponse.json({ ok: true });
}
