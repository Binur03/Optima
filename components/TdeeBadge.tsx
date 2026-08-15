"use client";

interface Props {
  value: number | null;
  daysUsed: number;
  estimating: boolean;
  manual?: boolean; // true for no-wearable users (manual TDEE)
}

// Communicates where the maintenance number comes from: a manual estimate, a
// full 7-day rolling window, or a still-warming-up rolling average.
export function TdeeBadge({ value, daysUsed, estimating, manual = false }: Props) {
  if (value === null) {
    return (
      <span className="tdee-badge tdee-cold">
        {manual ? "Add your details to set your baseline" : "Connect a wearable to set your baseline"}
      </span>
    );
  }

  const suffix = manual
    ? "· Manual"
    : estimating
      ? `· estimating (${daysUsed}/7 days)`
      : "· 7-day avg";

  return (
    <span className={`tdee-badge${estimating && !manual ? " tdee-estimating" : ""}`}>
      Maintenance ≈ {value.toLocaleString()} kcal {suffix}
    </span>
  );
}
