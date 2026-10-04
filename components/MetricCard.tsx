"use client";

interface Props {
  label: string;
  value: number | null;
  unit?: string;
  sub?: string;
  tone?: "neutral" | "burn" | "eat";
}

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  neutral: "text-white",
  eat: "text-white",
  burn: "text-orange-400",
};

// Compact stat used in the hero's stat row.
export function MetricCard({ label, value, unit = "kcal", sub, tone = "neutral" }: Props) {
  return (
    <div className="min-w-0 px-2 text-center">
      <p className="m-0 text-[11px] font-medium uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`m-0 mt-1 text-lg font-semibold tabular-nums ${TONE[tone]}`}>
        {value === null ? "—" : value.toLocaleString()}
        {value !== null && <span className="ml-1 text-xs font-normal text-neutral-500">{unit}</span>}
      </p>
      {sub && <p className="m-0 mt-0.5 truncate text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}
