// Supplements & water helpers. Pure — used by the API and the UI.

export const TIMES = [
  { key: "morning", label: "Morning", icon: "🌅", from: 5, to: 11 },
  { key: "afternoon", label: "Afternoon", icon: "☀️", from: 11, to: 17 },
  { key: "evening", label: "Evening", icon: "🌇", from: 17, to: 21 },
  { key: "night", label: "Night", icon: "🌙", from: 21, to: 29 }, // 9 PM – 5 AM
] as const;

export type TimeOfDay = (typeof TIMES)[number]["key"];

export function isTimeOfDay(v: unknown): v is TimeOfDay {
  return TIMES.some((t) => t.key === v);
}

// Which slot the current local hour falls in (night wraps past midnight).
export function currentTime(hour: number): TimeOfDay {
  const h = hour < 5 ? hour + 24 : hour;
  return TIMES.find((t) => h >= t.from && h < t.to)?.key ?? "morning";
}

// Water pace: spread the goal across waking hours (7 AM – 10 PM).
const DAY_START = 7;
const DAY_END = 22;
export function waterPaceTarget(goalMl: number, hour: number) {
  const f = Math.min(1, Math.max(0, (hour - DAY_START) / (DAY_END - DAY_START)));
  return Math.round(goalMl * f);
}

// Common goals, in ml.
export const WATER_GOALS = {
  imperial: [
    { label: "64 oz", ml: 1893 },
    { label: "100 oz", ml: 2957 },
    { label: "1 gallon", ml: 3785 },
  ],
  metric: [
    { label: "2 L", ml: 2000 },
    { label: "3 L", ml: 3000 },
    { label: "4 L", ml: 4000 },
  ],
} as const;

// One-tap amounts, in ml.
export const WATER_QUICK = {
  imperial: [
    { label: "+8 oz", sub: "cup", ml: 237 },
    { label: "+16.9 oz", sub: "bottle", ml: 500 },
    { label: "+32 oz", sub: "big bottle", ml: 946 },
  ],
  metric: [
    { label: "+250 ml", sub: "glass", ml: 250 },
    { label: "+500 ml", sub: "bottle", ml: 500 },
    { label: "+1 L", sub: "big bottle", ml: 1000 },
  ],
} as const;
