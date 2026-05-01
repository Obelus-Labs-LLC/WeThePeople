import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Check } from 'lucide-react';
import { apiClient } from '../api/client';
import type { BillResponse, ActionSearchResult } from '../api/types';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import FollowButton from '../components/FollowButton';

// ── Status token map (design system aligned) ──

const STATUS_TOKEN: Record<string, { color: string; hex: string }> = {
  introduced: { color: 'var(--color-text-2)', hex: '#7F8593' },
  in_committee: { color: 'var(--color-accent-text)', hex: '#D4AE35' },
  passed_house: { color: 'var(--color-dem)', hex: '#4A7FDE' },
  passed_one: { color: 'var(--color-dem)', hex: '#4A7FDE' },
  passed_senate: { color: 'var(--color-dem)', hex: '#4A7FDE' },
  passed_both: { color: 'var(--color-ind)', hex: '#B06FD8' },
  enacted: { color: 'var(--color-green)', hex: '#3DB87A' },
  became_law: { color: 'var(--color-green)', hex: '#3DB87A' },
  vetoed: { color: 'var(--color-red)', hex: '#E63946' },
  failed: { color: 'var(--color-red)', hex: '#E63946' },
};

// ── Pipeline stages ──

const PIPELINE_STAGES = [
  'Introduced',
  'Committee',
  'House Floor',
  'Senate Floor',
  'President',
  'Law',
] as const;

function statusToStageIndex(status: string | null): number {
  if (!status) return 0;
  const map: Record<string, number> = {
    introduced: 0,
    in_committee: 1,
    passed_house: 2,
    passed_one: 2,
    passed_senate: 3,
    passed_both: 4,
    enacted: 5,
    became_law: 5,
    vetoed: 4,
    failed: 0,
  };
  return map[status] ?? 0;
}

// ── Helpers ──

function formatBillType(bt: string): string {
  const map: Record<string, string> = {
    hr: 'H.R.',
    s: 'S.',
    hjres: 'H.J.Res.',
    sjres: 'S.J.Res.',
    hconres: 'H.Con.Res.',
    sconres: 'S.Con.Res.',
    hres: 'H.Res.',
    sres: 'S.Res.',
  };
  return map[bt.toLowerCase()] || bt.toUpperCase();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getCongressOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

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

function partyHex(party: string | null): string {
  if (!party) return '#7F8593';
  return PARTY_HEX[party.charAt(0).toUpperCase()] || '#7F8593';
}

function partyToken(party: string | null): string {
  if (!party) return 'var(--color-text-3)';
  return PARTY_TOKEN[party.charAt(0).toUpperCase()] || 'var(--color-text-3)';
}

function partyLabel(party: string | null): string {
  if (!party) return 'Unknown';
  const p = party.charAt(0).toUpperCase();
  if (p === 'D') return 'Democrat';
  if (p === 'R') return 'Republican';
  if (p === 'I') return 'Independent';
  return party;
}

function getInitials(name: string): string {
  return name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
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
  transition: 'color 150ms',
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(30px, 4vw, 44px)',
  lineHeight: 1.15,
  color: 'var(--color-text-1)',
  marginBottom: 16,
};

const sectionCard: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  padding: 28,
};

const sectionHeading: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 22,
  color: 'var(--color-text-1)',
  marginBottom: 20,
};

// ── Component ──

export default function BillDetailPage() {
  const { bill_id } = useParams<{ bill_id: string }>();
  const [bill, setBill] = useState<BillResponse | null>(null);
  const [relatedActions, setRelatedActions] = useState<ActionSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!bill_id) return;
    setLoading(true);
    setError(null);

    apiClient
      .getBill(bill_id)
      .then((billRes) => {
        if (cancelled) return;
        setBill(billRes);
        return apiClient
          .searchActions({
            bill_congress: billRes.congress,
            bill_type: billRes.bill_type,
            bill_number: billRes.bill_number,
            simple: true,
            limit: 10,
          })
          .then((actionsRes) => {
            if (!cancelled) setRelatedActions(actionsRes.actions || []);
          })
          .catch((err) => { console.warn('[BillDetailPage] fetch failed:', err); });
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load bill'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bill_id]);

  if (loading) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
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
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-2)' }}>
            Loading bill details...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            borderRadius: 16,
            border: '1px solid rgba(230,57,70,0.3)',
            background: 'rgba(230,57,70,0.08)',
            padding: 32,
            textAlign: 'center',
            maxWidth: 480,
          }}
        >
          <p
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 20,
              color: 'var(--color-red)',
            }}
          >
            Error
          </p>
          <p
            style={{
              marginTop: 8,
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-text-2)',
              marginBottom: 20,
            }}
          >
            {error}
          </p>
          <Link
            to="/politics/activity"
            style={{ ...backLinkStyle, justifyContent: 'center' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            <ArrowLeft size={12} />
            Activity
          </Link>
        </div>
      </div>
    );
  }

  if (!bill) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-text-2)', fontSize: 14 }}>Bill not found.</p>
      </div>
    );
  }

  const statusToken = STATUS_TOKEN[bill.status_bucket || ''] || { color: 'var(--color-text-2)', hex: '#7F8593' };
  const currentStage = statusToStageIndex(bill.status_bucket);
  const primarySponsor = bill.sponsors.find((s) => s.role === 'sponsor');
  const cosponsors = bill.sponsors.filter((s) => s.role === 'cosponsor');

  const sortedTimeline = [...bill.timeline].sort(
    (a, b) => new Date(b.action_date || '').getTime() - new Date(a.action_date || '').getTime(),
  );

  const metaItems: string[] = [];
  metaItems.push(`${getCongressOrdinal(bill.congress)} Congress`);
  if (bill.policy_area) metaItems.push(bill.policy_area);
  if (bill.introduced_date) metaItems.push(`Introduced ${formatDate(bill.introduced_date)}`);
  if (bill.latest_action_date) metaItems.push(`Latest ${formatDate(bill.latest_action_date)}`);

  return (
    <div style={pageShell}>
      <div style={contentWrap}>
        <div style={{ marginBottom: 24 }}>
          <PoliticsSectorHeader />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <Link
            to="/politics/activity"
            style={backLinkStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            <ArrowLeft size={12} />
            Activity
          </Link>
          <a
            href={bill.congress_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
              transition: 'opacity 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            View on Congress.gov
            <ExternalLink size={12} />
          </a>
        </div>

        {/* Bill ID tag */}
        <div style={{ marginBottom: 16 }}>
          <span
            style={{
              display: 'inline-block',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 16,
              fontWeight: 700,
              padding: '6px 16px',
              borderRadius: 999,
              background: 'var(--color-accent-dim)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-accent-text)',
              letterSpacing: '0.02em',
            }}
          >
            {formatBillType(bill.bill_type)} {bill.bill_number}
          </span>
        </div>

        {/* Title + Follow */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <h1 style={{ ...titleStyle, flex: '1 1 auto', minWidth: 0 }}>{bill.title}</h1>
          <div style={{ marginTop: 6 }}>
            <FollowButton
              entityType="bill"
              entityId={bill.bill_id}
              entityName={`${formatBillType(bill.bill_type)} ${bill.bill_number}`}
            />
          </div>
        </div>

        {/* Status + Meta row */}
        <div
          style={{
            marginTop: 16,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            marginBottom: 32,
          }}
        >
          {bill.status_bucket && (
            <span
              style={{
                display: 'inline-block',
                padding: '5px 12px',
                borderRadius: 999,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                background: `${statusToken.hex}1F`,
                color: statusToken.color,
                border: `1px solid ${statusToken.hex}33`,
              }}
            >
              {bill.status_bucket.replace(/_/g, ' ')}
            </span>
          )}

          {metaItems.map((item, i) => (
            <React.Fragment key={i}>
              {(i > 0 || bill.status_bucket) && (
                <span style={{ color: 'var(--color-border-hover)', fontSize: 12, userSelect: 'none' }}>·</span>
              )}
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-2)' }}>
                {item}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* Progress Pipeline */}
        <div style={{ position: 'relative', marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            {PIPELINE_STAGES.map((stage, idx) => {
              const isCompleted = idx < currentStage;
              const isCurrent = idx === currentStage;
              const background = isCompleted
                ? 'var(--color-accent)'
                : isCurrent
                  ? 'var(--color-accent-text)'
                  : 'var(--color-surface)';
              const border = isCompleted
                ? '3px solid var(--color-accent-dim)'
                : isCurrent
                  ? '3px solid var(--color-accent)'
                  : '2px solid var(--color-border)';
              return (
                <div
                  key={stage}
                  style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background,
                      border,
                      boxShadow: isCurrent ? '0 0 0 6px var(--color-accent-dim)' : 'none',
                    }}
                  >
                    {isCompleted && <Check size={14} strokeWidth={3} style={{ color: '#07090C' }} />}
                  </div>
                  <span
                    style={{
                      marginTop: 12,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: isCurrent
                        ? 'var(--color-accent-text)'
                        : isCompleted
                          ? 'var(--color-text-1)'
                          : 'var(--color-text-3)',
                      textAlign: 'center',
                    }}
                  >
                    {stage}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Connecting line */}
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: '8.33%',
              right: '8.33%',
              height: 2,
              background: 'var(--color-border)',
              zIndex: 0,
            }}
          />
        </div>

        {/* Main grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
            gap: 24,
          }}
        >
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Summary Card */}
            <div style={sectionCard}>
              <h2 style={sectionHeading}>Summary</h2>
              {bill.summary_text ? (
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 15,
                    lineHeight: 1.65,
                    color: 'var(--color-text-2)',
                  }}
                >
                  {bill.summary_text}
                </p>
              ) : (
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    color: 'var(--color-text-3)',
                  }}
                >
                  No summary available.
                </p>
              )}

              {/* Subjects */}
              {bill.subjects_json && bill.subjects_json.length > 0 && (
                <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {bill.subjects_json.map((subject) => (
                    <span
                      key={subject}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface-2)',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        color: 'var(--color-text-2)',
                      }}
                    >
                      {subject}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Sponsors Card */}
            <div style={sectionCard}>
              <h2 style={sectionHeading}>Sponsors</h2>

              {/* Primary sponsor */}
              {primarySponsor && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    {primarySponsor.photo_url ? (
                      <img
                        src={primarySponsor.photo_url}
                        alt={primarySponsor.display_name}
                        style={{
                          height: 72,
                          width: 72,
                          borderRadius: '50%',
                          border: `2px solid ${partyHex(primarySponsor.party)}33`,
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: 72,
                          width: 72,
                          borderRadius: '50%',
                          background: `${partyHex(primarySponsor.party)}26`,
                          color: partyToken(primarySponsor.party),
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 22,
                          fontWeight: 700,
                        }}
                      >
                        {getInitials(primarySponsor.display_name)}
                      </div>
                    )}

                    <div style={{ minWidth: 0, flex: 1 }}>
                      {primarySponsor.person_id ? (
                        <Link
                          to={`/politics/people/${primarySponsor.person_id}`}
                          style={{
                            fontFamily: "'Playfair Display', Georgia, serif",
                            fontStyle: 'italic',
                            fontWeight: 900,
                            fontSize: 22,
                            color: 'var(--color-text-1)',
                            textDecoration: 'none',
                            transition: 'color 150ms',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
                        >
                          {primarySponsor.display_name}
                        </Link>
                      ) : (
                        <span
                          style={{
                            fontFamily: "'Playfair Display', Georgia, serif",
                            fontStyle: 'italic',
                            fontWeight: 900,
                            fontSize: 22,
                            color: 'var(--color-text-1)',
                          }}
                        >
                          {primarySponsor.display_name}
                        </span>
                      )}

                      <div
                        style={{
                          marginTop: 8,
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {primarySponsor.party && (
                          <span
                            style={{
                              padding: '3px 10px',
                              borderRadius: 999,
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              background: `${partyHex(primarySponsor.party)}1F`,
                              color: partyToken(primarySponsor.party),
                            }}
                          >
                            {partyLabel(primarySponsor.party)}
                          </span>
                        )}
                        {primarySponsor.state && (
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 12,
                              color: 'var(--color-text-3)',
                            }}
                          >
                            {primarySponsor.state}
                          </span>
                        )}
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 999,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            background: 'var(--color-accent-dim)',
                            color: 'var(--color-accent-text)',
                          }}
                        >
                          Primary sponsor
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cosponsors */}
              {cosponsors.length > 0 && (
                <>
                  {primarySponsor && (
                    <div
                      style={{
                        borderTop: '1px solid var(--color-border)',
                        paddingTop: 16,
                        marginBottom: 12,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: 'var(--color-text-3)',
                        }}
                      >
                        Cosponsors ({cosponsors.length})
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {cosponsors.map((cs) => (
                      <div key={cs.bioguide_id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {cs.photo_url ? (
                          <img
                            src={cs.photo_url}
                            alt={cs.display_name}
                            style={{
                              height: 36,
                              width: 36,
                              borderRadius: '50%',
                              border: `2px solid ${partyHex(cs.party)}33`,
                              objectFit: 'cover',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: 36,
                              width: 36,
                              borderRadius: '50%',
                              background: `${partyHex(cs.party)}26`,
                              color: partyToken(cs.party),
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 12,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {getInitials(cs.display_name)}
                          </div>
                        )}

                        <div style={{ minWidth: 0, flex: 1 }}>
                          {cs.person_id ? (
                            <Link
                              to={`/politics/people/${cs.person_id}`}
                              style={{
                                fontFamily: "'Inter', sans-serif",
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'var(--color-text-1)',
                                textDecoration: 'none',
                                transition: 'color 150ms',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
                            >
                              {cs.display_name}
                            </Link>
                          ) : (
                            <span
                              style={{
                                fontFamily: "'Inter', sans-serif",
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'var(--color-text-1)',
                              }}
                            >
                              {cs.display_name}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {cs.party && (
                            <span
                              style={{
                                height: 8,
                                width: 8,
                                borderRadius: '50%',
                                background: partyToken(cs.party),
                              }}
                            />
                          )}
                          {cs.state && (
                            <span
                              style={{
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: 11,
                                color: 'var(--color-text-3)',
                              }}
                            >
                              {cs.state}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {bill.sponsors.length === 0 && (
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-3)' }}>
                  No sponsor information available.
                </p>
              )}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Timeline Card */}
            <div style={{ ...sectionCard, maxHeight: 640, overflowY: 'auto' }}>
              <h2 style={sectionHeading}>Timeline</h2>

              {sortedTimeline.length === 0 ? (
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-3)' }}>
                  No timeline data available.
                </p>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  <div
                    style={{
                      position: 'absolute',
                      width: 1,
                      top: 4,
                      bottom: 4,
                      left: 7,
                      background: 'var(--color-border)',
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {sortedTimeline.map((entry, idx) => (
                      <div key={idx} style={{ position: 'relative', display: 'flex', gap: 12 }}>
                        <div
                          style={{
                            position: 'absolute',
                            width: 14,
                            height: 14,
                            left: -17,
                            top: 2,
                            borderRadius: '50%',
                            background: idx === 0 ? 'var(--color-accent-text)' : 'var(--color-surface-2)',
                            border: '2px solid var(--color-surface)',
                          }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {entry.action_date && (
                            <span
                              style={{
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: 11,
                                color: 'var(--color-text-3)',
                              }}
                            >
                              {formatDate(entry.action_date)}
                            </span>
                          )}
                          <p
                            style={{
                              marginTop: 2,
                              fontFamily: "'Inter', sans-serif",
                              fontSize: 13,
                              lineHeight: 1.55,
                              color: 'var(--color-text-2)',
                            }}
                          >
                            {entry.action_text}
                          </p>
                          {entry.action_type && (
                            <span
                              style={{
                                marginTop: 6,
                                display: 'inline-block',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: 10,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                color: 'var(--color-text-3)',
                                background: 'var(--color-surface-2)',
                              }}
                            >
                              {entry.action_type}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Related Actions Card */}
            {relatedActions.length > 0 && (
              <div style={sectionCard}>
                <h2 style={sectionHeading}>Related actions</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {relatedActions.map((action) => (
                    <div
                      key={action.id}
                      style={{
                        borderRadius: 10,
                        border: '1px solid var(--color-border)',
                        padding: 12,
                        background: 'var(--color-surface-2)',
                      }}
                    >
                      <p
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 13,
                          color: 'var(--color-text-1)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {action.title}
                      </p>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                        {action.date && (
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 11,
                              color: 'var(--color-text-3)',
                            }}
                          >
                            {formatDate(action.date)}
                          </span>
                        )}
                        {action.source_url && (
                          <a
                            href={action.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontSize: 12,
                              color: 'var(--color-accent-text)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            Source
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
