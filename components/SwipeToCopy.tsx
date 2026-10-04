"use client";

import { useRef, useState, type ReactNode } from "react";

const THRESHOLD = 72; // px to the right that commits the copy
const MAX = 112;

interface Props {
  onCopy: () => void;
  label: string; // shown behind the row, e.g. "Copy to today"
  a11yLabel: string; // keyboard / screen-reader button, e.g. "Copy Oatmeal to today"
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

// Swipe a row to the right to copy it. Vertical scrolling is left to the
// browser (touch-action: pan-y); the row only starts tracking once the finger
// clearly moves sideways, so taps and scrolls inside it behave normally.
export function SwipeToCopy({ onCopy, label, a11yLabel, disabled, children, className = "" }: Props) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const engaged = useRef(false);
  const swallowClick = useRef(false);

  const commit = () => {
    onCopy();
    setDone(true);
    navigator.vibrate?.(12);
    setTimeout(() => setDone(false), 1100);
  };

  const end = () => {
    if (engaged.current && dx >= THRESHOLD) commit();
    if (engaged.current) swallowClick.current = true;
    start.current = null;
    engaged.current = false;
    setDragging(false);
    setDx(0);
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Revealed behind the row as it slides. */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center gap-2 bg-emerald-500 pl-4 text-sm font-semibold text-zinc-950"
        style={{ opacity: done ? 1 : Math.min(1, dx / THRESHOLD) }}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          {done ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : <path d="M9 9h10v10H9zM5 15V5h10" />}
        </svg>
        {done ? "Done" : dx >= THRESHOLD ? "Release to " + label.toLowerCase() : label}
      </div>

      <div
        onPointerDown={(e) => {
          if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          engaged.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || e.pointerId !== s.id) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!engaged.current) {
            if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
              start.current = null; // it's a scroll
              return;
            }
            if (mx < 10 || mx < Math.abs(my)) return;
            engaged.current = true;
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          setDx(Math.max(0, Math.min(MAX, mx)));
        }}
        onPointerUp={end}
        onPointerCancel={end}
        // A swipe shouldn't also count as a tap on whatever is under the finger.
        onClickCapture={(e) => {
          if (swallowClick.current) {
            swallowClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        className="relative bg-inherit [touch-action:pan-y]"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {children}
      </div>

      {/* Same action without a swipe, for keyboard and screen readers. */}
      <button
        type="button"
        onClick={commit}
        disabled={disabled}
        className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-1/2 focus:-translate-y-1/2 focus:rounded-lg focus:bg-emerald-500 focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:text-zinc-950"
      >
        {a11yLabel}
      </button>
    </div>
  );
}
