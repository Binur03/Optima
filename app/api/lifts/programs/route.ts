import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { MAX_PROGRAM_NAME, PROGRAM_TEMPLATES, cleanName } from "@/lib/lifts";
import { createProgram, isUniqueViolation, resolveActiveProgram } from "@/lib/splits";

// GET /api/lifts/programs — every program with its day names, active first-class.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await resolveActiveProgram(userId); // guarantees exactly one is active
  const programs = await prisma.workoutProgram.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      splits: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { name: true } },
    },
  });
  return NextResponse.json({
    programs: programs.map((p) => ({ id: p.id, name: p.name, isActive: p.isActive, days: p.splits.map((s) => s.name) })),
  });
}

// POST /api/lifts/programs  { name, template?, activate? } — creates a program,
// pre-filled from a template (e.g. "arnold") or empty.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { name?: unknown; template?: unknown; activate?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const name = cleanName(body.name, MAX_PROGRAM_NAME);
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  const template =
    typeof body.template === "string" && PROGRAM_TEMPLATES.some((t) => t.key === body.template) ? body.template : null;

  try {
    const program = await createProgram(userId, name, template, body.activate !== false);
    return NextResponse.json({ program });
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: "program_exists" }, { status: 409 });
    throw e;
  }
}
