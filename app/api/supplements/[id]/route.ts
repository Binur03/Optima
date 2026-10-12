import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { localDateOnly } from "@/lib/datetime";
import { isTimeOfDay } from "@/lib/supplements";

type Ctx = { params: { id: string } };

// PATCH /api/supplements/[id]
//   { taken: boolean } marks today · { name?, dose?, timeOfDay? } edits
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const owned = await prisma.supplement.findFirst({ where: { id: params.id, userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let b: { taken?: unknown; name?: unknown; dose?: unknown; timeOfDay?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (typeof b.taken === "boolean") {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const logDate = localDateOnly(user.timezone);
    if (b.taken) {
      // Idempotent: a double tap can't log it twice.
      await prisma.supplementLog.upsert({
        where: { supplementId_logDate: { supplementId: owned.id, logDate } },
        create: { userId, supplementId: owned.id, logDate },
        update: {},
      });
    } else {
      await prisma.supplementLog.deleteMany({ where: { supplementId: owned.id, logDate } });
    }
    return NextResponse.json({ ok: true });
  }

  const data: Prisma.SupplementUpdateInput = {};
  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
    if (name.length < 2 || name.length > 60) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    data.name = name;
  }
  if (b.dose !== undefined) data.dose = typeof b.dose === "string" && b.dose.trim() ? b.dose.trim().slice(0, 40) : null;
  if (b.timeOfDay !== undefined) {
    if (!isTimeOfDay(b.timeOfDay)) return NextResponse.json({ error: "invalid_time" }, { status: 400 });
    data.timeOfDay = b.timeOfDay;
  }
  try {
    await prisma.supplement.update({ where: { id: owned.id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "supplement_exists" }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/supplements/[id] — removes it and its history.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { count } = await prisma.supplement.deleteMany({ where: { id: params.id, userId } });
  if (count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
