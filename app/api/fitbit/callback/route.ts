import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/googlehealth";
import { getCurrentUserId } from "@/lib/auth";

// GET /api/fitbit/callback?code=...&state=...
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const base = process.env.APP_BASE_URL!;

  if (error) {
    return NextResponse.redirect(`${base}/onboarding?fitbit=denied`);
  }

  const verifier = req.cookies.get("fitbit_pkce_verifier")?.value;
  const savedState = req.cookies.get("fitbit_oauth_state")?.value;

  // CSRF: state must match the value we issued in /connect.
  if (!code || !state || !verifier || !savedState || state !== savedState) {
    return NextResponse.redirect(`${base}/onboarding?fitbit=invalid_state`);
  }

  const userId = await getCurrentUserId(req);
  if (!userId) return NextResponse.redirect(`${base}/login`);

  try {
    await exchangeCodeForTokens(userId, code, verifier);
  } catch {
    return NextResponse.redirect(`${base}/onboarding?fitbit=exchange_failed`);
  }

  const res = NextResponse.redirect(`${base}/dashboard?fitbit=connected`);
  // Clear the one-time cookies.
  res.cookies.delete("fitbit_pkce_verifier");
  res.cookies.delete("fitbit_oauth_state");
  return res;
}
