"use client";

interface Props {
  value: number | null;
  daysUsed: number;
  estimating: boolean;
}

// Communicates trust in the baseline: full 7-day window vs. still warming up.
export function TdeeBadge({ value, daysUsed, estimating }: Props) {
  if (value === null) {
    return <span className="tdee-badge tdee-cold">Connect Fitbit to set your baseline</span>;
  }
  return (
    <span className={`tdee-badge${estimating ? " tdee-estimating" : ""}`}>
      Maintenance ≈ {value.toLocaleString()} kcal{" "}
      {estimating ? `· estimating (${daysUsed}/7 days)` : "· 7-day avg"}
    </span>
  );
}
