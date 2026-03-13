import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Vote, ExternalLink, ChevronDown } from 'lucide-react';
import { apiClient } from '../api/client';
import type { RecentAction, Vote as VoteType } from '../api/types';
import BackButton from '../components/BackButton';

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

// ── Page ──

export default function ActivityFeedPage() {
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [votes, setVotes] = useState<VoteType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCount, setShowCount] = useState(30);

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
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: '#020617' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const visibleActions = actions.slice(0, showCount);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#020617' }}>
      <div className="mx-auto max-w-[1000px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Header */}
        <div className="mb-10 animate-fade-up">
          <div className="mb-3">
            <BackButton to="/politics" label="Dashboard" />
          </div>
          <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white">
            Activity Feed
          </h1>
          <p className="mt-1 font-body text-sm text-white/40">
            Latest legislative actions and roll call votes
          </p>
        </div>

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
                  <div
                    key={action.id}
                    className="relative flex gap-5 py-4 animate-fade-up"
                    style={{ animationDelay: `${100 + Math.min(idx, 15) * 40}ms` }}
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
                    <div
                      className="flex-1 rounded-xl border border-white/5 p-5 transition-all hover:border-white/10"
                      style={{ backgroundColor: '#0F172A' }}
                    >
                      {/* Date badge */}
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

                      {/* Meta row */}
                      <div className="flex items-center gap-2 mt-3">
                        <span className="font-mono text-[10px] text-white/20">
                          {action.person_id.replace(/_/g, ' ')}
                        </span>
                        {hasBill && (
                          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-400">
                            {action.bill_type!.toUpperCase()} {action.bill_number}
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
                  </div>
                );
              })}
            </div>

            {/* Load more */}
            {showCount < actions.length && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setShowCount((prev) => prev + 30)}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 font-body text-sm text-white/40 transition-colors hover:text-white/60 hover:border-white/20"
                >
                  Load more
                  <ChevronDown size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Sidebar: Recent Votes */}
          <div className="animate-fade-up" style={{ animationDelay: '200ms' }}>
            <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white mb-4">
              Recent Roll Calls
            </h2>
            <div className="space-y-3">
              {votes.map((vote) => (
                <div
                  key={vote.id}
                  className="rounded-xl border border-white/5 p-4"
                  style={{ backgroundColor: '#0F172A' }}
                >
                  <p className="font-body text-xs font-medium text-white/70 line-clamp-2 mb-2">
                    {vote.question}
                  </p>
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
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <Link to="/politics" className="font-body text-xs text-white/20 hover:text-white/40 transition-colors no-underline">
            &larr; Dashboard
          </Link>
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}
