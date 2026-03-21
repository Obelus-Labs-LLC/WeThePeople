import React from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';

interface SanctionsBadgeProps {
  status: string | null | undefined;
}

export default function SanctionsBadge({ status }: SanctionsBadgeProps) {
  if (!status || status === 'clear') return null;

  const config = {
    sanctioned: {
      label: 'SANCTIONED',
      icon: ShieldAlert,
      bg: 'bg-red-500/20',
      text: 'text-red-400',
      border: 'border-red-500/30',
      title: 'This entity appears on international sanctions lists (OFAC, EU, UN)',
    },
    pep: {
      label: 'PEP',
      icon: AlertTriangle,
      bg: 'bg-yellow-500/20',
      text: 'text-yellow-400',
      border: 'border-yellow-500/30',
      title: 'Politically Exposed Person — flagged by OpenSanctions',
    },
    listed: {
      label: 'WATCHLIST',
      icon: ShieldCheck,
      bg: 'bg-orange-500/20',
      text: 'text-orange-400',
      border: 'border-orange-500/30',
      title: 'Listed in OpenSanctions database — review recommended',
    },
  }[status];

  if (!config) return null;

  const Icon = config.icon;

  return (
    <a
      href="https://www.opensanctions.org/"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-80 ${config.bg} ${config.text} ${config.border}`}
      title={config.title}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </a>
  );
}
