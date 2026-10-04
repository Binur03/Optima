import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { MAX_SPLIT_NAME, cleanName } from "@/lib/lifts";
import { isUniqueViolation, ownedSplit, reorder } from "@/lib/splits";

type Ctx = { params: { id: string } };

// PATCH /api/lifts/splits/[id]  { name? } renames · { move: -1 | 1 } reorders
// the day within its program.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const split = await ownedSplit(userId, params.id);
  if (!split) return NextResponse.json({ error: "split_not_found" }, { status: 404 });

  let body: { name?: unknown; move?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (body.name !== undefined) {
    const name = cleanName(body.name, MAX_SPLIT_NAME);
    if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    try {
      await prisma.workoutSplit.update({ where: { id: split.id }, data: { name } });
    } catch (e) {
      if (isUniqueViolation(e)) return NextResponse.json({ error: "split_exists" }, { status: 409 });
      throw e;
    }
  }

  if (body.move === 1 || body.move === -1) {
    const days = await prisma.workoutSplit.findMany({
      where: { userId, programId: split.programId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const next = reorder(days, split.id, body.move);
    if (next) {
      await prisma.$transaction(
        next.map((s, i) => prisma.workoutSplit.update({ where: { id: s.id }, data: { sortOrder: i } }))
      );
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/lifts/splits/[id] — removes the day. Its exercises and every
// logged set stay, so re-adding a lift later brings its history back.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { count } = await prisma.workoutSplit.deleteMany({ where: { id: params.id, userId } });
  if (count === 0) return NextResponse.json({ error: "split_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
