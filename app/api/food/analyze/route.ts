import { NextRequest, NextResponse } from "next/server";
import { analyzeMealImage, analyzeFoodText } from "@/lib/gemini";
import { getCurrentUserId } from "@/lib/auth";

// AI calls (plus a fallback retry) can outlast the default function timeout.
export const maxDuration = 30;

// Guard rails: cap decoded image at ~5MB, allow common photo mime types.
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

// POST /api/food/analyze  { imageBase64?, mimeType?, contextText? }
// Unified analyzer: image + optional text context (multimodal), image-only, OR
// text-only. Returns an EDITABLE estimate — never persisted here.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { imageBase64?: string; mimeType?: string; contextText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const imageBase64 = stripDataUrl(body.imageBase64 ?? "");
  const mimeType = body.mimeType ?? "image/jpeg";
  const contextText = (body.contextText ?? "").trim();

  if (!imageBase64 && !contextText) {
    return NextResponse.json({ error: "missing_input" }, { status: 400 });
  }

  try {
    let estimate;
    if (imageBase64) {
      if (!ALLOWED.has(mimeType)) {
        return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
      }
      if (approxBytes(imageBase64) > MAX_BYTES) {
        return NextResponse.json({ error: "image_too_large" }, { status: 413 });
      }
      estimate = await analyzeMealImage(imageBase64, mimeType, contextText || undefined);
    } else {
      estimate = await analyzeFoodText(contextText);
    }
    return NextResponse.json({ estimate });
  } catch (err) {
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
