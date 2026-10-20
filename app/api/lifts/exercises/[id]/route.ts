import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { MAX_EXERCISE_NAME, cleanName } from "@/lib/lifts";
import { nameKey } from "@/lib/exerciseNames";

const KINDS = ["weight", "bodyweight", "duration"] as const;

// PATCH /api/lifts/exercises/[id]
//   { kind } — how this lift's sets are recorded (past sets keep their shape)
//   { name } — rename everywhere it appears. If another lift already has that
//              name, nothing changes and the reply names it so the app can
//              offer to merge the two.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { kind?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const owned = await prisma.exercise.findFirst({ where: { id: params.id, userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "exercise_not_found" }, { status: 404 });

  if (body.name !== undefined) {
    const name = cleanName(body.name, MAX_EXERCISE_NAME);
    if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    const others = await prisma.exercise.findMany({ where: { userId, id: { not: owned.id } }, select: { id: true, name: true } });
    const clash = others.find((o) => nameKey(o.name) === nameKey(name));
    if (clash) {
      return NextResponse.json({ error: "name_taken", conflictId: clash.id, conflictName: clash.name }, { status: 409 });
    }
    await prisma.exercise.update({ where: { id: owned.id }, data: { name } });
    return NextResponse.json({ ok: true });
  }

  if (!KINDS.includes(body.kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  await prisma.exercise.update({ where: { id: owned.id }, data: { kind: body.kind as string } });
  return NextResponse.json({ ok: true });
}
