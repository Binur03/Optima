import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUserId, getCurrentUserId } from "@/lib/auth";
import { isoDay, localDateOnly, parseDay } from "@/lib/datetime";

// GET /api/progress/photos — the user's progress photos, newest first. The
// browser turns storage paths into short-lived signed URLs itself (the bucket
// is private; Storage RLS lets each user sign only their own files).
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const photos = await prisma.progressPhoto.findMany({
    where: { userId },
    orderBy: [{ takenOn: "desc" }, { createdAt: "desc" }],
    select: { id: true, storagePath: true, takenOn: true, weightLb: true },
  });

  return NextResponse.json({
    photos: photos.map((p) => ({
      id: p.id,
      path: p.storagePath,
      takenOn: isoDay(p.takenOn),
      weightLb: p.weightLb === null ? null : Number(p.weightLb),
    })),
  });
}

// POST /api/progress/photos  { path, takenOn?, weightLb? }
// Records metadata for a file the browser already uploaded to Storage. Rejects
// paths outside the caller's own "<auth.uid()>/" folder. A weight logged with a
// photo is also written to the weight log so the trend chart picks it up.
export async function POST(req: NextRequest) {
  const [userId, authUid] = await Promise.all([getCurrentUserId(req), getAuthUserId(req)]);
  if (!userId || !authUid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { path?: string; takenOn?: string; weightLb?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const path = body.path ?? "";
  if (!new RegExp(`^${authUid}/[A-Za-z0-9-]+\\.(jpg|jpeg|png|webp)$`).test(path)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const today = localDateOnly(user.timezone);
  const takenOn = parseDay(body.takenOn) ?? today;
  if (takenOn > today) return NextResponse.json({ error: "future_date" }, { status: 400 });

  const raw = body.weightLb === null || body.weightLb === undefined ? null : Number(body.weightLb);
  if (raw !== null && (!Number.isFinite(raw) || raw < 50 || raw > 800)) {
    return NextResponse.json({ error: "invalid_weight" }, { status: 400 });
  }
  const weightLb = raw === null ? null : Math.round(raw * 10) / 10;

  const photo = await prisma.progressPhoto.create({
    data: { userId, storagePath: path, takenOn, weightLb },
    select: { id: true },
  });

  if (weightLb !== null) {
    await prisma.weightLog.upsert({
      where: { userId_logDate: { userId, logDate: takenOn } },
      create: { userId, logDate: takenOn, weightLb },
      update: { weightLb },
    });
  }

  return NextResponse.json({ id: photo.id });
}
