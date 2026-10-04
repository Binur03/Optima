"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Quest } from "@/lib/gamification";

interface Props {
  quests: Quest[];
  bonus: { xp: number; done: boolean };
}

export function DailyQuests({ quests, bonus }: Props) {
  const done = quests.filter((q) => q.done).length;

  return (
    <section className="relative isolate overflow-hidden rounded-3xl" aria-label="Daily quests">
      {/* Soft color behind the glass so the blur has something to frost. */}
      <div aria-hidden className="absolute -left-10 -top-12 -z-10 h-40 w-40 rounded-full bg-emerald-500/25 blur-3xl" />
      <div aria-hidden className="absolute -bottom-14 right-0 -z-10 h-40 w-48 rounded-full bg-sky-500/20 blur-3xl" />

      <div className="rounded-3xl border border-white/10 bg-neutral-900/50 p-5 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold text-white">Daily Quests</h2>
          <span className="text-xs font-semibold tabular-nums text-neutral-400">
            {done}/{quests.length}
          </span>
        </div>

        <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
          {quests.map((q, i) => (
            <li key={q.key}>
              <Link
                href={q.href}
                className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-white/[0.04]"
              >
                <QuestCheck done={q.done} index={i} />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm font-semibold transition-colors ${
                      q.done ? "text-neutral-400 line-through decoration-neutral-600" : "text-white"
                    }`}
                  >
                    {q.title}
                  </span>
                  <span className="block truncate text-xs tabular-nums text-neutral-500">{q.sub}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                    q.done ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.06] text-neutral-400"
                  }`}
                >
                  +{q.xp} XP
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs">
          <span className={bonus.done ? "font-semibold text-amber-300" : "text-neutral-500"}>
            {bonus.done ? "All quests cleared" : "Clear all three for a bonus"}
          </span>
          <span className={`font-bold tabular-nums ${bonus.done ? "text-amber-300" : "text-neutral-500"}`}>
            +{bonus.xp} XP
          </span>
        </div>
      </div>
    </section>
  );
}

function QuestCheck({ done, index }: { done: boolean; index: number }) {
  const delay = 0.15 + index * 0.08;
  return (
    <span className="relative grid h-7 w-7 shrink-0 place-items-center" aria-label={done ? "Done" : "Not done"} role="img">
      <span className="absolute inset-0 rounded-full ring-2 ring-inset ring-white/15" />
      <motion.span
        className="absolute inset-0 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.55)]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: done ? 1 : 0, opacity: done ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 18, delay: done ? delay : 0 }}
      />
      <svg viewBox="0 0 24 24" className="relative h-4 w-4" fill="none" aria-hidden>
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="#09090b"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: done ? delay + 0.12 : 0 }}
        />
      </svg>
    </span>
  );
}
