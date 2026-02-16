import React from 'react';

const PARTY_STYLES: Record<string, { bg: string; label: string }> = {
  D: { bg: 'bg-blue-100 text-blue-800 border-blue-300', label: 'Democrat' },
  R: { bg: 'bg-red-100 text-red-800 border-red-300', label: 'Republican' },
  I: { bg: 'bg-purple-100 text-purple-800 border-purple-300', label: 'Independent' },
};

interface PartyBadgeProps {
  party: string;
  compact?: boolean;
}

const PartyBadge: React.FC<PartyBadgeProps> = ({ party, compact = false }) => {
  const key = party?.charAt(0).toUpperCase() || 'I';
  const config = PARTY_STYLES[key] || PARTY_STYLES.I;

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${config.bg}`}>
      {compact ? key : config.label}
    </span>
  );
};

export default PartyBadge;
