"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SpeedDial } from "./SpeedDial";

const ICONS: Record<string, JSX.Element> = {
  today: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  train: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  supps: (
    <>
      <rect x="3.5" y="9" width="17" height="6.5" rx="3.25" transform="rotate(-40 12 12.25)" />
      <path d="m9.6 9.4 4.9 5.8" />
    </>
  ),
  progress: <path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L20 7" />,
};

// `match` lists every route that should light the tab up.
type Tab = { href: string; label: string; icon: string; match: string[] };
const LEFT: Tab[] = [
  { href: "/dashboard", label: "Today", icon: "today", match: ["/dashboard", "/diary", "/log", "/plan"] },
  { href: "/train", label: "Train", icon: "train", match: ["/train"] },
];
const RIGHT: Tab[] = [
  { href: "/supplements", label: "Supps", icon: "supps", match: ["/supplements"] },
  // Trends (Insights) and Photos (History) share one tab with a switch at the top.
  { href: "/insights", label: "Progress", icon: "progress", match: ["/insights", "/history"] },
];

export function BottomNav() {
  const pathname = usePathname();
  const [dialOpen, setDialOpen] = useState(false);
  // Any navigation (a bubble, a tab, the back button) closes the dial.
  useEffect(() => setDialOpen(false), [pathname]);

  const tab = (t: Tab) => {
    const active = t.match.some((m) => pathname?.startsWith(m));
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
        className={`fixed inset-x-0 bottom-0 mx-auto grid h-16 max-w-[480px] grid-cols-5 border-t border-white/5 bg-zinc-950/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl ${
          dialOpen ? "z-[60]" : "z-40"
        }`}
        aria-label="Primary"
      >
        {LEFT.map(tab)}
        <div className="flex items-start justify-center">
          <button
            type="button"
            onClick={() => setDialOpen((o) => !o)}
            aria-label={dialOpen ? "Close add menu" : "Add food, lift, cardio, or progress photo"}
            aria-haspopup="menu"
            aria-expanded={dialOpen}
            className="-mt-5 grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/30 ring-4 ring-zinc-950 transition hover:bg-emerald-400 active:scale-95"
          >
            <motion.svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              aria-hidden
              animate={{ rotate: dialOpen ? 45 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              <path d="M12 5v14M5 12h14" />
            </motion.svg>
          </button>
        </div>
        {RIGHT.map(tab)}
      </nav>
      <SpeedDial open={dialOpen} onClose={() => setDialOpen(false)} />
    </>
  );
}
