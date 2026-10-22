import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

// AI usage metering → Revenium (POST /meter/v2/ai/completions).
//
// Every Gemini attempt — successes, and the 503/429 failures that trigger the
// fallback model — is reported with the feature that made it, the (pseudonymous)
// user it was for, tokens including hidden "thinking" tokens, and timing.
// Off unless REVENIUM_METERING_API_KEY is set; never throws, never blocks a
// user's request for longer than METER_TIMEOUT_MS.

const ENDPOINT = `${process.env.REVENIUM_METERING_BASE_URL ?? "https://api.revenium.ai"}/meter/v2/ai/completions`;
const METER_TIMEOUT_MS = 1500;

export type AiTask = "food-photo" | "food-text" | "meal-items" | "meal-ideas" | "meal-plan" | "weekly-insight";

interface AiContext {
  userId?: string;
  traceId: string; // one per user request: groups an attempt and its fallback
  tags?: { traceType?: string; traceName?: string };
}

const store = new AsyncLocalStorage<AiContext>();
let warnedNoKey = false;

// Wrap a route's AI work so every call inside is attributed to this user.
export function withAiContext<T>(ctx: { userId?: string; tags?: AiContext["tags"] }, fn: () => Promise<T>): Promise<T> {
  return store.run({ ...ctx, traceId: randomUUID() }, fn);
}

export interface AttemptRecord {
  task: AiTask;
  model: string;
  attempt: number; // 0 = primary model, 1+ = fallback / retry
  startedAt: Date;
  endedAt: Date;
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };
  finishReason?: string;
  error?: unknown;
}

const STOP: Record<string, string> = {
  STOP: "END",
  MAX_TOKENS: "TOKEN_LIMIT",
  SAFETY: "CONTENT_FILTER",
  RECITATION: "CONTENT_FILTER",
  BLOCKLIST: "CONTENT_FILTER",
  PROHIBITED_CONTENT: "CONTENT_FILTER",
};

function errorInfo(err: unknown) {
  const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const code = Number(msg.match(/\[(\d{3})/)?.[1] ?? NaN);
  const skipReason = code === 429 ? "RATE_LIMITED" : code === 503 ? "SERVICE_UNAVAILABLE" : undefined;
  return { msg, code: Number.isFinite(code) ? code : undefined, skipReason };
}

export async function meterAttempt(rec: AttemptRecord): Promise<void> {
  const key = process.env.REVENIUM_METERING_API_KEY;
  if (!key) {
    if (!warnedNoKey) console.warn("[metering] REVENIUM_METERING_API_KEY not set; not metering");
    warnedNoKey = true;
    return;
  }
  const ctx = store.getStore();
  const u = rec.usage ?? {};
  const input = u.promptTokenCount ?? 0;
  const reasoning = u.thoughtsTokenCount ?? 0;
  // Gemini reports thinking apart from the answer, but bills it as output; Revenium
  // prices outputTokenCount (OpenAI-style, reasoning included), so count it there.
  const output = (u.candidatesTokenCount ?? 0) + reasoning;
  const failed = rec.error !== undefined;
  const err = failed ? errorInfo(rec.error) : null;

  const body = {
    // Required
    model: rec.model,
    provider: "Google",
    inputTokenCount: input,
    outputTokenCount: output,
    totalTokenCount: u.totalTokenCount ?? input + output,
    stopReason: failed ? "ERROR" : (STOP[rec.finishReason ?? "STOP"] ?? "END"),
    requestTime: rec.startedAt.toISOString(),
    completionStartTime: rec.endedAt.toISOString(), // non-streaming: the whole answer arrives at once
    responseTime: rec.endedAt.toISOString(),
    requestDuration: rec.endedAt.getTime() - rec.startedAt.getTime(),
    // Tokens & cost (Revenium prices them from the model)
    reasoningTokenCount: reasoning,
    isStreamed: false,
    costType: "AI",
    // What the call was for
    operationType: rec.task === "food-photo" ? "VISION" : "GENERATE",
    taskType: rec.task,
    agent: `optima-${rec.task}`,
    transactionName: rec.task,
    retryNumber: rec.attempt,
    traceId: ctx?.traceId,
    ...(ctx?.tags?.traceType ? { traceType: ctx.tags.traceType } : {}),
    ...(ctx?.tags?.traceName ? { traceName: ctx.tags.traceName } : {}),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Who it was for — the Optima user id only (no email or health data)
    organizationName: "Optima",
    productName: "Optima Free",
    ...(ctx?.userId ? { subscriber: { id: ctx.userId } } : {}),
    // Failed attempts cost nothing but show up as errors
    ...(failed
      ? {
          errorReason: err!.msg,
          ...(err!.code ? { errorCode: err!.code } : {}),
          billingSkipped: true,
          ...(err!.skipReason ? { skipReason: err!.skipReason } : {}),
        }
      : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METER_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "Idempotency-Key": randomUUID() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.ok) console.log(`[metering] ${rec.task} ${rec.model} retry=${rec.attempt} → Revenium ${res.status}`);
    else console.warn(`[metering] Revenium ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    console.warn("[metering] not sent:", e instanceof Error ? e.message : e);
  } finally {
    clearTimeout(timer);
  }
}
