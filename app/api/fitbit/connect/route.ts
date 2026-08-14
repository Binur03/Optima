import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthorizeUrl, createPkcePair } from "@/lib/googlehealth";

// GET /api/fitbit/connect — starts the OAuth flow.
// Stashes PKCE verifier + CSRF state in short-lived httpOnly cookies.
export async function GET() {
  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString("base64url");

  const res = NextResponse.redirect(buildAuthorizeUrl(state, challenge));
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 min
  };
  res.cookies.set("fitbit_pkce_verifier", verifier, cookieOpts);
  res.cookies.set("fitbit_oauth_state", state, cookieOpts);
  return res;
}
