import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

// DELETE /api/progress/photos/[id] — removes the metadata row and returns the
// storage path so the browser can delete the file (Storage RLS allows it to
// delete only its own objects).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const photo = await prisma.progressPhoto.findFirst({
    where: { id: params.id, userId },
    select: { id: true, storagePath: true },
  });
  if (!photo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.progressPhoto.delete({ where: { id: photo.id } });
  return NextResponse.json({ deleted: true, path: photo.storagePath });
}
