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
  patents: "#06B6D4",
  votes: "#EC4899",
  bills: "#6366F1",
  trials: "#14B8A6",
  emissions: "#F97316",
};

export default function TrendChart({ data, height = 120, colors = {} }: TrendChartProps) {
  const { years, series } = data;
  if (!years?.length) return null;

  const seriesEntries = Object.entries(series).filter(([, vals]) => vals.some((v) => v > 0));
  if (!seriesEntries.length) return null;

  const allValues = seriesEntries.flatMap(([, vals]) => vals);
  const maxVal = Math.max(...allValues, 1);
  const padding = { top: 10, right: 10, bottom: 24, left: 10 };
  const chartW = 100; // percent-based, SVG viewBox handles it
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
            <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
        {years.map((yr, i) => {
          const x = padding.left + (i / Math.max(years.length - 1, 1)) * innerW;
          return i % Math.max(1, Math.floor(years.length / 5)) === 0 ? (
            <text key={yr} x={x} y={chartH - 4} textAnchor="middle" fill="#71717A" fontSize={7} fontFamily="sans-serif">
              {yr}
            </text>
          ) : null;
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {lines.map(({ name, color }) => (
          <div key={name} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="capitalize">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
