// Unit display + entry. Storage never changes: lifts, body weight, and photo
// weights are saved in lb; profile height/weight in cm/kg. These helpers only
// convert at the edges, so switching systems is lossless.

export type UnitSystem = "imperial" | "metric";

export const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

const round = (n: number, step: number) => Math.round(n / step) * step;
const tidy = (n: number) => Number(n.toFixed(2));

export function weightUnit(u: UnitSystem) {
  return u === "metric" ? "kg" : "lb";
}

// lb (stored) → number in the user's unit. Body weight shows 0.1 precision;
// lifts show plate-friendly steps (0.5 kg / whole lb unless entered otherwise).
export function lbToDisplay(lb: number, u: UnitSystem, kind: "body" | "lift" = "body"): number {
  if (u === "imperial") return tidy(kind === "lift" ? round(lb, 0.5) : round(lb, 0.1));
  const kg = lb * KG_PER_LB;
  return tidy(kind === "lift" ? round(kg, 0.25) : round(kg, 0.1));
}

// Number in the user's unit → lb (stored).
export function displayToLb(value: number, u: UnitSystem): number {
  return u === "metric" ? tidy(value / KG_PER_LB) : value;
}

export function formatWeight(lb: number, u: UnitSystem, kind: "body" | "lift" = "body") {
  return `${lbToDisplay(lb, u, kind).toLocaleString()} ${weightUnit(u)}`;
}

// Stepper increment for a lift in the user's unit.
export function liftStep(u: UnitSystem) {
  return (current: number) => (u === "metric" ? (current < 20 ? 1.25 : 2.5) : current < 50 ? 2.5 : 5);
}

export function cmToFeetInches(cm: number): { ft: number; in: number } {
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(totalIn / 12), in: totalIn % 12 };
}

export function feetInchesToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * CM_PER_IN);
}
