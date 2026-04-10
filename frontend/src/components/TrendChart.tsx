import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

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

function formatValue(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString();
}

interface PayloadEntry {
  dataKey: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: PayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.95)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "Geist Variable, system-ui, sans-serif",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#94A3B8",
          marginBottom: 6,
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
      {payload.map((entry: PayloadEntry) => (
        <div
          key={entry.dataKey}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            marginBottom: 2,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: entry.color,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#CBD5E1" }}>
            {DISPLAY_NAMES[entry.dataKey] || entry.dataKey}
          </span>
          <span
            style={{
              color: entry.color,
              fontWeight: 600,
              fontFamily: "monospace",
              marginLeft: "auto",
            }}
          >
            {formatValue(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TrendChart({
  data,
  height = 220,
  colors = {},
}: TrendChartProps) {
  const { years, series } = data;
  if (!years?.length) return null;

  const seriesKeys = Object.keys(series).filter((k) =>
    series[k].some((v) => v > 0)
  );
  if (!seriesKeys.length) return null;

  const chartData = useMemo(
    () =>
      years.map((yr, i) => {
        const row: Record<string, number | string> = { year: String(yr) };
        for (const key of seriesKeys) {
          row[key] = series[key][i] ?? 0;
        }
        return row;
      }),
    [years, series, seriesKeys]
  );

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.06)"
            vertical={false}
          />
          <XAxis
            dataKey="year"
            axisLine={false}
            tickLine={false}
            tick={{
              fill: "#64748B",
              fontSize: 11,
              fontFamily: "Geist Variable, system-ui, sans-serif",
              fontWeight: 500,
            }}
            dy={8}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{
              fill: "#475569",
              fontSize: 10,
              fontFamily: "monospace",
            }}
            tickFormatter={formatValue}
            width={48}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{
              stroke: "rgba(255,255,255,0.08)",
              strokeWidth: 1,
              strokeDasharray: "4 4",
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="circle"
            iconSize={6}
            formatter={(value: string) => (
              <span
                style={{
                  color: "#94A3B8",
                  fontSize: 11,
                  fontFamily: "Geist Variable, system-ui, sans-serif",
                }}
              >
                {DISPLAY_NAMES[value] || value}
              </span>
            )}
          />
          {seriesKeys.map((key) => {
            const color = colors[key] || DEFAULT_COLORS[key] || "#94A3B8";
            return (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: color,
                  stroke: "#0F172A",
                  strokeWidth: 2,
                }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
