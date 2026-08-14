// Timezone-aware day keying. All "which day is it?" decisions must go through
// here so a UTC server never mis-assigns a user's meals/burn to the wrong
// calendar day (the classic near-midnight bug).

// UTC-midnight Date representing the user's LOCAL calendar day. This is what we
// store in `log_date` / query by, so day boundaries follow the user, not UTC.
export function localDateOnly(timeZone: string, now: Date = new Date()): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = Number(parts.find((p) => p.type === "year")!.value);
    const m = Number(parts.find((p) => p.type === "month")!.value);
    const d = Number(parts.find((p) => p.type === "day")!.value);
    return new Date(Date.UTC(y, m - 1, d));
  } catch {
    // Invalid tz string → fall back to UTC day.
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
}

// The user's current fractional local hour (0..24), for DeltaBar pacing.
export function localHourInTimeZone(timeZone: string, now: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")!.value) % 24; // "24" → 0
    const m = Number(parts.find((p) => p.type === "minute")!.value);
    return h + m / 60;
  } catch {
    return now.getUTCHours() + now.getUTCMinutes() / 60;
  }
}

// Loose validation before trusting a client-provided IANA tz string.
export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
