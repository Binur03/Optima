import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

// GET /api/lifts/exercises — every lift the user has, with how many days list
// it and how many sessions it has (for suggestions, renames and merges).
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await prisma.exercise.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, kind: true, _count: { select: { splits: true, logs: true } } },
  });
  return NextResponse.json({
    exercises: rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, days: r._count.splits, sessions: r._count.logs })),
  });
}
