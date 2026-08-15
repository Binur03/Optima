import { prisma } from "@/lib/db";
import { localDateOnly } from "@/lib/datetime";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

// Current logging streak: consecutive days (in the user's timezone) with at
// least one food log. The streak only BREAKS if nothing was logged yesterday —
// today counts as a grace day, so an un-logged "today" doesn't kill the streak
// until it becomes yesterday.
export async function computeStreak(userId: string, timezone: string): Promise<number> {
  const today = localDateOnly(timezone);
  const since = addDays(today, -60); // scan window is plenty for a display streak

  const rows = await prisma.foodLog.findMany({
    where: { userId, logDate: { gte: since } },
    select: { logDate: true },
    distinct: ["logDate"],
  });
  const logged = new Set(rows.map((r) => isoDate(r.logDate)));

  // Anchor at today if it has a log, else yesterday (grace); if neither, no streak.
  let cursor: Date;
  if (logged.has(isoDate(today))) cursor = today;
  else if (logged.has(isoDate(addDays(today, -1)))) cursor = addDays(today, -1);
  else return 0;

  let streak = 0;
  while (logged.has(isoDate(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
