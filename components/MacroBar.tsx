"use client";

interface Props {
  label: string;
  consumed: number;
  target: number;
  tone: "protein" | "carbs" | "fat";
}

export function MacroBar({ label, consumed, target, tone }: Props) {
  const pct = target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0;
  const remaining = Math.max(0, Math.round(target - consumed));
  const over = consumed > target;

  return (
    <div className="macro-bar">
      <div className="macro-bar-head">
        <span className="macro-bar-label">{label}</span>
        <span className="macro-bar-nums">
          {Math.round(consumed)} / {target}g
        </span>
      </div>
      <div className="macro-bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`macro-bar-fill macro-${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="macro-bar-remaining">
        {over ? `${Math.round(consumed - target)}g over` : `${remaining}g remaining`}
      </span>
    </div>
  );
}
