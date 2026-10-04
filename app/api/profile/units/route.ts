import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

// GET /api/profile/units → { units: "imperial" | "metric" }
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { unitSystem: true } });
  return NextResponse.json({ units: user?.unitSystem === "metric" ? "metric" : "imperial" });
}

// POST /api/profile/units { units } — display preference only; stored values never change.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { units?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (body.units !== "imperial" && body.units !== "metric") {
    return NextResponse.json({ error: "invalid_units" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: userId }, data: { unitSystem: body.units } });
  return NextResponse.json({ units: body.units });
}
