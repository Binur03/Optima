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
  const base =
    "inline-flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 text-xs";

  if (value === null) {
    return (
      <span className={`${base} text-neutral-400`}>
        {manual ? "Add your details to set your baseline" : "Connect a wearable to set your baseline"}
      </span>
    );
  }

  const suffix = manual
    ? "Manual"
    : estimating
      ? `Estimating · ${daysUsed}/7 days`
      : "7-day avg";

  return (
    <span className={`${base} text-neutral-400`}>
      Maintenance
      <span className="font-medium tabular-nums text-white">{value.toLocaleString()}</span>
      <span className={estimating && !manual ? "text-amber-400" : "text-neutral-500"}>· {suffix}</span>
    </span>
  );
}
