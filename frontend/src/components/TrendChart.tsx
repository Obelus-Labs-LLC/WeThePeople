import { useMemo } from "react";

interface TrendChartProps {
  data: { years: number[]; series: Record<string, number[]> };
  height?: number;
  colors?: Record<string, string>;
}

const DEFAULT_COLORS: Record<string, string> = {
  lobbying: "#3B82F6",
  contracts: "#10B981",
  enforcement: "#EF4444",
  trades: "#F59E0B",
  donations: "#8B5CF6",
  donations_received: "#8B5CF6",
  patents: "#06B6D4",
  votes: "#EC4899",
  bills: "#6366F1",
  trials: "#14B8A6",
  emissions: "#F97316",
};

const DISPLAY_NAMES: Record<string, string> = {
  lobbying: "Lobbying",
  contracts: "Contracts",
  enforcement: "Enforcement",
  trades: "Trades",
  donations: "Donations",
  donations_received: "Donations Received",
  patents: "Patents",
  votes: "Votes",
  bills: "Bills",
  trials: "Trials",
  emissions: "Emissions",
};

export default function TrendChart({ data, height = 160, colors = {} }: TrendChartProps) {
  const { years, series } = data;
  if (!years?.length) return null;

  const seriesEntries = Object.entries(series).filter(([, vals]) => vals.some((v) => v > 0));
  if (!seriesEntries.length) return null;

  const allValues = seriesEntries.flatMap(([, vals]) => vals);
  const maxVal = Math.max(...allValues, 1);
  const padding = { top: 10, right: 16, bottom: 30, left: 16 };
  const chartW = 300; // wider viewBox for better label spacing
  const chartH = height;
  const innerW = chartW - padding.left - padding.right;
  const innerH = chartH - padding.top - padding.bottom;

  const lines = useMemo(() => {
    return seriesEntries.map(([name, vals]) => {
      const color = colors[name] || DEFAULT_COLORS[name] || "#94A3B8";
      const points = vals.map((v, i) => {
        const x = padding.left + (i / Math.max(years.length - 1, 1)) * innerW;
        const y = padding.top + innerH - (v / maxVal) * innerH;
        return `${x},${y}`;
      });
      return { name, color, path: `M${points.join("L")}`, areaPath: `M${points.join("L")}L${padding.left + innerW},${padding.top + innerH}L${padding.left},${padding.top + innerH}Z` };
    });
  }, [seriesEntries, years, maxVal]);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
        {lines.map(({ name, color, areaPath, path }) => (
          <g key={name}>
            <path d={areaPath} fill={color} fillOpacity={0.1} />
            <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
        {years.map((yr, i) => {
          const x = padding.left + (i / Math.max(years.length - 1, 1)) * innerW;
          return (
            <text key={yr} x={x} y={chartH - 6} textAnchor="middle" fill="#94A3B8" fontSize={14} fontFamily="sans-serif" fontWeight="500">
              {yr}
            </text>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {lines.map(({ name, color }) => (
          <div key={name} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            <span>{DISPLAY_NAMES[name] || name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
