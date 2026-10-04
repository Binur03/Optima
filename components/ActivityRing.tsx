"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface Ring {
  label: string;
  value: number;
  goal: number;
  from: string; // gradient start (tail of the ring)
  to: string; // gradient end (head of the ring)
}

interface Props {
  rings: Ring[]; // outermost first
  size?: number;
  stroke?: number;
  gap?: number;
}

// Apple Watch–style concentric rings. Each ring draws in with a spring on
// stroke-dashoffset; a ring that reaches its goal pops and picks up a glow.
export function ActivityRing({ rings, size = 140, stroke = 14, gap = 4 }: Props) {
  const mid = size / 2;
  const uid = useId().replace(/:/g, "");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 overflow-visible"
      role="img"
      aria-label={rings
        .map((r) => `${r.label} ${Math.round(r.goal > 0 ? (r.value / r.goal) * 100 : 0)}%`)
        .join(", ")}
    >
      {rings.map((ring, i) => (
        <RingTrack
          key={ring.label}
          ring={ring}
          r={mid - stroke / 2 - i * (stroke + gap)}
          mid={mid}
          stroke={stroke}
          index={i}
          gradientId={`${uid}-${i}`}
        />
      ))}
    </svg>
  );
}

function RingTrack({
  ring,
  r,
  mid,
  stroke,
  index,
  gradientId,
}: {
  ring: Ring;
  r: number;
  mid: number;
  stroke: number;
  index: number;
  gradientId: string;
}) {
  const reduce = useReducedMotion();
  const c = 2 * Math.PI * r;
  const progress = ring.goal > 0 ? Math.min(1, Math.max(0, ring.value / ring.goal)) : 0;
  const complete = ring.goal > 0 && ring.value >= ring.goal;

  // Fires once the stroke has (nearly) finished drawing closed.
  const celebrate = 0.65 + index * 0.12;

  return (
    <motion.g
      style={{ transformOrigin: `${mid}px ${mid}px` }}
      initial={{ scale: 1 }}
      animate={{ scale: complete ? [1, 1.07, 1] : 1 }}
      transition={reduce ? { duration: 0 } : { duration: 0.55, times: [0, 0.35, 1], ease: "easeOut", delay: celebrate }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={ring.from} />
          <stop offset="100%" stopColor={ring.to} />
        </linearGradient>
        {/* SVG-native blur: CSS filters on SVG children don't render in Safari. */}
        <filter id={`${gradientId}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={stroke / 3} />
        </filter>
      </defs>
      <circle cx={mid} cy={mid} r={r} fill="none" stroke={ring.to} strokeOpacity={0.16} strokeWidth={stroke} />
      <motion.circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke={ring.to}
        strokeWidth={stroke}
        filter={`url(#${gradientId}-glow)`}
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: complete ? 0.75 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.6, delay: complete ? celebrate : 0 }}
      />
      <motion.circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        transform={`rotate(-90 ${mid} ${mid})`}
        // A zero-length round cap still paints a dot — hide it until there's progress.
        strokeOpacity={progress > 0 ? 1 : 0}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - progress) }}
        transition={
          reduce ? { duration: 0 } : { type: "spring", stiffness: 55, damping: 16, delay: index * 0.12 }
        }
      />
    </motion.g>
  );
}

// Semantic macro hues — the same colours label P / C / F everywhere in the app.
export const RING_COLORS = {
  protein: { from: "#6ee7b7", to: "#10b981" }, // emerald
  carbs: { from: "#fcd34d", to: "#f59e0b" }, // amber
  fat: { from: "#fda4af", to: "#f43f5e" }, // rose
  workout: { from: "#7dd3fc", to: "#0ea5e9" }, // sky
} as const;
