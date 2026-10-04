"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: string; // "" when the user hasn't set one
  placeholder?: string; // ghost value shown greyed when value is ""
  onChange: (value: string) => void;
  step: number | ((current: number) => number);
  min?: number;
  max?: number;
  label: string;
  inputMode?: "numeric" | "decimal";
  className?: string;
}

const tidy = (n: number) => String(Number(n.toFixed(2)));

// A number you tap to adjust: tap → − value + steppers (no keyboard), hold a
// stepper to repeat, tap the value itself to type it instead.
export function StepperField({ value, placeholder, onChange, step, min = 0, max = 9999, label, inputMode = "numeric", className = "" }: Props) {
  const [mode, setMode] = useState<"idle" | "step" | "type">("idle");
  const root = useRef<HTMLDivElement>(null);
  const current = useRef(0);
  const repeat = useRef<{ delay?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> }>({});

  const shown = value !== "" ? value : placeholder ?? "";
  current.current = Number(shown) || 0;

  // Tapping anywhere else closes the steppers.
  useEffect(() => {
    if (mode !== "step") return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setMode("idle");
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [mode]);
  useEffect(() => () => stopRepeat(), []);

  function bump(dir: 1 | -1) {
    const size = typeof step === "function" ? step(current.current) : step;
    const next = Math.min(max, Math.max(min, current.current + dir * size));
    current.current = next;
    onChange(tidy(next));
  }
  function startRepeat(dir: 1 | -1) {
    bump(dir);
    stopRepeat();
    repeat.current.delay = setTimeout(() => {
      repeat.current.tick = setInterval(() => bump(dir), 90);
    }, 400);
  }
  function stopRepeat() {
    clearTimeout(repeat.current.delay);
    clearInterval(repeat.current.tick);
  }

  if (mode === "type") {
    return (
      <div ref={root} className={className}>
        <input
          autoFocus
          inputMode={inputMode}
          aria-label={label}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.replace(inputMode === "decimal" ? /[^\d.]/g : /\D/g, ""))}
          onBlur={() => setMode("idle")}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-11 w-full rounded-xl border border-emerald-500/50 bg-zinc-950 text-center text-base font-semibold tabular-nums text-white placeholder:text-neutral-600 focus:outline-none"
        />
      </div>
    );
  }

  if (mode === "step") {
    const btn =
      "grid h-11 w-8 shrink-0 select-none place-items-center text-lg font-semibold text-neutral-300 transition active:bg-white/10 [touch-action:manipulation]";
    const press = (dir: 1 | -1) => ({
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault(); // keep focus where it is; no text selection
        startRepeat(dir);
      },
      onPointerUp: stopRepeat,
      onPointerLeave: stopRepeat,
      onPointerCancel: stopRepeat,
      onClick: (e: React.MouseEvent) => e.detail === 0 && bump(dir), // keyboard activation
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    });
    return (
      <div ref={root} className={`flex h-11 items-stretch overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-inset ring-emerald-500/40 ${className}`}>
        <button type="button" aria-label={`Decrease ${label}`} className={`${btn} rounded-l-xl`} {...press(-1)}>
          −
        </button>
        <button
          type="button"
          onClick={() => setMode("type")}
          aria-label={`${label}: ${shown || "empty"}. Tap to type`}
          className="min-w-0 flex-1 text-center text-base font-semibold tabular-nums text-white"
        >
          {shown || "0"}
        </button>
        <button type="button" aria-label={`Increase ${label}`} className={`${btn} rounded-r-xl`} {...press(1)}>
          +
        </button>
      </div>
    );
  }

  return (
    <div ref={root} className={className}>
      <button
        type="button"
        onClick={() => setMode("step")}
        aria-label={`${label}: ${shown || "empty"}. Tap to adjust`}
        className={`h-11 w-full rounded-xl border border-white/5 bg-zinc-950 text-center text-base tabular-nums transition hover:border-white/15 ${
          value !== "" ? "font-semibold text-white" : "font-medium text-neutral-600"
        }`}
      >
        {shown || "—"}
      </button>
    </div>
  );
}
