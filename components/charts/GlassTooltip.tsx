"use client";

import { useEffect, useState } from "react";

// Recharts measures the DOM, so charts render only after mount (no SSR pass).
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

interface Props {
  active?: boolean;
  payload?: { value?: number; payload?: Record<string, unknown> }[];
  label?: string | number;
  unit?: string;
  labelFormat?: (label: string) => string;
  detailKey?: string; // extra line from the data point (e.g. top set)
}

// Frosted-glass tooltip shared by every chart.
export function GlassTooltip({ active, payload, label, unit = "", labelFormat, detailKey }: Props) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  const detail = detailKey ? payload[0]?.payload?.[detailKey] : undefined;
  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-800/80 px-3.5 py-2.5 shadow-xl backdrop-blur-md">
      <p className="m-0 text-[11px] font-medium text-neutral-400">
        {labelFormat ? labelFormat(String(label)) : label}
      </p>
      <p className="m-0 mt-0.5 text-base font-semibold tabular-nums text-white">
        {typeof value === "number" ? value.toLocaleString() : "—"}
        {unit && <span className="ml-1 text-xs font-normal text-neutral-400">{unit}</span>}
      </p>
      {typeof detail === "string" && detail && (
        <p className="m-0 mt-0.5 text-[11px] text-neutral-400">{detail}</p>
      )}
    </div>
  );
}
