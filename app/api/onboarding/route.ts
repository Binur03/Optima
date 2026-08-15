import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { DEFAULT_GOAL_DELTAS } from "@/lib/goals";
import { isValidTimeZone } from "@/lib/datetime";
import { defaultMacroTargets } from "@/lib/nutrition";
import type { Goal } from "@/lib/delta";

const SEXES = ["MALE", "FEMALE", "OTHER"] as const;
const ACTIVITIES = ["sedentary", "light", "moderate", "active", "very_active"] as const;

// POST /api/onboarding
// Wearable users: { goal, goalDelta?, timezone?, hasWearable:true }
// Manual users:   { ...+ age, sex, heightCm, weightKg, activityLevel, manualTdee }
// Updates the authenticated user's profile; for manual users also stores the
// Mifflin-St Jeor maintenance and derived macro targets.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    goal?: Goal;
    goalDelta?: number;
    timezone?: string;
    hasWearable?: boolean;
    age?: number;
    sex?: string;
    heightCm?: number;
    weightKg?: number;
    activityLevel?: string;
    manualTdee?: number;
  };
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
  const hasWearable = Boolean(body.hasWearable);
  const posNum = (v: unknown): number | undefined => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : undefined;
  };

  const data: Prisma.UserUpdateInput = {
    goal,
    goalDelta,
    hasWearable,
    ...(timezone ? { timezone } : {}),
  };

  if (hasWearable) {
    // Rolling TDEE will drive the target; clear any prior manual value.
    data.manualTdee = null;
  } else {
    const age = posNum(body.age);
    const heightCm = posNum(body.heightCm);
    const weightKg = posNum(body.weightKg);
    const manualTdee = posNum(body.manualTdee);
    const sex = SEXES.includes(body.sex as (typeof SEXES)[number])
      ? (body.sex as (typeof SEXES)[number])
      : undefined;
    const activityLevel = ACTIVITIES.includes(body.activityLevel as (typeof ACTIVITIES)[number])
      ? (body.activityLevel as string)
      : undefined;

    if (age !== undefined) data.age = Math.round(age);
    if (heightCm !== undefined) data.heightCm = Math.round(heightCm);
    if (weightKg !== undefined) data.weightKg = weightKg;
    if (sex) data.sex = sex;
    if (activityLevel) data.activityLevel = activityLevel;

    if (manualTdee !== undefined) {
      const tdee = Math.round(manualTdee);
      data.manualTdee = tdee;
      // Macro targets from the goal-adjusted intake.
      const macros = defaultMacroTargets(Math.max(0, tdee + goalDelta));
      data.targetProtein = macros.protein;
      data.targetCarbs = macros.carbs;
      data.targetFat = macros.fat;
    }
  }

  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ ok: true, goal, goalDelta, hasWearable });
}
