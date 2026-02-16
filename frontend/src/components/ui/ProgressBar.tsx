import React from 'react';

interface Segment {
  label: string;
  value: number;
  color: string;
}

interface ProgressBarProps {
  segments: Segment[];
  total?: number;
  showLabels?: boolean;
  height?: 'sm' | 'md' | 'lg';
}

const HEIGHTS = { sm: 'h-2', md: 'h-3', lg: 'h-5' };

const ProgressBar: React.FC<ProgressBarProps> = ({ segments, total, showLabels = true, height = 'md' }) => {
  const computedTotal = total ?? segments.reduce((acc, s) => acc + s.value, 0);
  if (computedTotal === 0) return null;

  return (
    <div>
      <div className={`flex overflow-hidden rounded-full bg-stone-100 ${HEIGHTS[height]}`}>
        {segments.map((seg, i) => {
          const pct = (seg.value / computedTotal) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={i}
              className={`${seg.color} transition-all duration-300`}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${seg.value} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      {showLabels && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${seg.color}`} />
              <span>{seg.label}: {seg.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProgressBar;
