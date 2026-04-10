import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

interface SpendingChartProps {
  /** Array of objects — each must have a `year` field and a numeric value field */
  data: AnyRow[];
  height?: number;
  color?: string;
  /** If true, uses gradient coloring per bar based on index */
  gradient?: boolean;
  /** The key to use for the bar value (default: "total_amount") */
  valueKey?: string;
  /** Custom formatter for tooltip values (default: dollar formatting) */
  valueFormatter?: (n: number) => string;
  /** Label for the count sub-line in tooltip (default: "contract") */
  countLabel?: string;
}

function fmtDollar(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtShort(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function CustomTooltip({
  active,
  payload,
  label,
  valueKey,
  valueFormatter,
  countLabel,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
  label?: string;
  valueKey: string;
  valueFormatter: (n: number) => string;
  countLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const val = Number(d[valueKey]) || 0;
  const count = d.count != null ? Number(d.count) : null;
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
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#F1F5F9",
          fontFamily: "monospace",
        }}
      >
        {valueFormatter(val)}
      </div>
      {count != null && (
        <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
          {count} {countLabel}{count !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

const BAR_GRADIENT_COLORS = [
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#A855F7",
  "#EC4899",
  "#F43F5E",
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#10B981",
];

export default function SpendingChart({
  data,
  height = 240,
  color = "#3B82F6",
  gradient = true,
  valueKey = "total_amount",
  valueFormatter = fmtDollar,
  countLabel = "contract",
}: SpendingChartProps) {
  if (!data?.length) return null;

  const chartData = data.map((d) => ({
    ...d,
    year: String(d.year),
    [valueKey]: Number(d[valueKey]) || 0,
  }));

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          barCategoryGap="20%"
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
            tickFormatter={(v: number) => fmtShort(v)}
            width={58}
          />
          <Tooltip
            content={
              <CustomTooltip
                valueKey={valueKey}
                valueFormatter={valueFormatter}
                countLabel={countLabel}
              />
            }
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          <Bar
            dataKey={valueKey}
            radius={[4, 4, 0, 0]}
            maxBarSize={56}
          >
            {chartData.map((_entry, index) => (
              <Cell
                key={index}
                fill={
                  gradient
                    ? BAR_GRADIENT_COLORS[index % BAR_GRADIENT_COLORS.length]
                    : color
                }
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
