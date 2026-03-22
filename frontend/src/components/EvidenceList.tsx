import React from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Vote,
  TrendingUp,
  Briefcase,
  Shield,
  DollarSign,
  ExternalLink,
} from 'lucide-react';
import type { EvidenceItem } from '../api/claims';

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  bill: { icon: FileText, color: 'text-blue-400', label: 'Bill Match' },
  vote: { icon: Vote, color: 'text-violet-400', label: 'Vote Match' },
  trade: { icon: TrendingUp, color: 'text-emerald-400', label: 'Trade Match' },
  contract: { icon: Briefcase, color: 'text-orange-400', label: 'Contract Match' },
  enforcement: { icon: Shield, color: 'text-red-400', label: 'Enforcement Match' },
  donation: { icon: DollarSign, color: 'text-yellow-400', label: 'Donation Match' },
};

interface EvidenceListProps {
  evidence: EvidenceItem[];
  className?: string;
}

export default function EvidenceList({ evidence, className = '' }: EvidenceListProps) {
  if (!evidence || evidence.length === 0) {
    return (
      <div className={`text-sm text-slate-500 italic ${className}`}>
        No evidence matches found.
      </div>
    );
  }

  // Group by type
  const grouped: Record<string, EvidenceItem[]> = {};
  for (const item of evidence) {
    const key = item.type || 'other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {Object.entries(grouped).map(([type, items]: [string, EvidenceItem[]]) => {
        const config = TYPE_CONFIG[type] ?? { icon: FileText, color: 'text-slate-400', label: type };
        const Icon = config.icon as React.ElementType;
        return (
          <div key={type}>
            <div className={`flex items-center gap-2 mb-2 ${config.color}`}>
              <Icon className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {config.label} ({items.length})
              </span>
            </div>
            <div className="space-y-2 pl-6">
              {items.map((ev, i) => (
                <EvidenceRow key={i} item={ev} type={type} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EvidenceRow({ item, type }: { item: EvidenceItem; type: string }) {
  const internalLink = getInternalLink(item, type);
  const date = item.date
    ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {item.title && (
            <p className="text-sm font-medium text-white/90 mb-1">{item.title}</p>
          )}
          {item.description && (
            <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
          )}
        </div>
        {item.match_score !== undefined && (
          <span className="shrink-0 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5">
            {Math.round(item.match_score * 100)}%
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
        {date && <span>{date}</span>}
        {item.amount !== undefined && item.amount !== null && (
          <span className="font-mono">${item.amount.toLocaleString()}</span>
        )}
        {internalLink && (
          <Link to={internalLink} className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5">
            View details <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        )}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
          >
            Source <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function getInternalLink(item: EvidenceItem, type: string): string | null {
  if (type === 'bill' && item.bill_id) return `/politics/bill/${item.bill_id}`;
  if (type === 'vote' && item.vote_id) return `/politics/vote/${item.vote_id}`;
  return null;
}
