import React from 'react';

const TIER_STYLES: Record<string, string> = {
  strong: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  moderate: 'bg-amber-100 text-amber-800 border-amber-300',
  weak: 'bg-orange-100 text-orange-800 border-orange-300',
  none: 'bg-slate-100 text-slate-600 border-slate-300',
};

interface TierBadgeProps {
  tier: string;
  size?: 'sm' | 'md' | 'lg';
}

const TierBadge: React.FC<TierBadgeProps> = ({ tier, size = 'sm' }) => {
  const key = tier?.toLowerCase() || 'none';
  const style = TIER_STYLES[key] || TIER_STYLES.none;
  const sizeClass = size === 'lg' ? 'px-3 py-1.5 text-sm' : size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center rounded-full border font-semibold capitalize ${style} ${sizeClass}`}>
      {key}
    </span>
  );
};

export default TierBadge;
