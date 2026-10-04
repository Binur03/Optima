import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { MAX_PROGRAM_NAME, cleanName } from "@/lib/lifts";
import { activateProgram, isUniqueViolation, ownedProgram, reorder, resolveActiveProgram } from "@/lib/splits";

type Ctx = { params: { id: string } };

// PATCH /api/lifts/programs/[id]
//   { name } renames · { activate: true } switches to it · { move: -1 | 1 } reorders
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const program = await ownedProgram(userId, params.id);
  if (!program) return NextResponse.json({ error: "program_not_found" }, { status: 404 });

  let body: { name?: unknown; activate?: unknown; move?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (body.name !== undefined) {
    const name = cleanName(body.name, MAX_PROGRAM_NAME);
    if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    try {
      await prisma.workoutProgram.update({ where: { id: program.id }, data: { name } });
    } catch (e) {
      if (isUniqueViolation(e)) return NextResponse.json({ error: "program_exists" }, { status: 409 });
      throw e;
    }
  }

  if (body.activate === true) await activateProgram(userId, program.id);

  if (body.move === 1 || body.move === -1) {
    const all = await prisma.workoutProgram.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const next = reorder(all, program.id, body.move);
    if (next) {
      await prisma.$transaction(
        next.map((p, i) => prisma.workoutProgram.update({ where: { id: p.id }, data: { sortOrder: i } }))
      );
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/lifts/programs/[id] — deletes the program and its days. Logged
// sets are kept. If it was active, the next program takes over.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { count } = await prisma.workoutProgram.deleteMany({ where: { id: params.id, userId } });
  if (count === 0) return NextResponse.json({ error: "program_not_found" }, { status: 404 });
  await resolveActiveProgram(userId);
  return NextResponse.json({ ok: true });
}
