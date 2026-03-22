import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, User, FileText } from 'lucide-react';
import TierBadge from './TierBadge';
import type { VerificationItem } from '../api/claims';

interface VerificationCardProps {
  item: VerificationItem;
  showEntity?: boolean;
}

export default function VerificationCard({ item, showEntity = true }: VerificationCardProps) {
  const tier = item.evaluation?.tier || 'none';
  const score = item.evaluation?.score;
  const created = item.created_at
    ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Link
      to={`/verify/results/${item.id}`}
      className="block rounded-xl border border-white/10 bg-white/[0.04] p-4 transition-all hover:bg-white/[0.08] hover:border-white/20 no-underline"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <TierBadge tier={tier} size="sm" />
        {score !== undefined && score !== null && (
          <span className="text-xs font-mono text-slate-400">
            {Math.round(score * 100)}% match
          </span>
        )}
      </div>

      <p className="text-sm text-white/90 leading-relaxed mb-3 line-clamp-3">
        {item.text}
      </p>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        {showEntity && item.entity_name && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {item.entity_name}
          </span>
        )}
        {showEntity && !item.entity_name && item.person_id && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {item.person_id}
          </span>
        )}
        {item.category && (
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {item.category}
          </span>
        )}
        {created && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {created}
          </span>
        )}
      </div>
    </Link>
  );
}
