import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { localDateOnly } from "@/lib/datetime";

async function body(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// POST /api/water { amountMl } — logs a drink to today.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await body(req);
  const amountMl = Math.round(Number(b?.amountMl));
  if (!Number.isFinite(amountMl) || amountMl < 10 || amountMl > 5000) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const row = await prisma.waterLog.create({
    data: { userId, logDate: localDateOnly(user.timezone), amountMl },
    select: { id: true },
  });
  return NextResponse.json({ id: row.id });
}

// PATCH /api/water { goalMl } — the daily goal (3785 ml = 1 gallon).
export async function PATCH(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await body(req);
  const goalMl = Math.round(Number(b?.goalMl));
  if (!Number.isFinite(goalMl) || goalMl < 500 || goalMl > 10000) {
    return NextResponse.json({ error: "invalid_goal" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: userId }, data: { waterGoalMl: goalMl } });
  return NextResponse.json({ goalMl });
}
