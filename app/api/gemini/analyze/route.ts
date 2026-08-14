import { NextRequest, NextResponse } from "next/server";
import { analyzeMealImage } from "@/lib/gemini";
import { getCurrentUserId } from "@/lib/auth";

// Guard rails: cap decoded image at ~5MB, allow common photo mime types.
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

// POST /api/gemini/analyze  { imageBase64, mimeType }
// Returns an EDITABLE estimate — never persisted here. Saving is a separate call.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { imageBase64?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const imageBase64 = stripDataUrl(body.imageBase64 ?? "");
  const mimeType = body.mimeType ?? "image/jpeg";

  if (!imageBase64) return NextResponse.json({ error: "missing_image" }, { status: 400 });
  if (!ALLOWED.has(mimeType)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (approxBytes(imageBase64) > MAX_BYTES) {
    return NextResponse.json({ error: "image_too_large" }, { status: 413 });
  }

  try {
    const estimate = await analyzeMealImage(imageBase64, mimeType);
    return NextResponse.json({ estimate });
  } catch (err) {
    // Signal the UI to fall back to text-search / manual entry — the photo is
    // still in client state, so nothing is lost.
    const status = isRateLimit(err) ? 429 : 502;
    return NextResponse.json(
      { error: status === 429 ? "rate_limited" : "analysis_failed", fallback: "manual" },
      { status }
    );
  }
}

function stripDataUrl(s: string): string {
  return s.startsWith("data:") ? s.slice(s.indexOf(",") + 1) : s;
}
function approxBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}
function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate|quota|resource_exhausted/i.test(msg);
}
