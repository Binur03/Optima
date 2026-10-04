import { NextRequest, NextResponse } from "next/server";
import { analyzeFoodText } from "@/lib/gemini";
import { getCurrentUserId } from "@/lib/auth";

// AI calls (plus a fallback retry) can outlast the default function timeout.
export const maxDuration = 30;

// POST /api/food/search  { query }
// Text fallback: Gemini text-only estimate (swap for USDA FoodData Central later).
// Also returns an EDITABLE estimate — not persisted here.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (query.length < 2 || query.length > 120) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  try {
    const estimate = await analyzeFoodText(query);
    return NextResponse.json({ estimate });
  } catch (err) {
    const status = isRateLimit(err) ? 429 : 502;
    return NextResponse.json(
      { error: status === 429 ? "rate_limited" : "search_failed" },
      { status }
    );
  }
}

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate|quota|resource_exhausted/i.test(msg);
}
