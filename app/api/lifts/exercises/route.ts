import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

// POST /api/lifts/exercises  { splitId, name }
// Adds an exercise to a split. If the user already has an exercise with that
// name (names are unique per user), it's moved into this split instead.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { splitId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const name = (body.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  const split = await prisma.workoutSplit.findFirst({
    where: { id: body.splitId ?? "", userId },
    select: { id: true, _count: { select: { exercises: true } } },
  });
  if (!split) return NextResponse.json({ error: "split_not_found" }, { status: 404 });

  const exercise = await prisma.exercise.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, splitId: split.id, name, sortOrder: split._count.exercises },
    update: { splitId: split.id },
    select: { id: true, name: true },
  });

  return NextResponse.json({ exercise });
}
