import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { getEntityVerifications, type EntityVerificationsResponse } from '../api/claims';
import VerificationCard from '../components/VerificationCard';
import TierBadge from '../components/TierBadge';
import { VerifySectorHeader } from '../components/SectorHeader';

const PAGE_SIZE = 20;

export default function VerifyEntityPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [data, setData] = useState<EntityVerificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!type || !id) return;
    setLoading(true);
    getEntityVerifications(type, id, { limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type, id, page]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen px-4 py-6 sm:px-8">
        <VerifySectorHeader />
        <div className="max-w-2xl mx-auto mt-20 text-center">
          <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">No Data Found</h2>
          <Link to="/verify" className="text-sm text-emerald-400 hover:text-emerald-300">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const tierSummary = data.tier_summary || {};

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8">
      <VerifySectorHeader />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        <Link
          to="/verify"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-6 no-underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to verifications
        </Link>

        {/* Entity header */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <div>
              <h1 className="text-xl font-bold text-white">{data.entity_id}</h1>
              <span className="text-xs uppercase font-semibold text-emerald-400 bg-emerald-500/15 rounded px-2 py-0.5">
                {data.entity_type}
              </span>
            </div>
          </div>

          {/* Tier summary */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">{data.total} total claims</span>
            {['strong', 'moderate', 'weak', 'none'].map((tier) => {
              const count = tierSummary[tier] || 0;
              if (count === 0) return null;
              return (
                <span key={tier} className="flex items-center gap-1">
                  <TierBadge tier={tier} size="sm" />
                  <span className="text-xs text-slate-400 font-mono">{count}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Verification list */}
        {data.items.length > 0 ? (
          <div className="grid gap-3">
            {data.items.map((item) => (
              <VerificationCard key={item.id} item={item} showEntity={false} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-sm text-slate-400">No verifications for this entity yet.</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
