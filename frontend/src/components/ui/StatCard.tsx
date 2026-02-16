import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
}

const ACCENTS: Record<string, string> = {
  blue: 'border-l-blue-500',
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  rose: 'border-l-rose-500',
  slate: 'border-l-slate-400',
};

const StatCard: React.FC<StatCardProps> = ({ label, value, subtitle, accent = 'blue' }) => {
  return (
    <div className={`rounded-xl bg-white border border-stone-200 border-l-4 ${ACCENTS[accent]} p-5 shadow-sm`}>
      <div className="text-sm font-medium text-stone-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-stone-900">{value}</div>
      {subtitle && <div className="mt-1 text-sm text-stone-400">{subtitle}</div>}
    </div>
  );
};

export default StatCard;
