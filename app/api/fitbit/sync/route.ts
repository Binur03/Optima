import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  fetchBurnRange,
  HealthRateLimited,
  HealthReauthRequired,
} from "@/lib/googlehealth";
import { computeTarget } from "@/lib/tdee";
import { localDateOnly } from "@/lib/datetime";
import { getCurrentUserId } from "@/lib/auth";

const BACKFILL_DAYS = 7;

// POST /api/fitbit/sync — backfill the last 7 days of burn (calories + steps)
// from Google Health, upsert daily_logs, and return the refreshed rolling-TDEE
// target. Backfilling the whole window means the 7-day TDEE is populated on the
// very first sync instead of accruing one day at a time.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, hasWearable: true },
  });

  // Manual users have no wearable to pull from — skip the Google Health calls
  // entirely and just return their (manual) target.
  if (!user.hasWearable) {
    const target = await computeTarget(userId);
    return NextResponse.json({ skipped: true, target });
  }

  const today = localDateOnly(user.timezone);
  const start = addDays(today, -(BACKFILL_DAYS - 1));
  const endExclusive = addDays(today, 1); // rollup range end is exclusive

  try {
    const days = await fetchBurnRange(userId, isoDate(start), isoDate(endExclusive));

    await Promise.all(
      days.map((d) => {
        const logDate = parseDateOnly(d.date);
        return prisma.dailyLog.upsert({
          where: { userId_logDate: { userId, logDate } },
          create: {
            userId,
            logDate,
            caloriesOut: d.caloriesOut,
            steps: d.steps,
            activeZoneMinutes: null,
          },
          update: { caloriesOut: d.caloriesOut, steps: d.steps, syncedAt: new Date() },
        });
      })
    );

    const target = await computeTarget(userId, today);
    return NextResponse.json({ synced: true, days: days.length, target });
  } catch (err) {
    if (err instanceof HealthReauthRequired) {
      return NextResponse.json({ error: "reauth_required" }, { status: 409 });
    }
    if (err instanceof HealthRateLimited) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec: err.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSec) } }
      );
    }
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
function parseDateOnly(s: string): Date {
  const d = new Date(`${s}T00:00:00.000Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
