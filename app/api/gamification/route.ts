import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { syncProgress } from "@/lib/gamification";

// GET /api/gamification — evaluates recent activity, grants any XP / badges
// not yet earned (idempotent via the xp_events ledger), and returns level,
// quests, achievements, and what was newly awarded on this call.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await syncProgress(userId);
  if (!state) return NextResponse.json({ error: "no_profile" }, { status: 409 });
  return NextResponse.json(state);
}
