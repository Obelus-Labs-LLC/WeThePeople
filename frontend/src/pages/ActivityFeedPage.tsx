import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Vote, ExternalLink, CheckCircle, XCircle, Clock } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { apiClient } from '../api/client';
import type { RecentAction, Vote as VoteType } from '../api/types';
import SpotlightCard from '../components/SpotlightCard';
import { PoliticsSectorHeader } from '../components/SectorHeader';

// ── Helpers ──

function actionTypeColor(action: RecentAction): { bg: string; border: string; icon: string } {
  if (action.bill_type && action.bill_number) {
    return { bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.30)', icon: '#3B82F6' };
  }
  return { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', icon: '#F59E0B' };
}

function formatDate(dateStr: string | null): { day: string; month: string; full: string } {
  if (!dateStr) return { day: '--', month: '---', full: '' };
  const d = new Date(dateStr);
  return {
    day: d.getDate().toString(),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    full: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  };
}

// ── Pagination ──
const PAGE_SIZE = 20;

// ── Page ──

export default function ActivityFeedPage() {
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [votes, setVotes] = useState<VoteType[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const headerRef = React.useRef<HTMLDivElement>(null);
  const headerInView = useInView(headerRef, { once: true, amount: 0.1 });

  useEffect(() => {
    Promise.all([
      apiClient.getRecentActions(100),
      apiClient.getVotes({ limit: 20 }),
    ])
      .then(([actionsRes, votesRes]) => {
        setActions(actionsRes || []);
        setVotes(votesRes.votes || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const totalPages = Math.ceil(actions.length / PAGE_SIZE);
  const visibleActions = actions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Build page numbers (max 7 visible)
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1000px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Header */}
        <motion.div
          ref={headerRef}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <PoliticsSectorHeader />
          <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
            Activity Feed
          </h1>
          <p className="font-body text-lg text-white/50">
            Latest legislative actions and roll call votes
          </p>
        </motion.div>

        {/* Two-column layout: Timeline + Sidebar */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
          {/* Timeline */}
          <div className="relative">
            {/* Vertical timeline line */}
            <div
              className="absolute left-[23px] top-0 bottom-0 w-px"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
            />

            <div className="space-y-1">
              {visibleActions.map((action, idx) => {
                const colors = actionTypeColor(action);
                const date = formatDate(action.date);
                const hasBill = action.bill_type && action.bill_number;

                return (
                  <motion.div
                    key={action.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(idx, 10) * 0.04 }}
                    className="relative flex gap-5 py-4"
                  >
                    {/* Timeline node */}
                    <div className="relative z-10 flex-shrink-0">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-full border-2"
                        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                      >
                        {hasBill ? (
                          <FileText size={18} style={{ color: colors.icon }} />
                        ) : (
                          <Vote size={18} style={{ color: colors.icon }} />
                        )}
                      </div>
                    </div>

                    {/* Content card */}
                    <SpotlightCard
                      className="flex-1 rounded-xl border border-white/10 bg-white/[0.03]"
                      spotlightColor="rgba(255, 255, 255, 0.10)"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="font-body text-sm font-semibold text-white/90">
                              {action.title}
                            </p>
                            {action.summary && (
                              <p className="mt-1 font-body text-xs text-white/30 line-clamp-2">
                                {action.summary}
                              </p>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="font-mono text-lg font-bold text-white/70 leading-none">
                              {date.day}
                            </p>
                            <p className="font-mono text-[10px] text-white/30">{date.month}</p>
                          </div>
                        </div>

                        {action.bill_title && (
                          <p className="mt-1 font-body text-xs text-white/40 line-clamp-1 italic">
                            {action.bill_title}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-3">
                          <span className="font-mono text-[10px] text-white/20">
                            {action.person_id.replace(/_/g, ' ')}
                          </span>
                          {hasBill && (
                            <Link
                              to={`/politics/bill/${action.bill_type!.toLowerCase()}${action.bill_number}-${action.bill_congress || 119}`}
                              className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-400 hover:bg-blue-500/20 transition-colors no-underline"
                            >
                              {action.bill_type!.toUpperCase()} {action.bill_number}
                            </Link>
                          )}
                          {action.bill_status && (
                            <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                              action.bill_status.includes('passed') || action.bill_status.includes('enacted')
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : action.bill_status.includes('failed') || action.bill_status.includes('vetoed')
                                  ? 'bg-red-500/10 text-red-400'
                                  : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              {action.bill_status.includes('passed') || action.bill_status.includes('enacted')
                                ? <CheckCircle size={9} />
                                : action.bill_status.includes('failed') || action.bill_status.includes('vetoed')
                                  ? <XCircle size={9} />
                                  : <Clock size={9} />}
                              {action.bill_status.replace(/_/g, ' ')}
                            </span>
                          )}
                          {action.source_url && (
                            <a
                              href={action.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto flex items-center gap-1 font-mono text-[10px] text-white/20 hover:text-blue-400 transition-colors no-underline"
                            >
                              Source <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    </SpotlightCard>
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-body text-sm text-white/50 transition-all hover:border-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  &larr;
                </button>
                {pages.map((page, i) =>
                  page === '...' ? (
                    <span key={`dots-${i}`} className="px-2 text-white/20 font-mono text-sm">...</span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className={`rounded-lg px-3.5 py-2 font-mono text-sm font-medium transition-all ${
                        page === currentPage
                          ? 'bg-blue-500 text-white'
                          : 'border border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {page}
                    </button>
                  ),
                )}
                <button
                  onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-body text-sm text-white/50 transition-all hover:border-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  &rarr;
                </button>
              </div>
            )}
          </div>

          {/* Sidebar: Recent Votes */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white mb-4">
              Recent Roll Calls
            </h2>
            <div className="space-y-3">
              {votes.map((vote) => (
                <SpotlightCard
                  key={vote.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03]"
                  spotlightColor="rgba(255, 255, 255, 0.10)"
                >
                  <div className="p-4">
                    <p className="font-body text-xs font-medium text-white/70 line-clamp-2 mb-1">
                      {vote.question}
                    </p>
                    {vote.related_bill_type && vote.related_bill_number && (
                      <Link
                        to={`/politics/bill/${vote.related_bill_type.toLowerCase()}${vote.related_bill_number}-${vote.congress || 119}`}
                        className="inline-block rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-400 hover:bg-blue-500/20 transition-colors no-underline mb-2"
                      >
                        {vote.related_bill_type.toUpperCase()} {vote.related_bill_number}
                      </Link>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                          vote.result?.toLowerCase().includes('passed')
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-red-500/15 text-red-400'
                        }`}
                      >
                        {vote.result}
                      </span>
                      <span className="font-mono text-[10px] text-white/20">
                        Roll #{vote.roll_number}
                      </span>
                    </div>
                    {/* Vote counts bar */}
                    <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
                      {vote.yea_count > 0 && (
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${(vote.yea_count / (vote.yea_count + vote.nay_count + vote.not_voting_count + vote.present_count)) * 100}%`,
                            backgroundColor: '#10B981',
                          }}
                        />
                      )}
                      {vote.nay_count > 0 && (
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${(vote.nay_count / (vote.yea_count + vote.nay_count + vote.not_voting_count + vote.present_count)) * 100}%`,
                            backgroundColor: '#EF4444',
                          }}
                        />
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="font-mono text-[10px] text-emerald-400">{vote.yea_count} Yea</span>
                      <span className="font-mono text-[10px] text-red-400">{vote.nay_count} Nay</span>
                      {vote.not_voting_count > 0 && (
                        <span className="font-mono text-[10px] text-white/20">{vote.not_voting_count} NV</span>
                      )}
                      {vote.vote_date && (
                        <span className="ml-auto font-mono text-[10px] text-white/15">
                          {new Date(vote.vote_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                </SpotlightCard>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <Link to="/politics" className="font-body text-sm text-white/50 hover:text-white transition-colors no-underline">
            &larr; Dashboard
          </Link>
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}
