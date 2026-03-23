import React from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Vote,
  TrendingUp,
  Briefcase,
  Shield,
  DollarSign,
  Users,
  BarChart3,
  ExternalLink,
} from 'lucide-react';
import type { EvidenceItem } from '../api/claims';

const TYPE_CONFIG: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  legislative_action: { icon: FileText, color: 'text-blue-400', label: 'Legislative Action' },
  vote_record: { icon: Vote, color: 'text-violet-400', label: 'Vote Record' },
  trade_record: { icon: TrendingUp, color: 'text-emerald-400', label: 'Trade Record' },
  lobbying_record: { icon: Briefcase, color: 'text-cyan-400', label: 'Lobbying Record' },
  contract_record: { icon: Briefcase, color: 'text-orange-400', label: 'Contract Record' },
  enforcement_record: { icon: Shield, color: 'text-red-400', label: 'Enforcement Record' },
  donation_record: { icon: DollarSign, color: 'text-yellow-400', label: 'Donation Record' },
  committee_record: { icon: Users, color: 'text-purple-400', label: 'Committee Record' },
  sec_filing_record: { icon: BarChart3, color: 'text-sky-400', label: 'SEC Filing' },
  sec_insider_trade: { icon: TrendingUp, color: 'text-pink-400', label: 'SEC Insider Trade' },
  // legacy compat
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
        const config = TYPE_CONFIG[type] ?? { icon: FileText, color: 'text-slate-400' as const, label: type };
        const Icon = config.icon;
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

function getDisplayInfo(item: EvidenceItem, type: string): { title?: string; description?: string; date?: string; amount?: number; sourceUrl?: string } {
  switch (type) {
    case 'legislative_action':
      return {
        title: item.title || (item.bill_type && item.bill_number ? `${item.bill_type} ${item.bill_number}` : undefined),
        date: item.date,
        sourceUrl: item.source_url,
      };
    case 'vote_record':
      return {
        title: item.question,
        description: item.position ? `Position: ${item.position}${item.result ? ` | Result: ${item.result}` : ''}` : undefined,
        date: item.vote_date,
      };
    case 'trade_record':
      return {
        title: item.ticker ? `${item.transaction_type || 'Trade'}: ${item.ticker}` : undefined,
        description: item.amount_range ? `Amount: ${item.amount_range}` : undefined,
        date: item.transaction_date,
      };
    case 'lobbying_record':
      return {
        title: item.client_name || item.registrant_name,
        description: item.specific_issues ? item.specific_issues.slice(0, 120) : undefined,
        date: item.filing_year,
      };
    case 'contract_record':
      return {
        title: item.awarding_agency ? `Contract from ${item.awarding_agency}` : 'Government Contract',
        description: item.description?.slice(0, 120),
        date: item.start_date,
        amount: item.award_amount,
      };
    case 'enforcement_record':
      return {
        title: item.case_title || item.enforcement_type || 'Enforcement Action',
        description: item.enforcement_type ? `Type: ${item.enforcement_type}` : undefined,
        date: item.case_date,
        amount: item.penalty_amount,
        sourceUrl: item.case_url,
      };
    case 'donation_record':
      return {
        title: item.committee_name || 'Campaign Donation',
        description: item.cycle ? `Cycle: ${item.cycle}` : undefined,
        date: item.donation_date,
        amount: item.amount,
      };
    case 'committee_record':
      return {
        title: item.committee_name || item.committee_name_display,
        description: item.role ? `Role: ${item.role.replace(/_/g, ' ')}${item.chamber ? ` | ${item.chamber}` : ''}` : undefined,
      };
    case 'sec_filing_record':
    case 'sec_insider_trade':
      return {
        title: item.description,
        date: item.date,
        sourceUrl: item.source_url,
      };
    default:
      return { title: item.title, description: item.description, date: item.date, amount: item.amount, sourceUrl: item.url || item.source_url };
  }
}

function EvidenceRow({ item, type }: { item: EvidenceItem; type: string }) {
  const internalLink = getInternalLink(item, type);
  const display = getDisplayInfo(item, type);
  const date = display.date
    ? (() => {
        try { return new Date(display.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
        catch { return display.date; }
      })()
    : null;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {display.title && (
            <p className="text-sm font-medium text-white/90 mb-1">{display.title}</p>
          )}
          {display.description && (
            <p className="text-xs text-slate-400 leading-relaxed">{display.description}</p>
          )}
        </div>
        {item.score !== undefined && (
          <span className="shrink-0 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5">
            {item.score >= 1 ? item.score.toFixed(1) : Math.round(item.score * 100) + '%'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
        {date && <span>{date}</span>}
        {display.amount !== undefined && display.amount !== null && (
          <span className="font-mono">${display.amount.toLocaleString()}</span>
        )}
        {internalLink && (
          <Link to={internalLink} className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5">
            View details <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        )}
        {display.sourceUrl && (
          <a
            href={display.sourceUrl}
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
  if ((type === 'bill' || type === 'legislative_action') && item.bill_id) return `/politics/bill/${item.bill_id}`;
  if ((type === 'vote' || type === 'vote_record') && item.vote_id) return `/politics/vote/${item.vote_id}`;
  return null;
}
