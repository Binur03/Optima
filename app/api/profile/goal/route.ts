import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import type { Goal } from "@/lib/delta";

function clampDelta(n: number): number {
  return Math.max(-2000, Math.min(2000, Math.round(n)));
}

// POST /api/profile/goal  { goal?, cutDelta?, bulkDelta? }
// Switches the active goal and/or saves the user's custom Cut/Bulk offsets. The
// active goalDelta is always recomputed from the (new or existing) goal + the
// (new or existing) custom offsets — so switching a goal uses the saved custom
// value, not a hardcoded default.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { goal?: Goal; cutDelta?: number; bulkDelta?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (body.goal && !["CUT", "MAINTAIN", "BULK"].includes(body.goal)) {
    return NextResponse.json({ error: "invalid_goal" }, { status: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { goal: true, cutDelta: true, bulkDelta: true },
  });

  const goal = (body.goal ?? user.goal) as Goal;
  const cutDelta = typeof body.cutDelta === "number" ? clampDelta(body.cutDelta) : user.cutDelta;
  const bulkDelta = typeof body.bulkDelta === "number" ? clampDelta(body.bulkDelta) : user.bulkDelta;
  const goalDelta = goal === "CUT" ? cutDelta : goal === "BULK" ? bulkDelta : 0;

  await prisma.user.update({
    where: { id: userId },
    data: { goal, cutDelta, bulkDelta, goalDelta },
  });

  return NextResponse.json({ ok: true, goal, goalDelta, cutDelta, bulkDelta });
}
