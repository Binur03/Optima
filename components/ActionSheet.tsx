"use client";

import Link from "next/link";
import { useEffect } from "react";

const ACTIONS = [
  {
    href: "/log",
    title: "Log Food",
    sub: "Type it, say it, or snap a photo",
    tint: "bg-emerald-500/15 text-emerald-400",
    icon: (
      <>
        <path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5" />
        <path d="M17 21V3c-1.7 0-3 2.2-3 5v5h3" />
      </>
    ),
  },
  {
    href: "/train",
    title: "Log Lift",
    sub: "Repeat last session in one tap",
    tint: "bg-sky-400/15 text-sky-300",
    icon: (
      <>
        <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
      </>
    ),
  },
  {
    href: "/history?add=1",
    title: "Add Progress Photo",
    sub: "Private — only you can see it",
    tint: "bg-rose-500/15 text-rose-300",
    icon: (
      <>
        <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.6a1 1 0 0 1 .8-.4h3.8a1 1 0 0 1 .8.4L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
        <circle cx="12" cy="12.5" r="3.2" />
      </>
    ),
  },
];

export function ActionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Add">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[480px] animate-sheet-up rounded-t-3xl border-t border-white/10 bg-neutral-900 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <h2 className="m-0 mb-3 text-lg font-semibold text-white">Add</h2>
        <div className="flex flex-col gap-2">
          {ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              onClick={onClose}
              className="flex items-center gap-4 rounded-2xl bg-white/[0.03] p-3.5 transition hover:bg-white/[0.06] active:scale-[0.99]"
            >
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${a.tint}`}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {a.icon}
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-white">{a.title}</span>
                <span className="block truncate text-sm text-neutral-400">{a.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
