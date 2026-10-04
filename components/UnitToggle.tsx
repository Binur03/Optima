"use client";

import { useUnits } from "@/lib/useUnits";

// lb ⇄ kg switch. Changes every screen at once and is saved to the account.
export function UnitToggle({ full = false }: { full?: boolean }) {
  const { units, setUnits } = useUnits();
  const options = [
    { key: "imperial" as const, label: full ? "ft · in · lb" : "lb" },
    { key: "metric" as const, label: full ? "cm · kg" : "kg" },
  ];
  return (
    <div
      className={`flex rounded-full bg-white/[0.04] p-1 ring-1 ring-inset ring-white/5 ${full ? "w-full" : ""}`}
      role="group"
      aria-label="Units"
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => setUnits(o.key)}
          aria-pressed={units === o.key}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${full ? "flex-1 py-1.5" : ""} ${
            units === o.key ? "bg-white text-zinc-950" : "text-neutral-400 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
