"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// How long a press must last before the photo unblurs. Long enough that a
// finger landing on a photo to scroll past it never flashes it clear.
const HOLD_MS = 180;

interface Props {
  src?: string;
  alt: string;
  shielded: boolean; // blur until held
  onTap?: () => void; // e.g. pick for compare; without it, Enter/Space also reveals
  label: string;
  caption: (revealed: boolean) => ReactNode;
  className?: string;
}

// A gallery photo behind a privacy blur: press and hold to peek, release to
// hide again. Also re-hides when the press is cancelled (scrolling), the
// pointer leaves, focus moves, or the app goes to the background.
export function ShieldedPhoto({ src, alt, shielded, onTap, label, caption, className = "" }: Props) {
  const [held, setHeld] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealed = !shielded || held;

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHeld(false);
  };
  const startHold = () => {
    if (!shielded) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHeld(true), HOLD_MS);
  };

  useEffect(() => {
    const onHidden = () => document.visibilityState === "hidden" && hide();
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <button
      type="button"
      onPointerDown={startHold}
      onPointerUp={hide}
      onPointerLeave={hide}
      onPointerCancel={hide}
      onBlur={hide}
      onKeyDown={(e) => {
        if (!onTap && shielded && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          setHeld(true);
        }
      }}
      onKeyUp={() => !onTap && hide()}
      onClick={onTap}
      // No long-press image menu / callout / text selection while holding.
      onContextMenu={(e) => shielded && e.preventDefault()}
      aria-label={label}
      className={`relative block w-full select-none overflow-hidden [-webkit-touch-callout:none] [touch-action:pan-y] ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={revealed ? alt : `${alt} (hidden — press and hold to view)`}
          loading="lazy"
          draggable={false}
          className={`pointer-events-none block w-full transition-[filter,transform] duration-300 ease-out ${
            revealed ? "" : "scale-110 blur-xl brightness-75"
          }`}
        />
      ) : (
        <div className="aspect-[3/4] animate-pulse bg-white/5" />
      )}

      {shielded && src && !onTap && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-200 ${
            revealed ? "opacity-0" : "opacity-100"
          }`}
        >
          <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3.2 4.2M6.1 6.1C3.9 7.6 2.5 9.8 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 4.4-1.1" />
            </svg>
            Hold to view
          </span>
        </span>
      )}

      {caption(revealed)}
    </button>
  );
}
