import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, User, Calendar, ExternalLink, Tag } from 'lucide-react';
import { motion } from 'framer-motion';
import { getVerificationDetail, type VerificationDetailResponse } from '../api/claims';
import TierBadge from '../components/TierBadge';
import EvidenceList from '../components/EvidenceList';
import { VerifySectorHeader } from '../components/SectorHeader';

export default function VerifyResultPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<VerificationDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getVerificationDetail(Number(id))
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen px-4 py-6 sm:px-8">
        <VerifySectorHeader />
        <div className="max-w-2xl mx-auto mt-20 text-center">
          <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Verification Not Found</h2>
          <p className="text-sm text-slate-400 mb-6">{error || 'This verification does not exist.'}</p>
          <Link to="/verify" className="text-sm text-emerald-400 hover:text-emerald-300">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const created = data.created_at
    ? new Date(data.created_at).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8">
      <VerifySectorHeader />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        {/* Back link */}
        <Link
          to="/verify"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-6 no-underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to verifications
        </Link>

        {/* Main card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <TierBadge tier={data.evaluation?.tier} size="lg" />
            {data.evaluation?.score !== undefined && (
              <div className="text-right">
                <div className="text-2xl font-bold text-white font-mono">
                  {Math.round(data.evaluation.score * 100)}%
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Match Score</div>
              </div>
            )}
          </div>

          {/* Claim text */}
          <blockquote className="text-base text-white/90 leading-relaxed mb-6 pl-4 border-l-2 border-emerald-500/40">
            {data.text}
          </blockquote>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-4 mb-6 text-xs text-slate-400">
            {data.entity_name && (
              <Link
                to={`/verify/entity/politician/${data.person_id}`}
                className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 no-underline"
              >
                <User className="w-3.5 h-3.5" /> {data.entity_name}
              </Link>
            )}
            {data.category && (
              <span className="flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" /> {data.category}
              </span>
            )}
            {created && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> {created}
              </span>
            )}
            {data.source_url && (
              <a
                href={data.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Source
              </a>
            )}
          </div>

          {/* Evaluation details */}
          {data.evaluation && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Relevance', value: data.evaluation.relevance != null ? `${Math.round(data.evaluation.relevance * 100)}%` : '-' },
                { label: 'Progress', value: data.evaluation.progress != null ? `${Math.round(data.evaluation.progress * 100)}%` : '-' },
                { label: 'Timing', value: data.evaluation.timing != null ? `${Math.round(data.evaluation.timing * 100)}%` : '-' },
                { label: 'Overall', value: data.evaluation.score != null ? `${Math.round(data.evaluation.score * 100)}%` : '-' },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
                  <div className="text-lg font-bold text-white font-mono">{m.value}</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">{m.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Why */}
          {data.evaluation?.why && data.evaluation.why.length > 0 && (
            <div className="mb-6 pl-4 border-l-2 border-emerald-500/30">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Analysis</p>
              {data.evaluation.why.map((reason, j) => (
                <p key={j} className="text-sm text-slate-300 leading-relaxed mb-1">{reason}</p>
              ))}
            </div>
          )}

          {/* Evidence */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Evidence Matches
            </h3>
            <EvidenceList evidence={data.evaluation?.evidence || []} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
