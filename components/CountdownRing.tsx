"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/lifts";

interface Props {
  seconds: number;
  label: string; // e.g. "Plank · set 2"
  onDone: (heldSeconds: number) => void; // log the set
  onCancel: () => void;
}

// Full-screen hold timer: a ring that empties as the clock runs down. Timing
// uses wall-clock deltas (not frame counts), so it stays correct even if the
// phone throttles the page. Keeps the screen awake while running.
export function CountdownRing({ seconds, label, onDone, onCancel }: Props) {
  const [left, setLeft] = useState(seconds * 1000);
  const [paused, setPaused] = useState(false);
  const last = useRef(Date.now());
  const finished = useRef(false);

  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const wakeLock = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } }).wakeLock;
    let lock: Sentinel | null = null;
    wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  useEffect(() => {
    last.current = Date.now();
    if (paused) return;
    const t = setInterval(() => {
      const now = Date.now();
      const dt = now - last.current;
      last.current = now;
      setLeft((l) => Math.max(0, l - dt));
    }, 100);
    return () => clearInterval(t);
  }, [paused]);

  useEffect(() => {
    if (left > 0 || finished.current) return;
    finished.current = true;
    navigator.vibrate?.([200, 100, 200]);
    beep();
    onDone(seconds);
  }, [left, seconds, onDone]);

  const held = Math.round((seconds * 1000 - left) / 1000);
  const size = 240;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-8 bg-zinc-950/95 px-6 backdrop-blur" role="dialog" aria-modal="true" aria-label={`${label} timer`}>
      <p className="m-0 text-sm font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#0ea5e9" strokeOpacity={0.15} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - left / (seconds * 1000))}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 100ms linear" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-6xl font-semibold tabular-nums tracking-tight text-white" aria-live="off">
            {formatDuration(Math.ceil(left / 1000))}
          </span>
        </div>
      </div>
      <div className="grid w-full max-w-xs grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="rounded-2xl py-3.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 transition hover:bg-white/5"
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          disabled={held < 1}
          onClick={() => {
            finished.current = true;
            onDone(held);
          }}
          className="rounded-2xl bg-sky-400 py-3.5 text-sm font-semibold text-zinc-950 transition hover:bg-sky-300 disabled:opacity-40"
        >
          Done · {formatDuration(held)}
        </button>
      </div>
      <button type="button" onClick={onCancel} className="text-sm font-medium text-neutral-500 hover:text-white">
        Cancel — don’t log
      </button>
    </div>
  );
}

// A short two-tone chime without shipping an audio file.
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.18].forEach((at, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = i === 0 ? 880 : 1175;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.17);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    /* audio unavailable — vibration still fires */
  }
}
