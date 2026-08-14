"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Today", icon: "📊" },
  { href: "/log", label: "Log", icon: "🍽️" },
  { href: "/diary", label: "Diary", icon: "📔" },
  { href: "/onboarding", label: "Setup", icon: "⚙️" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map((t) => {
        const active = pathname?.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`nav-item${active ? " nav-active" : ""}`}>
            <span className="nav-icon" aria-hidden>
              {t.icon}
            </span>
            <span className="nav-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
