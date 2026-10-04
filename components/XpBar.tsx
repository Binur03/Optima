"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { PROGRESS_KEY, useProgress } from "@/lib/useProgress";
import { AchievementsSheet, LevelBadge } from "./AchievementsSheet";

type Toast = { id: number; tone: "xp" | "level" | "badge"; title: string; amount?: number };

// Sticky top bar: level badge, rank, and XP toward the next level. Tapping it
// opens the rank + achievements sheet. Also announces newly earned XP.
export function XpBar() {
  const qc = useQueryClient();
  const pathname = usePathname();
  const { data, dataUpdatedAt, isError } = useProgress();
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const firstPath = useRef(true);

  // Re-evaluate on navigation so XP earned on another screen lands promptly.
  // Never cancel an in-flight evaluation — its response carries the awards.
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    qc.invalidateQueries({ queryKey: PROGRESS_KEY }, { cancelRefetch: false });
  }, [pathname, qc]);

  useEffect(() => {
    if (!data) return;
    const next: Toast[] = [];
    const xp = data.awarded.filter((a) => !a.key.startsWith("ach:"));
    const badges = data.awarded.filter((a) => a.key.startsWith("ach:"));
    if (xp.length > 2) {
      next.push({ id: ++seq.current, tone: "xp", title: `${xp.length} rewards`, amount: sum(xp) });
    } else {
      for (const a of xp) next.push({ id: ++seq.current, tone: "xp", title: a.label, amount: a.amount });
    }
    for (const b of badges) next.push({ id: ++seq.current, tone: "badge", title: b.label, amount: b.amount });
    if (data.levelUp) next.push({ id: ++seq.current, tone: "level", title: `Level ${data.levelUp} · ${data.xp.rank}` });
    if (next.length === 0) return;

    setToasts((t) => [...t, ...next]);
    // Each batch dismisses itself; a newer fetch must not cancel this timer.
    const ids = new Set(next.map((t) => t.id));
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.has(x.id))), 3200);
    // Keyed on dataUpdatedAt: each fetch's awards are announced exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt]);

  if (isError && !data) return null;
  const xp = data?.xp;

  return (
    <>
      <div className="sticky top-0 z-30 -mx-4 -mt-4 mb-4 border-b border-white/5 bg-zinc-950/80 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <button
          type="button"
          onClick={() => data && setOpen(true)}
          className="flex w-full items-center gap-3 text-left"
          aria-label={xp ? `Level ${xp.level} ${xp.rank}, ${xp.into} of ${xp.span} XP. Open achievements` : "Loading level"}
          aria-haspopup="dialog"
        >
          <LevelBadge level={xp?.level} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-white">
                {xp ? xp.rank : <span className="inline-block h-3 w-16 rounded bg-white/10 align-middle" />}
                {xp && <span className="font-medium text-neutral-500"> · Lv {xp.level}</span>}
              </span>
              {xp && (
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-neutral-400">
                  {xp.into.toLocaleString()} / {xp.span.toLocaleString()} XP
                </span>
              )}
            </span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <motion.span
                className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500"
                initial={{ width: 0 }}
                animate={{ width: `${Math.round((xp?.pct ?? 0) * 1000) / 10}%` }}
                transition={{ type: "spring", stiffness: 70, damping: 18 }}
              />
            </span>
          </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-neutral-600" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>

        <div className="pointer-events-none absolute inset-x-4 top-full mt-2 flex flex-col items-center gap-2" aria-live="polite">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-2xl ring-1 backdrop-blur-md ${TOAST[t.tone]}`}
              >
                <span aria-hidden>{t.tone === "level" ? "⬆️" : t.tone === "badge" ? "🏆" : "⚡"}</span>
                <span>{t.tone === "badge" ? `Unlocked: ${t.title}` : t.tone === "level" ? `Level up! ${t.title}` : t.title}</span>
                {t.amount != null && <span className="tabular-nums text-amber-300">+{t.amount} XP</span>}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Outside the bar: its backdrop-filter would trap a fixed-position sheet. */}
      {data && <AchievementsSheet open={open} onClose={() => setOpen(false)} data={data} />}
    </>
  );
}

const TOAST: Record<Toast["tone"], string> = {
  xp: "bg-neutral-800/90 text-white ring-white/10",
  badge: "bg-neutral-800/90 text-white ring-amber-300/30",
  level: "bg-gradient-to-r from-amber-300 to-orange-500 text-zinc-950 ring-amber-200/40",
};

function sum(items: { amount: number }[]) {
  return items.reduce((s, a) => s + a.amount, 0);
}
