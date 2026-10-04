"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// Bubbles fan out in an arc just above the + button, in thumb reach.
const ACTIONS = [
  {
    href: "/log",
    label: "Food",
    tint: "bg-emerald-500 text-zinc-950 shadow-emerald-500/40",
    x: -84,
    y: -64,
    icon: (
      <>
        <path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5" />
        <path d="M17 21V3c-1.7 0-3 2.2-3 5v5h3" />
      </>
    ),
  },
  {
    href: "/train",
    label: "Lift",
    tint: "bg-sky-400 text-zinc-950 shadow-sky-400/40",
    x: 0,
    y: -104,
    icon: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  },
  {
    href: "/history?add=1",
    label: "Photo",
    tint: "bg-rose-500 text-white shadow-rose-500/40",
    x: 84,
    y: -64,
    icon: (
      <>
        <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.6a1 1 0 0 1 .8-.4h3.8a1 1 0 0 1 .8.4L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
        <circle cx="12" cy="12.5" r="3.2" />
      </>
    ),
  },
];

export function SpeedDial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            key="backdrop"
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="fixed inset-0 z-[55] h-full w-full cursor-default bg-black/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
          {/* Anchored to the centre of the + button. */}
          <div
            key="dial"
            role="menu"
            aria-label="Add"
            className="pointer-events-none fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-1/2 z-[60] h-0 w-0"
          >
            {ACTIONS.map((a, i) => (
              <motion.div
                key={a.href}
                // Framer owns `transform`, so centre with margins: 80px wide, bubble centre on the anchor.
                className="pointer-events-auto absolute left-0 top-0 -ml-10 -mt-7 w-20"
                initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                animate={{ x: a.x, y: a.y, scale: 1, opacity: 1 }}
                exit={{ x: 0, y: 0, scale: 0.3, opacity: 0, transition: { duration: 0.12 } }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 28, delay: i * 0.035 }}
              >
                <Link
                  href={a.href}
                  role="menuitem"
                  onClick={onClose}
                  className="flex flex-col items-center gap-1.5 [touch-action:manipulation]"
                >
                  <span className={`grid h-14 w-14 place-items-center rounded-full shadow-lg ring-4 ring-zinc-950/60 active:scale-95 ${a.tint}`}>
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {a.icon}
                    </svg>
                  </span>
                  <span className="rounded-full bg-zinc-950/80 px-2.5 py-0.5 text-xs font-semibold text-white">{a.label}</span>
                </Link>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
