import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';
import { apiClient } from '../api/client';
import type { VoteDetailResponse, MemberVoteEntry } from '../api/types';
import { PoliticsSectorHeader } from '../components/SectorHeader';

type PositionFilter = 'All' | 'Yea' | 'Nay' | 'Not Voting' | 'Present';

const POSITION_FILTERS: PositionFilter[] = ['All', 'Yea', 'Nay', 'Not Voting', 'Present'];

const PARTY_HEX: Record<string, string> = {
  D: '#4A7FDE',
  R: '#E05555',
  I: '#B06FD8',
};

const PARTY_TOKEN: Record<string, string> = {
  D: 'var(--color-dem)',
  R: 'var(--color-rep)',
  I: 'var(--color-ind)',
};

const PARTY_NAMES: Record<string, string> = {
  D: 'Democrat',
  R: 'Republican',
  I: 'Independent',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Date unknown';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getCongressSuffix(congress: number): string {
  const mod10 = congress % 10;
  const mod100 = congress % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  if (mod10 === 1) return 'st';
  if (mod10 === 2) return 'nd';
  if (mod10 === 3) return 'rd';
  return 'th';
}

interface PartyBreakdown {
  party: string;
  yea: number;
  nay: number;
  notVoting: number;
  present: number;
  total: number;
}

function computePartyBreakdowns(memberVotes: MemberVoteEntry[]): PartyBreakdown[] {
  const map: Record<string, PartyBreakdown> = {};
  for (const mv of memberVotes) {
    if (!map[mv.party]) {
      map[mv.party] = {
        party: mv.party,
        yea: 0,
        nay: 0,
        notVoting: 0,
        present: 0,
        total: 0,
      };
    }
    const p = map[mv.party];
    p.total++;
    if (mv.position === 'Yea') p.yea++;
    else if (mv.position === 'Nay') p.nay++;
    else if (mv.position === 'Not Voting') p.notVoting++;
    else if (mv.position === 'Present') p.present++;
  }
  const order = ['D', 'R', 'I'];
  return Object.values(map).sort(
    (a, b) =>
      (order.indexOf(a.party) === -1 ? 99 : order.indexOf(a.party)) -
      (order.indexOf(b.party) === -1 ? 99 : order.indexOf(b.party)),
  );
}

// ── Styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: 1400,
  margin: '0 auto',
  padding: '40px 32px 80px',
};

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  color: 'var(--color-text-2)',
  textDecoration: 'none',
  marginBottom: 24,
  transition: 'color 150ms',
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  marginBottom: 16,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(32px, 4.5vw, 48px)',
  lineHeight: 1.1,
  color: 'var(--color-text-1)',
  marginBottom: 20,
};

const sectionCard: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  padding: 24,
};

const sectionHeading: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--color-text-2)',
  marginBottom: 16,
};

// ── Page ──

const VoteDetailPage: React.FC = () => {
  const { vote_id } = useParams<{ vote_id: string }>();
  const [vote, setVote] = useState<VoteDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('All');

  useEffect(() => {
    let cancelled = false;
    if (!vote_id) return;
    setLoading(true);
    setError(null);
    apiClient
      .getVoteDetail(Number(vote_id))
      .then((data) => {
        if (cancelled) return;
        setVote(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load vote details');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vote_id]);

  const filteredMembers = useMemo(() => {
    if (!vote) return [];
    let members = vote.member_votes;
    if (positionFilter !== 'All') {
      members = members.filter((m) => m.position === positionFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      members = members.filter((m) => m.member_name.toLowerCase().includes(q));
    }
    return members;
  }, [vote, search, positionFilter]);

  const partyBreakdowns = useMemo(() => {
    if (!vote) return [];
    return computePartyBreakdowns(vote.member_votes);
  }, [vote]);

  if (!vote_id) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-red)', fontSize: 16 }}>Missing vote_id in URL.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          ...pageShell,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-accent)',
            animation: 'spin 1s linear infinite',
          }}
        />
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            color: 'var(--color-text-2)',
            fontSize: 14,
          }}
        >
          Loading vote details...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            borderRadius: 16,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            padding: 32,
            maxWidth: 480,
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              color: 'var(--color-red)',
              fontSize: 22,
              marginBottom: 8,
            }}
          >
            Error loading vote
          </p>
          <p style={{ color: 'var(--color-text-2)', fontSize: 13 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!vote) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-text-2)', fontSize: 16 }}>Vote not found.</p>
      </div>
    );
  }

  const total = vote.yea_count + vote.nay_count + vote.not_voting_count + vote.present_count;
  const passed = vote.result.toLowerCase().includes('passed');
  const failed = vote.result.toLowerCase().includes('failed');

  const relatedBillSlug =
    vote.related_bill_type && vote.related_bill_number && vote.related_bill_congress
      ? `${vote.related_bill_type}${vote.related_bill_number}-${vote.related_bill_congress}`
      : null;

  const resultBg = passed
    ? 'rgba(61,184,122,0.16)'
    : failed
      ? 'rgba(230,57,70,0.16)'
      : 'var(--color-surface-2)';
  const resultColor = passed
    ? 'var(--color-green)'
    : failed
      ? 'var(--color-red)'
      : 'var(--color-text-2)';

  return (
    <div style={pageShell}>
      <div style={contentWrap}>
        <div style={{ marginBottom: 24 }}>
          <PoliticsSectorHeader />
        </div>

        <Link
          to="/politics/activity"
          style={backLinkStyle}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
        >
          <ArrowLeft size={12} />
          Activity
        </Link>

        <div style={eyebrowStyle}>
          Roll no. {vote.roll_number} · {vote.chamber.toUpperCase()} · {vote.congress}
          {getCongressSuffix(vote.congress)} Congress · Session {vote.session}
        </div>

        <h1 style={titleStyle}>{vote.question}</h1>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {relatedBillSlug && (
            <Link
              to={`/politics/bill/${relatedBillSlug}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 999,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                padding: '7px 14px',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: 'var(--color-text-2)',
                textDecoration: 'none',
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
              <FileText size={13} />
              Related bill: {vote.related_bill_type!.toUpperCase()} {vote.related_bill_number}
            </Link>
          )}
          {vote.source_url && (
            <a
              href={vote.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 999,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                padding: '7px 14px',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: 'var(--color-text-2)',
                textDecoration: 'none',
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
              Official record
              <ExternalLink size={12} />
            </a>
          )}
        </div>

        {/* Result badge + date */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, marginBottom: 40 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 28,
              letterSpacing: '0.02em',
              padding: '14px 28px',
              borderRadius: 12,
              background: resultBg,
              color: resultColor,
              border: '1px solid var(--color-border)',
            }}
          >
            {vote.result}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 12,
              color: 'var(--color-text-3)',
            }}
          >
            {formatDate(vote.vote_date)}
          </span>
        </div>

        {/* Main content */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '380px minmax(0, 1fr)',
            gap: 24,
          }}
        >
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Vote Summary Card */}
            <div style={sectionCard}>
              <h2 style={sectionHeading}>Vote summary</h2>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: 'var(--color-text-3)',
                  marginBottom: 4,
                }}
              >
                Total votes
              </p>
              <p
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 32,
                  fontWeight: 700,
                  color: 'var(--color-text-1)',
                  marginBottom: 20,
                }}
              >
                {total}
              </p>

              {/* 2x2 stat grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                <StatBox count={vote.yea_count} label="Yea" color="var(--color-green)" />
                <StatBox count={vote.nay_count} label="Nay" color="var(--color-red)" />
                <StatBox count={vote.not_voting_count} label="Not Voting" color="var(--color-text-3)" />
                <StatBox count={vote.present_count} label="Present" color="var(--color-accent-text)" />
              </div>

              {/* Stacked bar */}
              <div style={{ position: 'relative', marginTop: 20 }}>
                <div
                  style={{
                    display: 'flex',
                    height: 42,
                    overflow: 'hidden',
                    borderRadius: 999,
                    background: 'var(--color-surface-2)',
                  }}
                >
                  {total > 0 && (
                    <>
                      {vote.yea_count > 0 && (
                        <div
                          style={{
                            background: 'var(--color-green)',
                            width: `${(vote.yea_count / total) * 100}%`,
                            transition: 'width 500ms',
                          }}
                        />
                      )}
                      {vote.nay_count > 0 && (
                        <div
                          style={{
                            background: 'var(--color-red)',
                            width: `${(vote.nay_count / total) * 100}%`,
                            transition: 'width 500ms',
                          }}
                        />
                      )}
                      {vote.not_voting_count > 0 && (
                        <div
                          style={{
                            background: 'var(--color-text-3)',
                            width: `${(vote.not_voting_count / total) * 100}%`,
                            transition: 'width 500ms',
                          }}
                        />
                      )}
                      {vote.present_count > 0 && (
                        <div
                          style={{
                            background: 'var(--color-accent)',
                            width: `${(vote.present_count / total) * 100}%`,
                            transition: 'width 500ms',
                          }}
                        />
                      )}
                    </>
                  )}
                </div>
                {/* Majority threshold line */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: 'var(--color-text-1)',
                  }}
                />
                <p
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    top: -16,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: 9,
                    color: 'var(--color-text-3)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  Majority
                </p>
              </div>
            </div>

            {/* Party Breakdown Card */}
            <div style={sectionCard}>
              <h2 style={sectionHeading}>Party breakdown</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {partyBreakdowns.map((pb) => (
                  <div key={pb.party}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: PARTY_TOKEN[pb.party] || 'var(--color-text-3)',
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontWeight: 600,
                          fontSize: 14,
                          color: 'var(--color-text-1)',
                        }}
                      >
                        {PARTY_NAMES[pb.party] || pb.party}
                      </span>
                    </div>
                    <p
                      style={{
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontSize: 11,
                        color: 'var(--color-text-3)',
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ color: 'var(--color-green)', fontWeight: 600 }}>{pb.yea}</span> Yea ·{' '}
                      <span style={{ color: 'var(--color-red)', fontWeight: 600 }}>{pb.nay}</span> Nay ·{' '}
                      <span style={{ color: 'var(--color-text-2)', fontWeight: 600 }}>{pb.notVoting}</span> NV
                    </p>
                    {pb.total > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          height: 6,
                          borderRadius: 999,
                          overflow: 'hidden',
                          background: 'var(--color-surface-2)',
                        }}
                      >
                        {pb.yea > 0 && (
                          <div
                            style={{
                              background: 'var(--color-green)',
                              width: `${(pb.yea / pb.total) * 100}%`,
                            }}
                          />
                        )}
                        {pb.nay > 0 && (
                          <div
                            style={{
                              background: 'var(--color-red)',
                              width: `${(pb.nay / pb.total) * 100}%`,
                            }}
                          />
                        )}
                        {pb.notVoting > 0 && (
                          <div
                            style={{
                              background: 'var(--color-text-3)',
                              width: `${(pb.notVoting / pb.total) * 100}%`,
                            }}
                          />
                        )}
                        {pb.present > 0 && (
                          <div
                            style={{
                              background: 'var(--color-accent)',
                              width: `${(pb.present / pb.total) * 100}%`,
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column — member votes table */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 16,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              overflow: 'hidden',
            }}
          >
            {/* Toolbar */}
            <div style={{ padding: 20, borderBottom: '1px solid var(--color-border)' }}>
              <input
                type="text"
                placeholder="Search members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text-1)',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  outline: 'none',
                  marginBottom: 12,
                  transition: 'border-color 150ms, box-shadow 150ms',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {POSITION_FILTERS.map((f) => {
                  const active = positionFilter === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setPositionFilter(f)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                        background: active ? 'var(--color-accent-dim)' : 'var(--color-bg)',
                        color: active ? 'var(--color-accent-text)' : 'var(--color-text-2)',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'border-color 150ms, color 150ms, background 150ms',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.borderColor = 'var(--color-accent)';
                          e.currentTarget.style.color = 'var(--color-text-1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.borderColor = 'var(--color-border)';
                          e.currentTarget.style.color = 'var(--color-text-2)';
                        }
                      }}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Table header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1.2fr',
                padding: '12px 24px',
                background: 'var(--color-surface-2)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              {['Member', 'Party', 'State', 'Position'].map((label) => (
                <span
                  key={label}
                  style={{
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-3)',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Table body */}
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {filteredMembers.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '64px 0',
                  }}
                >
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      color: 'var(--color-text-3)',
                    }}
                  >
                    No members match your filters.
                  </p>
                </div>
              ) : (
                filteredMembers.map((m, idx) => (
                  <div
                    key={`${m.bioguide_id}-${idx}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1.2fr',
                      alignItems: 'center',
                      padding: '14px 24px',
                      borderBottom: '1px solid var(--color-border)',
                      transition: 'background 150ms',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Name */}
                    <div>
                      {m.person_id ? (
                        <Link
                          to={`/politics/people/${m.person_id}`}
                          style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'var(--color-text-1)',
                            textDecoration: 'none',
                            transition: 'color 150ms',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
                        >
                          {m.member_name}
                        </Link>
                      ) : (
                        <span
                          style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'var(--color-text-1)',
                          }}
                        >
                          {m.member_name}
                        </span>
                      )}
                    </div>
                    {/* Party */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: PARTY_TOKEN[m.party] || 'var(--color-text-3)',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 13,
                          color: 'var(--color-text-2)',
                        }}
                      >
                        {m.party}
                      </span>
                    </div>
                    {/* State */}
                    <div>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 12,
                          color: 'var(--color-text-3)',
                        }}
                      >
                        {m.state}
                      </span>
                    </div>
                    {/* Position badge */}
                    <div>
                      <PositionBadge position={m.position} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Sub-components ── */

function StatBox({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-2)',
        borderRadius: 12,
        padding: 14,
      }}
    >
      <p
        style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 22,
          fontWeight: 700,
          color,
          lineHeight: 1,
        }}
      >
        {count}
      </p>
      <p
        style={{
          marginTop: 6,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 10,
          color: 'var(--color-text-3)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </p>
    </div>
  );
}

function PositionBadge({ position }: { position: string }) {
  let bg = 'var(--color-surface-2)';
  let color = 'var(--color-text-3)';

  switch (position) {
    case 'Yea':
      bg = 'rgba(61,184,122,0.18)';
      color = 'var(--color-green)';
      break;
    case 'Nay':
      bg = 'rgba(230,57,70,0.18)';
      color = 'var(--color-red)';
      break;
    case 'Present':
      bg = 'var(--color-accent-dim)';
      color = 'var(--color-accent-text)';
      break;
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: bg,
        color,
      }}
    >
      {position}
    </span>
  );
}

export default VoteDetailPage;

// Re-export for tree-shaking parity
export { PARTY_HEX };
