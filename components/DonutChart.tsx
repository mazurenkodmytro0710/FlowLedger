"use client";

import { useMemo } from "react";

const CHART_COLORS = ["#00FF85", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

export interface DonutItem {
  id?: string;
  name: string;
  total: number;
  percent: number;
  icon?: string;
}

export { CHART_COLORS };

export function DonutChart({ data }: { data: DonutItem[] }) {
  const size = 200;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    let offset = 0;
    return data.map((item, index) => {
      const dash = (item.percent / 100) * circumference;
      const gap = Math.max(circumference - dash, 0);
      const segment = {
        dash,
        gap,
        offset,
        color: CHART_COLORS[index % CHART_COLORS.length],
      };
      offset += dash;
      return segment;
    });
  }, [circumference, data]);

  const total = data.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="flex justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1a1a1a"
            strokeWidth={strokeWidth}
          />
          {segments.map((segment, index) => (
            <circle
              key={`${data[index]?.id ?? data[index]?.name ?? index}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${segment.dash} ${segment.gap}`}
              strokeDashoffset={-segment.offset}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xs text-[#6b7280]">Total</p>
          <p className="text-xl font-black text-white">EUR {total.toFixed(0)}</p>
        </div>
      </div>
    </div>
  );
}
