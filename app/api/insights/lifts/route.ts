import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { addDays, isoDay, localDateOnly } from "@/lib/datetime";
import { bestE1RM, parseSets, totalVolume } from "@/lib/lifts";

// GET /api/insights/lifts?exerciseId=… — strength progression over ~3 months:
// per-session best estimated 1RM (Epley) and total volume for one exercise,
// plus the list of exercises that have history (for the picker).
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const start = addDays(localDateOnly(user.timezone), -90);

  const sessions = await prisma.workoutLog.groupBy({
    by: ["exerciseId"],
    where: { userId, logDate: { gte: start } },
    _count: { _all: true },
  });
  const names = await prisma.exercise.findMany({
    where: { userId, id: { in: sessions.map((s) => s.exerciseId) } },
    select: { id: true, name: true },
  });
  const nameBy = new Map(names.map((n) => [n.id, n.name]));
  const exercises = sessions
    .filter((s) => nameBy.has(s.exerciseId))
    .map((s) => ({ id: s.exerciseId, name: nameBy.get(s.exerciseId)!, sessions: s._count._all }))
    .sort((a, b) => b.sessions - a.sessions);

  const requested = new URL(req.url).searchParams.get("exerciseId");
  const selectedId = exercises.some((e) => e.id === requested) ? requested! : exercises[0]?.id ?? null;
  if (!selectedId) return NextResponse.json({ exercises, selectedId: null, points: [] });

  const logs = await prisma.workoutLog.findMany({
    where: { userId, exerciseId: selectedId, logDate: { gte: start } },
    orderBy: { logDate: "asc" },
    select: { logDate: true, sets: true },
  });

  const points = logs
    .map((l) => {
      const sets = parseSets(l.sets);
      const top = sets.reduce((a, s) => (s.weight > a.weight || (s.weight === a.weight && s.reps > a.reps) ? s : a), sets[0]);
      return {
        date: isoDay(l.logDate),
        e1rm: Math.round(bestE1RM(sets)),
        volume: Math.round(totalVolume(sets)),
        top: top ? `${top.weight} × ${top.reps}` : "",
      };
    })
    .filter((p) => p.e1rm > 0);

  return NextResponse.json({ exercises, selectedId, points });
}
