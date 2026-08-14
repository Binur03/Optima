// Pure, side-effect-free Delta math. Consumed identically by the API route,
// the DeltaBar, and the hero number so they can never disagree (UI/UX spec).

export type Goal = "CUT" | "MAINTAIN" | "BULK";
export type TrackState = "under" | "on_track" | "over" | "unknown";

export interface DeltaInput {
  targetIntake: number | null; // rolling TDEE + goalDelta
  eaten: number; // sum of today's food logs
  goal: Goal;
  /** Fraction of the eating day elapsed, 0..1. Injected so the fn stays pure/testable. */
  dayFraction: number;
  /** ± calories of slack before we call someone off-track. */
  tolerance?: number;
}

export interface DeltaResult {
  targetIntake: number | null;
  eaten: number;
  remaining: number | null; // targetIntake - eaten (can go negative)
  /** Expected intake by this point in the day to finish exactly on target. */
  pacedTarget: number | null;
  track: TrackState;
  /** Naive end-of-day projection assuming the current eating pace continues. */
  projectedEod: number | null;
}

const DEFAULT_TOLERANCE = 150;

export function computeDelta(input: DeltaInput): DeltaResult {
  const { targetIntake, eaten, goal } = input;
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;
  const frac = clamp(input.dayFraction, 0, 1);

  if (targetIntake === null) {
    return {
      targetIntake: null,
      eaten,
      remaining: null,
      pacedTarget: null,
      track: "unknown",
      projectedEod: null,
    };
  }

  const remaining = targetIntake - eaten;
  const pacedTarget = Math.round(targetIntake * frac);
  const projectedEod = frac > 0.05 ? Math.round(eaten / frac) : null;

  return {
    targetIntake,
    eaten,
    remaining,
    pacedTarget,
    projectedEod,
    track: classify(eaten, pacedTarget, tolerance, goal),
  };
}

// "On track" means eaten is near the paced target. For a CUT, drifting UNDER
// pace is still success-leaning (labeled under, not a failure); OVER pace is
// the risk. For BULK the framing inverts. MAINTAIN treats both sides equally.
function classify(
  eaten: number,
  pacedTarget: number,
  tolerance: number,
  _goal: Goal
): TrackState {
  if (eaten > pacedTarget + tolerance) return "over";
  if (eaten < pacedTarget - tolerance) return "under";
  return "on_track";
}

// Fraction of the eating day elapsed, modeled over waking hours (06:00–23:00).
// Takes an explicit fractional local hour (0..24) rather than a Date, so the
// caller MUST supply the USER's local time — never the server's. This is what
// makes pace flags time-correct: 80% of budget at 09:00 reads as "over", the
// same 80% at 19:00 reads as "on track". A UTC server clock would otherwise
// mis-place every non-UTC user on the timeline.
export function eatingDayFraction(localHour: number, wakeHour = 6, sleepHour = 23): number {
  if (localHour <= wakeHour) return 0;
  if (localHour >= sleepHour) return 1;
  return (localHour - wakeHour) / (sleepHour - wakeHour);
}

// Convert a client-reported timezone offset (Date.prototype.getTimezoneOffset:
// minutes to ADD to local to reach UTC, e.g. PST = 480) into the user's current
// fractional local hour. Defaults to server time if no offset is provided.
export function localHourFromOffset(tzOffsetMinutes: number | null, now = new Date()): number {
  const offset = Number.isFinite(tzOffsetMinutes as number) ? (tzOffsetMinutes as number) : 0;
  const localMs = now.getTime() - offset * 60_000;
  const local = new Date(localMs);
  return local.getUTCHours() + local.getUTCMinutes() / 60;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
