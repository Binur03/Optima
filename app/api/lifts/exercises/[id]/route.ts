import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

const KINDS = ["weight", "bodyweight", "duration"] as const;

// PATCH /api/lifts/exercises/[id]  { kind } — how this lift's sets are recorded.
// Past sets keep their shape; only new sets use the new kind.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { kind?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!KINDS.includes(body.kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const { count } = await prisma.exercise.updateMany({
    where: { id: params.id, userId },
    data: { kind: body.kind as string },
  });
  if (count === 0) return NextResponse.json({ error: "exercise_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
