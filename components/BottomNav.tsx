"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ActionSheet } from "./ActionSheet";

const ICONS: Record<string, JSX.Element> = {
  today: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  train: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  history: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m4 15 4-4 5 5 2-2 5 5" />
      <circle cx="15.5" cy="8.5" r="1.5" />
    </>
  ),
  insights: <path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L20 7" />,
};

type Tab = { href: string; label: string; icon: string };
const LEFT: Tab[] = [
  { href: "/dashboard", label: "Today", icon: "today" },
  { href: "/train", label: "Train", icon: "train" },
];
const RIGHT: Tab[] = [
  { href: "/history", label: "History", icon: "history" },
  { href: "/insights", label: "Insights", icon: "insights" },
];

export function BottomNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const tab = (t: Tab) => {
    const active = pathname?.startsWith(t.href);
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={active ? "page" : undefined}
        className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
          active ? "text-white" : "text-neutral-500 hover:text-neutral-300"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-[22px] w-[22px] ${active ? "text-emerald-400" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {ICONS[t.icon]}
        </svg>
        {t.label}
      </Link>
    );
  };

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 mx-auto grid h-16 max-w-[480px] grid-cols-5 border-t border-white/5 bg-zinc-950/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
        aria-label="Primary"
      >
        {LEFT.map(tab)}
        <div className="flex items-start justify-center">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Add food, lift, or progress photo"
            aria-haspopup="dialog"
            className="-mt-5 grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/30 ring-4 ring-zinc-950 transition hover:bg-emerald-400 active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        {RIGHT.map(tab)}
      </nav>
      <ActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
