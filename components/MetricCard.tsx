"use client";

interface Props {
  label: string;
  value: number | null;
  unit?: string;
  sub?: string;
  tone?: "neutral" | "burn" | "eat";
}

export function MetricCard({ label, value, unit = "kcal", sub, tone = "neutral" }: Props) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {value === null ? "—" : value.toLocaleString()}
        <span className="metric-unit">{value === null ? "" : ` ${unit}`}</span>
      </span>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  );
}
