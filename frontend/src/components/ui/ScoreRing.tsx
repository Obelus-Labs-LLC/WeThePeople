import React from 'react';

interface ScoreRingProps {
  score: number;
  maxScore?: number;
  size?: number;
  label?: string;
}

const ScoreRing: React.FC<ScoreRingProps> = ({ score, maxScore = 100, size = 64, label }) => {
  const pct = Math.min(Math.max(score / maxScore, 0), 1);
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  const color = pct >= 0.7 ? 'text-emerald-500' : pct >= 0.4 ? 'text-amber-500' : 'text-rose-500';

  return (
    <div className="inline-flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={6}
          className="text-stone-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={6}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${color} transition-all duration-500`}
        />
      </svg>
      <div className="mt-1 text-sm font-bold text-stone-800">{Math.round(pct * 100)}%</div>
      {label && <div className="text-xs text-stone-500">{label}</div>}
    </div>
  );
};

export default ScoreRing;
