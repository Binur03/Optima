import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { mergeExercises } from "@/lib/splits";

// POST /api/lifts/exercises/merge { fromId, intoId }
// "These are the same lift": keeps `intoId`, moves all of `fromId`'s history and
// day placements onto it, and deletes `fromId`.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: { fromId?: unknown; intoId?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof b.fromId !== "string" || typeof b.intoId !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const ok = await mergeExercises(userId, b.fromId, b.intoId);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
