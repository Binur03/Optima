"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassTooltip, formatDay, useMounted } from "./GlassTooltip";

interface Props<T> {
  data: T[];
  dataKey: keyof T & string;
  color: string;
  unit: string;
  detailKey?: keyof T & string;
  height?: number;
}

// Smooth monotone line with a soft gradient fading to the axis. No grid, no
// axis lines — just the data. Shared by the weight and lift charts.
export function TrendAreaChart<T extends { date: string }>({
  data,
  dataKey,
  color,
  unit,
  detailKey,
  height = 200,
}: Props<T>) {
  const mounted = useMounted();
  const gradientId = `grad-${useId().replace(/:/g, "")}`;

  return (
    <div style={{ height }}>
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 6, bottom: 0, left: 6 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#737373", fontSize: 11 }}
              tickFormatter={formatDay}
              minTickGap={36}
              dy={6}
            />
            <YAxis
              hide
              domain={[
                (min: number) => Math.floor(min - Math.max(2, min * 0.02)),
                (max: number) => Math.ceil(max + Math.max(2, max * 0.02)),
              ]}
            />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
              content={<GlassTooltip unit={unit} labelFormat={formatDay} detailKey={detailKey} />}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={3}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 5, fill: color, stroke: "#0a0a0a", strokeWidth: 2 }}
              // Drawn instantly like native health apps — a left-to-right wipe
              // can freeze half-drawn if the tab is backgrounded mid-animation.
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
