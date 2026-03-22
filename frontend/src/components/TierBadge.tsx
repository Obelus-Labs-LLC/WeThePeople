import React from 'react';

const TIER_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  strong: { label: 'Strong', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  moderate: { label: 'Moderate', bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  weak: { label: 'Weak', bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  none: { label: 'Unverified', bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
};

interface TierBadgeProps {
  tier: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function TierBadge({ tier, size = 'md', className = '' }: TierBadgeProps) {
  const config = TIER_CONFIG[tier || 'none'] || TIER_CONFIG.none;
  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wider ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]} ${className}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${config.text.replace('text-', 'bg-')}`} />
      {config.label}
    </span>
  );
}
