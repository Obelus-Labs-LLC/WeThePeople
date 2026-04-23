import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Vote, ExternalLink, CheckCircle, XCircle, Clock, ArrowLeft, Activity } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { apiClient } from '../api/client';
import type { RecentAction, Vote as VoteType } from '../api/types';
import { PoliticsSectorHeader } from '../components/SectorHeader';

// ── Helpers ──

function actionTypeToken(action: RecentAction): { bg: string; color: string } {
  if (action.bill_type && action.bill_number) {
    return { bg: 'rgba(74,127,222,0.12)', color: 'var(--color-dem)' };
  }
  return { bg: 'var(--color-accent-dim)', color: 'var(--color-accent-text)' };
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

// ── Styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '40px 32px 80px',
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--color-accent-dim)',
  border: '1px solid var(--color-border)',
  borderRadius: 999,
  padding: '6px 14px',
  marginBottom: 20,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-accent-text)',
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(36px, 5vw, 56px)',
  lineHeight: 1.05,
  color: 'var(--color-text-1)',
  marginBottom: 12,
};

const leadStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 15,
  color: 'var(--color-text-2)',
  lineHeight: 1.65,
  maxWidth: 680,
};

const sidebarHeadingStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-2)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 16,
};

// ── Pagination ──
const PAGE_SIZE = 20;

// ── Page ──

export default function ActivityFeedPage() {
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [votes, setVotes] = useState<VoteType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const headerRef = React.useRef<HTMLDivElement>(null);
  useInView(headerRef, { once: true, amount: 0.1 });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.getRecentActions(100),
      apiClient.getVotes({ limit: 20 }),
    ])
      .then(([actionsRes, votesRes]) => {
        if (cancelled) return;
        setActions(actionsRes || []);
        setVotes(votesRes.votes || []);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load activity feed');
      })
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '2px solid var(--color-border)',
            borderTopColor: 'var(--color-accent)',
            animation: 'spin 1s linear infinite',
          }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 22,
              color: 'var(--color-red)',
              marginBottom: 8,
            }}
          >
            Failed to load activity feed
          </p>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-text-2)',
              marginBottom: 16,
            }}
          >
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              padding: '10px 16px',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-text-2)',
              cursor: 'pointer',
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent)';
              e.currentTarget.style.color = 'var(--color-text-1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.color = 'var(--color-text-2)';
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(actions.length / PAGE_SIZE);
  const visibleActions = actions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
    <div style={pageShell}>
      <div style={contentWrap}>
        {/* Header */}
        <motion.div
          ref={headerRef}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ marginBottom: 40 }}
        >
          <div style={{ marginBottom: 24 }}>
            <PoliticsSectorHeader />
          </div>
          <div style={eyebrowStyle}>
            <Activity size={12} style={{ color: 'var(--color-accent-text)' }} />
            Live feed
          </div>
          <h1 style={titleStyle}>
            What just <span style={{ color: 'var(--color-accent-text)' }}>happened</span>
          </h1>
          <p style={leadStyle}>Latest legislative actions and roll call votes from Congress.</p>
        </motion.div>

        {/* Two-column layout: Timeline + Sidebar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 320px',
            gap: 40,
          }}
        >
          {/* Timeline */}
          <div style={{ position: 'relative' }}>
            {/* Vertical timeline line */}
            <div
              style={{
                position: 'absolute',
                left: 23,
                top: 0,
                bottom: 0,
                width: 1,
                background: 'var(--color-border)',
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {visibleActions.map((action, idx) => {
                const token = actionTypeToken(action);
                const date = formatDate(action.date);
                const hasBill = action.bill_type && action.bill_number;
                const status = action.bill_status || '';
                const isPassed = status.includes('passed') || status.includes('enacted');
                const isFailed = status.includes('failed') || status.includes('vetoed');

                return (
                  <motion.div
                    key={action.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(idx, 10) * 0.04 }}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      gap: 20,
                      padding: '16px 0',
                    }}
                  >
                    {/* Timeline node */}
                    <div style={{ position: 'relative', zIndex: 1, flexShrink: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: 48,
                          width: 48,
                          borderRadius: '50%',
                          border: '2px solid var(--color-border)',
                          background: token.bg,
                        }}
                      >
                        {hasBill ? (
                          <FileText size={18} style={{ color: token.color }} />
                        ) : (
                          <Vote size={18} style={{ color: token.color }} />
                        )}
                      </div>
                    </div>

                    {/* Content card */}
                    <div
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        padding: 20,
                        transition: 'border-color 150ms',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 12,
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontSize: 14,
                              fontWeight: 600,
                              color: 'var(--color-text-1)',
                              lineHeight: 1.45,
                            }}
                          >
                            {action.title}
                          </div>
                          {action.summary && (
                            <div
                              style={{
                                marginTop: 4,
                                fontFamily: "'Inter', sans-serif",
                                fontSize: 12,
                                color: 'var(--color-text-3)',
                                lineHeight: 1.5,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {action.summary}
                            </div>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <div
                            style={{
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 20,
                              fontWeight: 700,
                              color: 'var(--color-text-2)',
                              lineHeight: 1,
                            }}
                          >
                            {date.day}
                          </div>
                          <div
                            style={{
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 10,
                              color: 'var(--color-text-3)',
                              letterSpacing: '0.05em',
                              marginTop: 2,
                            }}
                          >
                            {date.month}
                          </div>
                        </div>
                      </div>

                      {action.bill_title && (
                        <div
                          style={{
                            marginTop: 4,
                            fontFamily: "'Inter', sans-serif",
                            fontStyle: 'italic',
                            fontSize: 12,
                            color: 'var(--color-text-2)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {action.bill_title}
                        </div>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                          marginTop: 12,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 10,
                            color: 'var(--color-text-3)',
                            textTransform: 'capitalize',
                          }}
                        >
                          {action.person_id.replace(/_/g, ' ')}
                        </span>
                        {hasBill && (
                          <Link
                            to={`/politics/bill/${action.bill_type!.toLowerCase()}${action.bill_number}-${action.bill_congress || 119}`}
                            style={{
                              borderRadius: 4,
                              background: 'rgba(74,127,222,0.14)',
                              padding: '2px 6px',
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 10,
                              color: 'var(--color-dem)',
                              textDecoration: 'none',
                            }}
                          >
                            {action.bill_type!.toUpperCase()} {action.bill_number}
                          </Link>
                        )}
                        {action.bill_status && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              borderRadius: 4,
                              padding: '2px 6px',
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 10,
                              background: isPassed
                                ? 'rgba(61,184,122,0.14)'
                                : isFailed
                                  ? 'rgba(230,57,70,0.14)'
                                  : 'var(--color-accent-dim)',
                              color: isPassed
                                ? 'var(--color-green)'
                                : isFailed
                                  ? 'var(--color-red)'
                                  : 'var(--color-accent-text)',
                            }}
                          >
                            {isPassed ? <CheckCircle size={9} /> : isFailed ? <XCircle size={9} /> : <Clock size={9} />}
                            {action.bill_status.replace(/_/g, ' ')}
                          </span>
                        )}
                        {action.source_url && (
                          <a
                            href={action.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              marginLeft: 'auto',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 10,
                              color: 'var(--color-text-3)',
                              textDecoration: 'none',
                              transition: 'color 150ms',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-3)'; }}
                          >
                            Source
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  marginTop: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <PageButton
                  disabled={currentPage === 1}
                  onClick={() => {
                    setCurrentPage((p) => Math.max(1, p - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  ←
                </PageButton>
                {pages.map((page, i) =>
                  page === '...' ? (
                    <span
                      key={`dots-${i}`}
                      style={{
                        padding: '0 8px',
                        color: 'var(--color-text-3)',
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontSize: 13,
                      }}
                    >
                      ...
                    </span>
                  ) : (
                    <PageButton
                      key={page}
                      active={page === currentPage}
                      onClick={() => {
                        setCurrentPage(page);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      {page}
                    </PageButton>
                  ),
                )}
                <PageButton
                  disabled={currentPage === totalPages}
                  onClick={() => {
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  →
                </PageButton>
              </div>
            )}
          </div>

          {/* Sidebar: Recent Votes */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <h2 style={sidebarHeadingStyle}>Recent roll calls</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {votes.map((vote) => {
                const total =
                  vote.yea_count + vote.nay_count + vote.not_voting_count + vote.present_count;
                const isPassed = vote.result?.toLowerCase().includes('passed');
                return (
                  <div
                    key={vote.id}
                    style={{
                      borderRadius: 12,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      padding: 14,
                      transition: 'border-color 150ms',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                  >
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--color-text-1)',
                        lineHeight: 1.5,
                        marginBottom: 6,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {vote.question}
                    </div>
                    {vote.related_bill_type && vote.related_bill_number && (
                      <Link
                        to={`/politics/bill/${vote.related_bill_type.toLowerCase()}${vote.related_bill_number}-${vote.congress || 119}`}
                        style={{
                          display: 'inline-block',
                          marginBottom: 8,
                          borderRadius: 4,
                          background: 'rgba(74,127,222,0.14)',
                          padding: '2px 6px',
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 10,
                          color: 'var(--color-dem)',
                          textDecoration: 'none',
                        }}
                      >
                        {vote.related_bill_type.toUpperCase()} {vote.related_bill_number}
                      </Link>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span
                        style={{
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 10,
                          fontWeight: 700,
                          background: isPassed ? 'rgba(61,184,122,0.18)' : 'rgba(230,57,70,0.18)',
                          color: isPassed ? 'var(--color-green)' : 'var(--color-red)',
                        }}
                      >
                        {vote.result}
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 10,
                          color: 'var(--color-text-3)',
                        }}
                      >
                        Roll #{vote.roll_number}
                      </span>
                    </div>
                    {/* Vote counts bar */}
                    <div
                      style={{
                        display: 'flex',
                        height: 8,
                        overflow: 'hidden',
                        borderRadius: 999,
                        background: 'var(--color-surface-2)',
                      }}
                    >
                      {vote.yea_count > 0 && total > 0 && (
                        <div
                          style={{
                            height: '100%',
                            width: `${(vote.yea_count / total) * 100}%`,
                            background: 'var(--color-green)',
                          }}
                        />
                      )}
                      {vote.nay_count > 0 && total > 0 && (
                        <div
                          style={{
                            height: '100%',
                            width: `${(vote.nay_count / total) * 100}%`,
                            background: 'var(--color-red)',
                          }}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 10,
                          color: 'var(--color-green)',
                        }}
                      >
                        {vote.yea_count} Yea
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 10,
                          color: 'var(--color-red)',
                        }}
                      >
                        {vote.nay_count} Nay
                      </span>
                      {vote.not_voting_count > 0 && (
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 10,
                            color: 'var(--color-text-3)',
                          }}
                        >
                          {vote.not_voting_count} NV
                        </span>
                      )}
                      {vote.vote_date && (
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 10,
                            color: 'var(--color-text-3)',
                          }}
                        >
                          {new Date(vote.vote_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 64,
            borderTop: '1px solid var(--color-border)',
            paddingTop: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            to="/politics"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-text-2)',
              textDecoration: 'none',
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            <ArrowLeft size={12} />
            Dashboard
          </Link>
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 10,
              color: 'var(--color-text-3)',
              letterSpacing: '0.05em',
            }}
          >
            wethepeople
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Pagination button ──

function PageButton({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 36,
        padding: '8px 12px',
        borderRadius: 8,
        border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
        background: active ? 'var(--color-accent)' : 'var(--color-surface)',
        color: active ? '#07090C' : 'var(--color-text-2)',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        transition: 'border-color 150ms, color 150ms',
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.borderColor = 'var(--color-accent)';
          e.currentTarget.style.color = 'var(--color-text-1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.borderColor = 'var(--color-border)';
          e.currentTarget.style.color = 'var(--color-text-2)';
        }
      }}
    >
      {children}
    </button>
  );
}
