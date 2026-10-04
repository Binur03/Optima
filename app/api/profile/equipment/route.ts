import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

const OPTIONS = ["gym", "dumbbells", "bodyweight"] as const;

// POST /api/profile/equipment { equipment } — Commercial gym / Dumbbells only /
// Bodyweight. Drives "Swap for home" suggestions and template order.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { equipment?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!OPTIONS.includes(body.equipment as (typeof OPTIONS)[number])) {
    return NextResponse.json({ error: "invalid_equipment" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: userId }, data: { equipment: body.equipment as string } });
  return NextResponse.json({ equipment: body.equipment });
}
