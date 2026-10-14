import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

// GET /api/pantry — ingredients the user has on hand.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await prisma.pantryItem.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json({ items });
}

// POST /api/pantry { names: string[] } — adds several at once ("eggs, rice, spinach").
// Duplicates (any capitalisation) are ignored.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { names?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const raw = Array.isArray(body.names) ? body.names : [];
  const existing = new Set(
    (await prisma.pantryItem.findMany({ where: { userId }, select: { name: true } })).map((p) => p.name.toLowerCase())
  );
  const names = [
    ...new Map(
      raw
        .map((n) => (typeof n === "string" ? n.trim().replace(/\s+/g, " ") : ""))
        .filter((n) => n.length >= 2 && n.length <= 40 && !existing.has(n.toLowerCase()))
        .map((n) => [n.toLowerCase(), n[0].toUpperCase() + n.slice(1)])
    ).values(),
  ].slice(0, 50);
  if (names.length > 0) {
    await prisma.pantryItem.createMany({ data: names.map((name) => ({ userId, name })), skipDuplicates: true });
  }
  return NextResponse.json({ added: names.length });
}
