import { prisma } from "@/lib/db";

export interface TdeeResult {
  tdee: number | null;        // rolling maintenance estimate
  daysUsed: number;           // how many days fed the average (0-7)
  estimating: boolean;        // true until we have a full 7-day window
}

export interface TargetResult extends TdeeResult {
  goal: "CUT" | "MAINTAIN" | "BULK";
  goalDelta: number;
  targetIntake: number | null; // user's custom target, else tdee + goalDelta
  customTarget: boolean;
}

const WINDOW = 7;

// Days below this are treated as bad data: the Charge 6 wasn't worn, or failed
// to sync, so caloriesOut never accrued a full day of BMR + activity. Even a
// sedentary adult burns well above this, so anything under it is noise, not a
// real maintenance signal — excluding it keeps the baseline honest.
const MIN_VALID_CALORIES_OUT = 1200;

// 7-day rolling average of caloriesOut, ending on `endDate` (inclusive).
// Averages only VALID days (non-null, above the wear-detection floor) and
// divides by the count of valid days — never a fixed 7 — so a missed sync or
// an unworn day doesn't drag the baseline toward zero.
export async function computeRollingTdee(
  userId: string,
  endDate: Date = new Date()
): Promise<TdeeResult> {
  const start = new Date(endDate);
  start.setDate(start.getDate() - (WINDOW - 1));

  const rows = await prisma.dailyLog.findMany({
    where: {
      userId,
      logDate: { gte: toDateOnly(start), lte: toDateOnly(endDate) },
      caloriesOut: { gte: MIN_VALID_CALORIES_OUT }, // filters null AND abnormally low
    },
    select: { caloriesOut: true },
  });

  const values = rows.map((r) => r.caloriesOut!);
  if (values.length === 0) {
    return { tdee: null, daysUsed: 0, estimating: true };
  }

  const validDaysCount = values.length;
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / validDaysCount);
  return { tdee: avg, daysUsed: validDaysCount, estimating: validDaysCount < WINDOW };
}

export async function computeTarget(
  userId: string,
  endDate: Date = new Date()
): Promise<TargetResult> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { goal: true, goalDelta: true, hasWearable: true, manualTdee: true, customCalories: true },
  });

  // Manual users: maintenance is the stored Mifflin-St Jeor estimate. Wearable
  // users: the 7-day rolling average of actual burn.
  const tdeeResult: TdeeResult =
    !user.hasWearable && user.manualTdee != null
      ? { tdee: user.manualTdee, daysUsed: 0, estimating: false }
      : await computeRollingTdee(userId, endDate);

  // A calorie target the user picked themselves wins over the computed one.
  const customTarget = user.customCalories != null;
  const targetIntake =
    user.customCalories ?? (tdeeResult.tdee === null ? null : tdeeResult.tdee + user.goalDelta);

  return { ...tdeeResult, goal: user.goal, goalDelta: user.goalDelta, targetIntake, customTarget };
}

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
