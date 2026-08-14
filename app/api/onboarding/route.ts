import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { DEFAULT_GOAL_DELTAS } from "@/lib/goals";
import { isValidTimeZone } from "@/lib/datetime";
import type { Goal } from "@/lib/delta";

// POST /api/onboarding  { goal, goalDelta?, timezone? }
// Updates the AUTHENTICATED user's profile. Identity comes from the session
// (Supabase auth.uid), not a submitted email — the profile row is already
// provisioned by getCurrentUserId.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { goal?: Goal; goalDelta?: number; timezone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const goal = body.goal ?? "MAINTAIN";
  if (!["CUT", "MAINTAIN", "BULK"].includes(goal)) {
    return NextResponse.json({ error: "invalid_goal" }, { status: 400 });
  }

  const goalDelta =
    typeof body.goalDelta === "number" ? Math.round(body.goalDelta) : DEFAULT_GOAL_DELTAS[goal];
  const timezone = body.timezone && isValidTimeZone(body.timezone) ? body.timezone : undefined;

  await prisma.user.update({
    where: { id: userId },
    data: { goal, goalDelta, ...(timezone ? { timezone } : {}) },
  });

  return NextResponse.json({ ok: true, goal, goalDelta });
}
