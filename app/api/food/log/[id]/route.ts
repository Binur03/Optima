import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

// Ownership is enforced by scoping every mutation to { id, userId } via
// deleteMany/updateMany — a user can only touch their own rows.

// DELETE /api/food/log/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await prisma.foodLog.deleteMany({ where: { id: params.id, userId } });
  if (result.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}

// PATCH /api/food/log/[id]  { foodName?, calories?, proteinG?, carbsG?, fatG? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    foodName?: string;
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const num = (v: unknown): number | undefined => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : undefined;
  };

  const data: {
    foodName?: string;
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    aiEstimated: boolean;
  } = { aiEstimated: false }; // any manual edit confirms the entry

  if (typeof body.foodName === "string" && body.foodName.trim()) {
    data.foodName = body.foodName.trim().slice(0, 120);
  }
  const cal = num(body.calories);
  if (cal !== undefined) data.calories = Math.round(cal);
  const p = num(body.proteinG);
  if (p !== undefined) data.proteinG = p;
  const c = num(body.carbsG);
  if (c !== undefined) data.carbsG = c;
  const f = num(body.fatG);
  if (f !== undefined) data.fatG = f;

  const result = await prisma.foodLog.updateMany({ where: { id: params.id, userId }, data });
  if (result.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ updated: true });
}
