import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '../api/client';
import { fmtMoney as formatCurrency } from '../utils/format';

const API_BASE = getApiBaseUrl();

// ── Design tokens ──────────────────────────────────────────────────────
const BG = '#07090C';
const SURF = '#0D1117';
const SURF2 = '#141C25';
const B = 'rgba(235,229,213,0.08)';
const T1 = '#EBE5D5';
const T2 = '#A29A8A';
const T3 = '#6F6A5F';
const GOLD = '#C5A028';
const GOLDT = '#D4AE35';
const GOLDD = 'rgba(197,160,40,0.14)';
const DRD = '#E63946';
const DBL = '#4A7FDE';
const DGR = '#3DB87A';
const DPR = '#B06FD8';

interface ClosedLoop {
  company: { entity_type: string; entity_id: string; display_name: string };
  lobbying: { total_income: number; issue_codes: string; filing_count: number };
  bill: {
    bill_id: string;
    title: string;
    policy_area: string;
    status: string;
    referral_date: string | null;
  };
  committee: {
    thomas_id: string;
    name: string;
    chamber: string | null;
    referral_date: string | null;
  };
  politician: {
    person_id: string;
    committee_role: string;
    display_name: string;
    party: string;
    state: string;
  };
  donation: {
    total_amount: number;
    donation_count: number;
    latest_date: string | null;
  };
}

interface ClosedLoopResponse {
  closed_loops: ClosedLoop[];
  stats: {
    total_loops_found: number;
    unique_companies: number;
    unique_politicians: number;
    unique_bills: number;
    total_lobbying_spend: number;
    total_donations: number;
    partial?: boolean;
  };
}

// All 11 sectors WTP tracks. The backend ('entity_type' filter) accepts
// the lowercase form of any of these. Display labels here match the
// platform's sector convention; the lowercase hop happens at fetch time.
const SECTORS = [
  'All',
  'Finance',
  'Health',
  'Tech',
  'Energy',
  'Transportation',
  'Defense',
  'Chemicals',
  'Agriculture',
  'Telecom',
  'Education',
] as const;
type SectorFilter = (typeof SECTORS)[number];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 2020 + 1 },
  (_, i) => 2020 + i,
);

function companyRoute(entityType: string, entityId: string): string {
  const map: Record<string, string> = {
    finance: 'finance',
    health: 'health',
    tech: 'technology',
    technology: 'technology',
    energy: 'energy',
    defense: 'defense',
    transportation: 'transportation',
    chemicals: 'chemicals',
    agriculture: 'agriculture',
    telecom: 'telecommunications',
    telecommunications: 'telecommunications',
    education: 'education',
  };
  return `/${map[entityType] || 'politics'}/${entityId}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg, ' + BG + ')',
  color: T1,
  fontFamily: 'var(--font-body)',
};

export default function ClosedLoopPage() {
  const [data, setData] = useState<ClosedLoopResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sector, setSector] = useState<SectorFilter>('All');
  const [minDonation, setMinDonation] = useState(0);
  const [yearStart, setYearStart] = useState(2020);
  const [yearEnd, setYearEnd] = useState(CURRENT_YEAR);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (sector !== 'All') params.set('entity_type', sector.toLowerCase());
    if (minDonation > 0) params.set('min_donation', String(minDonation));
    params.set('year_from', String(yearStart));
    params.set('year_to', String(yearEnd));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    fetch(`${API_BASE}/influence/closed-loops?${params}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ClosedLoopResponse) => setData(d))
      .catch((e) => {
        if (e.name === 'AbortError') {
          setError(
            'Request timed out — the server may be under heavy load. Try narrowing filters.',
          );
        } else {
          setError(e.message);
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setLoading(false);
      });

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [sector, minDonation, yearStart, yearEnd]);

  const stats = data?.stats;
  const loops = data?.closed_loops || [];

  // Overall "ROI" for hero callout
  const headline = useMemo(() => {
    if (!stats) return null;
    const lob = stats.total_lobbying_spend;
    const don = stats.total_donations;
    return {
      total: stats.total_loops_found,
      companies: stats.unique_companies,
      politicians: stats.unique_politicians,
      lobbying: lob,
      donations: don,
    };
  }, [stats]);

  return (
    <main id="main-content" style={pageShell}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 40px 96px' }}>
        <Link
          to="/influence"
          style={{
            color: T3,
            textDecoration: 'none',
            fontSize: 12,
            letterSpacing: '0.04em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 18,
            fontFamily: 'var(--font-mono)',
          }}
        >
          ← Influence Explorer
        </Link>

        {/* Hero */}
        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: DRD,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 8,
              fontFamily: 'var(--font-body)',
            }}
          >
            Closed-Loop Case
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(32px, 4.8vw, 48px)',
              lineHeight: 1.02,
              letterSpacing: '-0.01em',
              color: T1,
              margin: '0 0 10px',
            }}
          >
            From donation to legislative outcome to reward.
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: T2,
              maxWidth: 620,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            When the complete sequence can be documented from public sources, we
            call it a closed loop. Correlation, not causation — but the pattern
            is what it is.
          </p>
        </div>

        {/* Partial-results banner */}
        {stats?.partial && (
          <div
            style={{
              padding: '10px 14px',
              background: GOLD + '10',
              border: `1px solid ${GOLD}30`,
              borderRadius: 8,
              marginBottom: 14,
              color: GOLDT,
              fontFamily: 'var(--font-body)',
              fontSize: 12,
            }}
          >
            Results may be incomplete — showing top matches within time limit.
          </div>
        )}

        {/* Filters */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'flex-end',
            padding: 14,
            background: SURF,
            border: `1px solid ${B}`,
            borderRadius: 12,
            marginBottom: 18,
          }}
        >
          {/* Sector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                color: T3,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Sector
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {SECTORS.map((s) => {
                const active = sector === s;
                return (
                  <button
                    key={s}
                    onClick={() => setSector(s)}
                    style={{
                      padding: '6px 11px',
                      borderRadius: 6,
                      border: `1px solid ${active ? GOLD : B}`,
                      background: active ? GOLDD : 'transparent',
                      color: active ? GOLDT : T3,
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      fontWeight: active ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Min donation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                color: T3,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Min Donation: {formatCurrency(minDonation)}
            </label>
            <input
              type="range"
              min={0}
              max={500000}
              step={5000}
              value={minDonation}
              onChange={(e) => setMinDonation(Number(e.target.value))}
              style={{ width: 160, accentColor: GOLD }}
            />
          </div>

          {/* Year range */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                color: T3,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Year Range
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                value={yearStart}
                onChange={(e) => setYearStart(Number(e.target.value))}
                style={{
                  background: SURF2,
                  border: `1px solid ${B}`,
                  color: T1,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  borderRadius: 6,
                  padding: '6px 8px',
                }}
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span style={{ color: T3, fontSize: 11 }}>to</span>
              <select
                value={yearEnd}
                onChange={(e) => setYearEnd(Number(e.target.value))}
                style={{
                  background: SURF2,
                  border: `1px solid ${B}`,
                  color: T1,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  borderRadius: 6,
                  padding: '6px 8px',
                }}
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loops.length > 0 && (
            <span
              style={{
                marginLeft: 'auto',
                color: T3,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
              }}
            >
              {loops.length.toLocaleString()} loops
            </span>
          )}
        </div>

        {/* Summary stat strip */}
        {headline && !loading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 10,
              marginBottom: 20,
            }}
          >
            {[
              { label: 'Loops', value: headline.total.toLocaleString(), color: DRD },
              {
                label: 'Companies',
                value: headline.companies.toLocaleString(),
                color: DPR,
              },
              {
                label: 'Politicians',
                value: headline.politicians.toLocaleString(),
                color: DBL,
              },
              {
                label: 'Lobbying',
                value: formatCurrency(headline.lobbying),
                color: GOLD,
              },
              {
                label: 'Donations',
                value: formatCurrency(headline.donations),
                color: DGR,
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  padding: '14px 16px',
                  background: SURF,
                  border: `1px solid ${B}`,
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 10,
                    fontWeight: 700,
                    color: T3,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 20,
                    fontWeight: 700,
                    color: s.color,
                    lineHeight: 1,
                  }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading / Error / Empty */}
        {loading && (
          <div
            style={{
              background: SURF,
              border: `1px solid ${B}`,
              borderRadius: 12,
              padding: '80px 24px',
              textAlign: 'center',
              color: T3,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            Analyzing influence chains across lobbying, bills, committees, and
            donations…
            <br />
            <span style={{ opacity: 0.65 }}>
              First load can take 5–10 seconds while we cross-reference 100k+
              donations against committee-bill memberships. Subsequent loads
              are cached.
            </span>
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              background: SURF,
              border: `1px solid ${DRD}30`,
              borderRadius: 12,
              padding: '40px 24px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: DRD,
                margin: '0 0 6px',
              }}
            >
              Failed to load influence loops.
            </p>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: T3,
                margin: 0,
              }}
            >
              {error}
            </p>
          </div>
        )}

        {!loading && !error && loops.length === 0 && (
          <div
            style={{
              background: SURF,
              border: `1px solid ${B}`,
              borderRadius: 12,
              padding: '80px 24px',
              textAlign: 'center',
              color: T3,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
            }}
          >
            No closed loops match the current filters.
          </div>
        )}

        {/* Loop cards (one vertical timeline per loop) */}
        {!loading && !error && loops.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {loops.map((loop, idx) => {
              const refDate =
                loop.bill.referral_date ||
                loop.committee.referral_date ||
                null;
              const partyColor =
                loop.politician.party === 'D'
                  ? DBL
                  : loop.politician.party === 'R'
                    ? DRD
                    : loop.politician.party === 'I'
                      ? DPR
                      : T3;

              const STEPS: {
                n: number;
                label: string;
                color: string;
                icon: string;
                detail: React.ReactNode;
                date: string;
              }[] = [
                {
                  n: 1,
                  label: 'Lobbying spend',
                  color: GOLD,
                  icon: '$',
                  detail: (
                    <>
                      <Link
                        to={companyRoute(
                          loop.company.entity_type,
                          loop.company.entity_id,
                        )}
                        style={{ color: GOLDT, textDecoration: 'none' }}
                      >
                        {loop.company.display_name}
                      </Link>{' '}
                      spent{' '}
                      <span style={{ color: T1, fontFamily: 'var(--font-mono)' }}>
                        {formatCurrency(loop.lobbying.total_income)}
                      </span>{' '}
                      lobbying across{' '}
                      {loop.lobbying.filing_count.toLocaleString()} filings
                      {loop.lobbying.issue_codes
                        ? ` on ${loop.lobbying.issue_codes
                            .split(', ')
                            .slice(0, 2)
                            .join(', ')}`
                        : ''}
                      .
                    </>
                  ),
                  date: `${yearStart}–${yearEnd}`,
                },
                {
                  n: 2,
                  label: 'Bill referred',
                  color: DBL,
                  icon: '§',
                  detail: (
                    <>
                      <Link
                        to={`/politics/bill/${loop.bill.bill_id}`}
                        style={{ color: DBL, textDecoration: 'none' }}
                        title={loop.bill.title}
                      >
                        {loop.bill.title}
                      </Link>{' '}
                      —{' '}
                      <span style={{ color: T2 }}>{loop.bill.status}</span>
                    </>
                  ),
                  date: fmtDate(refDate),
                },
                {
                  n: 3,
                  label: 'Committee',
                  color: DPR,
                  icon: '⎈',
                  detail: (
                    <>
                      Referred to{' '}
                      <span style={{ color: DPR }}>{loop.committee.name}</span>
                      {loop.committee.chamber ? (
                        <span style={{ color: T3 }}>
                          {' '}
                          · {loop.committee.chamber}
                        </span>
                      ) : null}
                    </>
                  ),
                  date: fmtDate(loop.committee.referral_date),
                },
                {
                  n: 4,
                  label: 'Politician seat',
                  color: DGR,
                  icon: '⚑',
                  detail: (
                    <>
                      <Link
                        to={`/politics/people/${loop.politician.person_id}`}
                        style={{ color: DGR, textDecoration: 'none' }}
                      >
                        {loop.politician.display_name}
                      </Link>{' '}
                      <span style={{ color: partyColor }}>
                        ({loop.politician.party}-{loop.politician.state})
                      </span>
                      {loop.politician.committee_role
                        ? ` serves as ${loop.politician.committee_role}`
                        : ` sits on the committee`}
                      .
                    </>
                  ),
                  date: '—',
                },
                {
                  n: 5,
                  label: 'Donation',
                  color: DRD,
                  icon: '✓',
                  detail: (
                    <>
                      {loop.company.display_name}-linked PAC gave{' '}
                      <span style={{ color: T1, fontFamily: 'var(--font-mono)' }}>
                        {formatCurrency(loop.donation.total_amount)}
                      </span>{' '}
                      to {loop.politician.display_name}
                      {loop.donation.donation_count > 1
                        ? ` across ${loop.donation.donation_count} contributions`
                        : ''}
                      .
                    </>
                  ),
                  date: fmtDate(loop.donation.latest_date),
                },
              ];

              const ratio =
                loop.lobbying.total_income > 0
                  ? loop.donation.total_amount / loop.lobbying.total_income
                  : 0;

              return (
                <div
                  key={`${loop.company.entity_id}-${loop.bill.bill_id}-${loop.politician.person_id}-${idx}`}
                  style={{
                    position: 'relative',
                    padding: '22px 26px',
                    background: SURF,
                    border: `1px solid ${B}`,
                    borderRadius: 14,
                  }}
                >
                  {/* Sector chip */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 14,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        fontWeight: 700,
                        color: GOLDT,
                        background: GOLDD,
                        border: `1px solid ${GOLD}30`,
                        borderRadius: 4,
                        padding: '3px 7px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {loop.company.entity_type}
                    </span>
                    {ratio > 0 && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          color: T3,
                        }}
                      >
                        donations / lobbying ={' '}
                        <span style={{ color: T1 }}>
                          {ratio < 0.01 ? ratio.toFixed(4) : ratio.toFixed(3)}×
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Vertical timeline */}
                  <div style={{ position: 'relative' }}>
                    {/* The spine */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 21,
                        top: 22,
                        bottom: 22,
                        width: 2,
                        background: B,
                      }}
                    />
                    {STEPS.map((s, i) => (
                      <div
                        key={s.n}
                        style={{
                          display: 'flex',
                          gap: 18,
                          position: 'relative',
                          marginBottom: i === STEPS.length - 1 ? 0 : 14,
                          alignItems: 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            flexShrink: 0,
                            borderRadius: '50%',
                            background: s.color + '22',
                            border: `2px solid ${s.color}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            fontSize: 18,
                            color: s.color,
                            zIndex: 1,
                          }}
                        >
                          {s.icon}
                        </div>
                        <div
                          style={{
                            flex: 1,
                            padding: '14px 16px',
                            background: SURF2,
                            border: `1px solid ${B}`,
                            borderRadius: 10,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'baseline',
                              marginBottom: 5,
                              gap: 10,
                              flexWrap: 'wrap',
                            }}
                          >
                            <div>
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: s.color,
                                  marginRight: 10,
                                  letterSpacing: '0.06em',
                                }}
                              >
                                STEP {s.n}
                              </span>
                              <span
                                style={{
                                  fontFamily: 'var(--font-body)',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: T1,
                                }}
                              >
                                {s.label}
                              </span>
                            </div>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 10,
                                color: T3,
                              }}
                            >
                              {s.date}
                            </span>
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: 13,
                              color: T2,
                              lineHeight: 1.5,
                            }}
                          >
                            {s.detail}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Loop-closed callout */}
                  <div
                    style={{
                      marginTop: 16,
                      padding: '14px 18px',
                      background: DRD + '10',
                      border: `1px solid ${DRD}30`,
                      borderRadius: 12,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 10,
                        fontWeight: 700,
                        color: DRD,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      Loop Closed
                    </div>
                    <p
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 13,
                        color: T2,
                        lineHeight: 1.55,
                        margin: 0,
                      }}
                    >
                      <strong style={{ color: T1 }}>
                        {formatCurrency(loop.lobbying.total_income)}
                      </strong>{' '}
                      in lobbying +{' '}
                      <strong style={{ color: T1 }}>
                        {formatCurrency(loop.donation.total_amount)}
                      </strong>{' '}
                      in contributions traced through the same bill, committee,
                      and member. No violation of current law has occurred —
                      the record is the record.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
