"use client";

import Link from "next/link";

// Top of the Progress tab: Trends (weight & strength charts) ⇄ Photos (private gallery).
export function ProgressSwitch({ active }: { active: "trends" | "photos" }) {
  const tabs = [
    { key: "trends", label: "Trends", href: "/insights" },
    { key: "photos", label: "Photos", href: "/history" },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/5" role="tablist" aria-label="Progress">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={active === t.key}
          className={`rounded-lg py-2 text-center text-sm font-semibold transition ${
            active === t.key ? "bg-white text-zinc-950 shadow-sm" : "text-neutral-400 hover:text-white"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
