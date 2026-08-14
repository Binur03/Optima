import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";

// Google Health API — the successor to the Fitbit Web API (legacy Fitbit turndown
// ~Sept 2026). Auth is standard Google OAuth 2.0; data comes from
// health.googleapis.com. The wearable provider creds live in the FITBIT_* env
// vars (kept for continuity); they now hold a Google Cloud OAuth client.
//
// ⚠️ The calories scope is a Google "Restricted" scope: real user data requires
// an approved OAuth verification (security review). Until the app is verified,
// consent will fail for non-test users — see the connect flow notes.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://health.googleapis.com";
const SCOPES =
  "openid https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";

// ---------- PKCE ----------
export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: process.env.FITBIT_CLIENT_ID!,
    response_type: "code",
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: process.env.FITBIT_REDIRECT_URI!,
    state,
    access_type: "offline", // request a refresh token
    prompt: "consent", // force refresh_token issuance on re-consent
    include_granted_scopes: "true",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string; // Google omits this on refresh — retain the old one
  expires_in: number;
  scope: string;
  id_token?: string;
  token_type: string;
}

export class HealthReauthRequired extends Error {
  constructor() {
    super("Google Health re-authentication required");
    this.name = "HealthReauthRequired";
  }
}

export class HealthRateLimited extends Error {
  retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super("Google Health rate limit exceeded");
    this.name = "HealthRateLimited";
    this.retryAfterSec = retryAfterSec;
  }
}

// ---------- Token exchange & persistence ----------
export async function exchangeCodeForTokens(
  userId: string,
  code: string,
  codeVerifier: string
): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      client_id: process.env.FITBIT_CLIENT_ID!,
      client_secret: process.env.FITBIT_CLIENT_SECRET!,
      redirect_uri: process.env.FITBIT_REDIRECT_URI!,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  await persistTokens(userId, (await res.json()) as GoogleTokenResponse);
}

async function persistTokens(
  userId: string,
  t: GoogleTokenResponse,
  fallbackRefreshPlain?: string
): Promise<void> {
  const refreshPlain = t.refresh_token ?? fallbackRefreshPlain;
  if (!refreshPlain) {
    // No refresh token anywhere → user must re-consent to get offline access.
    throw new HealthReauthRequired();
  }
  const data = {
    accessToken: encrypt(t.access_token),
    refreshToken: encrypt(refreshPlain),
    scope: t.scope,
    fitbitUserId: googleSubFromIdToken(t.id_token), // repurposed: provider account id
    accessTokenExpiresAt: new Date(Date.now() + t.expires_in * 1000),
  };
  await prisma.fitbitToken.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

async function refreshTokens(userId: string, refreshTokenPlain: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenPlain,
      client_id: process.env.FITBIT_CLIENT_ID!,
      client_secret: process.env.FITBIT_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    if (res.status === 400 || res.status === 401) throw new HealthReauthRequired();
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }

  const t = (await res.json()) as GoogleTokenResponse;
  // Google usually omits refresh_token on refresh → keep the existing one.
  await persistTokens(userId, t, refreshTokenPlain);
  return t.access_token;
}

async function getValidAccessToken(userId: string): Promise<string> {
  const row = await prisma.fitbitToken.findUnique({ where: { userId } });
  if (!row) throw new HealthReauthRequired();

  const skewMs = 60_000;
  if (row.accessTokenExpiresAt.getTime() - skewMs > Date.now()) {
    return decrypt(row.accessToken);
  }
  return refreshTokens(userId, decrypt(row.refreshToken));
}

async function healthFetch(
  userId: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  let token = await getValidAccessToken(userId);
  const call = (t: string) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
    });

  let res = await call(token);
  if (res.status === 401) {
    const row = await prisma.fitbitToken.findUnique({ where: { userId } });
    if (!row) throw new HealthReauthRequired();
    token = await refreshTokens(userId, decrypt(row.refreshToken));
    res = await call(token);
  }
  return res;
}

export interface DayBurn {
  date: string; // YYYY-MM-DD (local civil day)
  caloriesOut: number | null;
  steps: number | null;
}

// Pulls a date range of daily burn from Google Health in one rollup per data
// type. total-calories + steps are both derived types read via dailyRollUp; AZM
// has no Google Health equivalent so it is never populated. `endExclusive` is
// the day AFTER the last day wanted (the rollup range end is exclusive).
export async function fetchBurnRange(
  userId: string,
  startDate: string,
  endExclusive: string
): Promise<DayBurn[]> {
  const [calPoints, stepPoints] = await Promise.all([
    dailyRollUp(userId, "total-calories", startDate, endExclusive),
    // Steps are a bonus metric — never fail the whole sync if they error.
    dailyRollUp(userId, "steps", startDate, endExclusive).catch(() => [] as unknown[]),
  ]);

  const byDate = new Map<string, DayBurn>();
  const dayFor = (dateStr: string): DayBurn => {
    let e = byDate.get(dateStr);
    if (!e) {
      e = { date: dateStr, caloriesOut: null, steps: null };
      byDate.set(dateStr, e);
    }
    return e;
  };

  for (const p of calPoints) {
    const d = civilDateStr(p);
    if (d) dayFor(d).caloriesOut = kcalFromPoint(p);
  }
  for (const p of stepPoints) {
    const d = civilDateStr(p);
    if (d) dayFor(d).steps = stepsFromPoint(p);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// One dailyRollUp call for a data type over [start, endExclusive), 1-day windows.
async function dailyRollUp(
  userId: string,
  dataType: string,
  startDate: string,
  endExclusive: string
): Promise<unknown[]> {
  const body = JSON.stringify({
    range: { start: civil(startDate), end: civil(endExclusive) },
    windowSizeDays: 1,
  });
  const res = await healthFetch(
    userId,
    `/v4/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
    { method: "POST", body }
  );

  if (res.status === 429) {
    throw new HealthRateLimited(Number(res.headers.get("retry-after")) || 3600);
  }
  if (res.status === 401 || res.status === 403) {
    // 403 typically means the Restricted scope isn't granted/verified yet.
    throw new HealthReauthRequired();
  }
  if (!res.ok) {
    throw new Error(`Google Health ${dataType} rollup failed: ${res.status}`);
  }

  const json = (await res.json()) as { rollupDataPoints?: unknown[] };
  return Array.isArray(json.rollupDataPoints) ? json.rollupDataPoints : [];
}

// ---------- point parsers ----------
function civilDateStr(point: unknown): string | null {
  const date = (
    point as { civilStartTime?: { date?: { year?: number; month?: number; day?: number } } }
  )?.civilStartTime?.date;
  if (!date?.year || !date?.month || !date?.day) return null;
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

// Live payload uses `kcalSum`; the published reference said `kilocalories_sum`.
function kcalFromPoint(point: unknown): number | null {
  const tc = (point as {
    totalCalories?: { kcalSum?: number; kilocalories_sum?: number; kilocaloriesSum?: number };
  })?.totalCalories;
  const kcal = tc?.kcalSum ?? tc?.kilocalories_sum ?? tc?.kilocaloriesSum;
  return typeof kcal === "number" && Number.isFinite(kcal) ? Math.round(kcal) : null;
}

// steps.countSum is an int64 → serialized as a STRING in proto3 JSON.
function stepsFromPoint(point: unknown): number | null {
  const raw = (point as { steps?: { countSum?: string | number } })?.steps?.countSum;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// CivilDateTime: year/month/day nest under `date`; `time` is optional (defaults
// to midnight) and there is NO timezone field — civil time is timezone-less.
function civil(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { date: { year, month, day } };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function googleSubFromIdToken(idToken?: string): string {
  if (!idToken) return "google";
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof json.sub === "string" ? json.sub : "google";
  } catch {
    return "google";
  }
}
