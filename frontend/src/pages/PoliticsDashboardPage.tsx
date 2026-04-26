import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { ChamberPartyBreakdown, DashboardStats, Person, RecentAction } from '../api/types';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import { fmtNum } from '../utils/format';

/**
 * Politics Dashboard — CLOD redesign (Apr 2026).
 *
 * Layout follows `WeThePeople Design Exploration.html` → Dashboard screen
 * (README § 6 + design-handoff prototype):
 *   Hero → 4-col Stat cards → Balance of Power → 5-col sub-nav → Two-column
 *   (Featured members | Recent activity + Data sources)
 *
 * Sector-agnostic: sibling sector dashboards reuse this pattern with their
 * own accent via CSS var overrides. No framer-motion, no SpotlightCard —
 * the prototype uses a flat editorial layout with one-off hover states.
 */

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const PARTY_COLORS: Record<string, string> = {
  D: 'var(--color-dem)',
  R: 'var(--color-rep)',
  I: 'var(--color-ind)',
};

interface ChamberBreakdown {
  total: number;
  democrat: number;
  republican: number;
  independent: number;
}

const EMPTY_BREAKDOWN: ChamberBreakdown = {
  total: 0,
  democrat: 0,
  republican: 0,
  independent: 0,
};

function chamberPct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

function partyColor(party: string | null): string {
  return PARTY_COLORS[party?.charAt(0) || ''] || 'var(--color-text-3)';
}

function partyLabel(party: string | null): string {
  const p = party?.charAt(0);
  if (p === 'D') return 'Democrat';
  if (p === 'R') return 'Republican';
  if (p === 'I') return 'Independent';
  return party || 'Unknown';
}

// ─────────────────────────────────────────────────────────────────────
// Stat card — surface bg, hover reveals left accent bar
// (spec § StatCard — prototype lines 543-563)
// ─────────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  color: string;
  to: string;
  subLabel?: string;
}

function StatCard({ label, value, color, to, subLabel }: StatCardProps) {
  const [hov, setHov] = useState(false);
  return (
    <Link
      to={to}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="no-underline relative block"
      style={{
        padding: 24,
        borderRadius: 12,
        background: hov ? 'var(--color-surface-2)' : 'var(--color-surface)',
        border: `1px solid ${hov ? 'var(--color-border-hover)' : 'var(--color-border)'}`,
        transition: 'background 0.2s, border-color 0.2s',
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 3,
          height: '100%',
          background: color,
          opacity: hov ? 1 : 0,
          transition: 'opacity 0.2s',
        }}
      />
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-3)',
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 36,
          fontWeight: 700,
          color: 'var(--color-text-1)',
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {subLabel && (
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: 'var(--color-text-3)',
            marginTop: 6,
          }}
        >
          {subLabel}
        </div>
      )}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Chamber bar — 10px hairline with party segments + inline majority badge
// (spec § ChamberBar — prototype lines 565-601)
// ─────────────────────────────────────────────────────────────────────

function ChamberBar({
  label,
  breakdown,
}: {
  label: string;
  breakdown: ChamberBreakdown;
}) {
  const majority = Math.ceil(breakdown.total / 2) + 1;
  const dPct = chamberPct(breakdown.democrat, breakdown.total);
  const rPct = chamberPct(breakdown.republican, breakdown.total);
  const iPct = chamberPct(breakdown.independent, breakdown.total);
  const leading =
    breakdown.democrat > breakdown.republican
      ? 'DEM'
      : breakdown.republican > breakdown.democrat
        ? 'GOP'
        : 'TIE';
  const badge =
    leading === 'DEM'
      ? {
          bg: 'rgba(74,127,222,0.15)',
          fg: 'var(--color-dem)',
          text: 'DEM MAJORITY',
        }
      : leading === 'GOP'
        ? {
            bg: 'rgba(224,85,85,0.15)',
            fg: 'var(--color-rep)',
            text: 'GOP MAJORITY',
          }
        : {
            bg: 'var(--color-surface-2)',
            fg: 'var(--color-text-2)',
            text: 'TIE',
          };

  return (
    <div>
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 10 }}
      >
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-3)',
          }}
        >
          {label}
        </span>
        <div className="flex items-center" style={{ gap: 16 }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: 'var(--color-text-3)',
            }}
          >
            {breakdown.total} seats · {majority} for majority
          </span>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '2px 8px',
              borderRadius: 10,
              background: badge.bg,
              color: badge.fg,
            }}
          >
            {badge.text}
          </span>
        </div>
      </div>

      {/* 10px bar with hairline party segments (D · I · R order) */}
      <div
        className="flex overflow-hidden"
        style={{ height: 10, borderRadius: 6, gap: 1, marginBottom: 8 }}
      >
        {breakdown.democrat > 0 && (
          <div
            style={{
              flex: dPct,
              background: 'var(--color-dem)',
              minWidth: 0,
              transition: 'flex 0.5s',
            }}
          />
        )}
        {breakdown.independent > 0 && (
          <div
            style={{
              flex: iPct,
              background: 'var(--color-ind)',
              minWidth: 0,
              transition: 'flex 0.5s',
            }}
          />
        )}
        {breakdown.republican > 0 && (
          <div
            style={{
              flex: rPct,
              background: 'var(--color-rep)',
              minWidth: 0,
              transition: 'flex 0.5s',
            }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex" style={{ gap: 16 }}>
        <LegendDot color="var(--color-dem)" label="Dem" count={breakdown.democrat} />
        <LegendDot color="var(--color-rep)" label="Rep" count={breakdown.republican} />
        {breakdown.independent > 0 && (
          <LegendDot
            color="var(--color-ind)"
            label="Ind"
            count={breakdown.independent}
          />
        )}
      </div>
    </div>
  );
}

function LegendDot({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center" style={{ gap: 5 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: color,
          display: 'inline-block',
        }}
      />
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: 'var(--color-text-3)',
        }}
      >
        {label} {count}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Member card (spec § MemberCard — prototype lines 603-629)
// ─────────────────────────────────────────────────────────────────────

function MemberCard({ person }: { person: Person }) {
  const [hov, setHov] = useState(false);
  const pc = partyColor(person.party);
  const pLabel = partyLabel(person.party);
  const chamber = person.chamber?.toLowerCase().includes('senate')
    ? 'Senate'
    : 'House';
  return (
    <Link
      to={`/politics/people/${person.person_id}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="no-underline flex items-center"
      style={{
        gap: 12,
        padding: '12px 16px',
        borderRadius: 10,
        background: hov ? 'var(--color-surface-2)' : 'var(--color-surface)',
        border: `1px solid ${hov ? 'var(--color-border-hover)' : 'var(--color-border)'}`,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {person.photo_url ? (
        <img
          src={person.photo_url}
          alt={person.display_name}
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            objectFit: 'cover',
            border: `1.5px solid ${pc}`,
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `${pc}22`,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 700,
            fontSize: 14,
            color: pc,
            flexShrink: 0,
          }}
        >
          {person.display_name.charAt(0)}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {person.display_name}
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: 'var(--color-text-3)',
          }}
        >
          {person.state}
        </div>
      </div>
      <div className="flex" style={{ gap: 6 }}>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 10,
            fontWeight: 600,
            padding: '3px 7px',
            borderRadius: 6,
            background: `${pc}18`,
            color: pc,
          }}
        >
          {pLabel}
        </span>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 10,
            padding: '3px 7px',
            borderRadius: 6,
            background: 'var(--color-surface-2)',
            color: 'var(--color-text-3)',
          }}
        >
          {chamber}
        </span>
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Activity item (spec § ActivityItem — prototype lines 631-642)
// ─────────────────────────────────────────────────────────────────────

function ActivityItem({ action }: { action: RecentAction }) {
  const billTag =
    action.bill_type && action.bill_number
      ? `${action.bill_type.toUpperCase()} ${action.bill_number}`
      : null;
  const dateStr = action.date
    ? new Date(action.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : '';
  const billUrl =
    action.bill_type && action.bill_number && action.bill_congress
      ? `https://www.congress.gov/bill/${action.bill_congress}th-congress/${
          action.bill_type === 'hr'
            ? 'house-bill'
            : action.bill_type === 's'
              ? 'senate-bill'
              : action.bill_type
        }/${action.bill_number}`
      : null;

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--color-text-1)',
          lineHeight: 1.4,
          marginBottom: 5,
        }}
      >
        {action.title}
      </div>
      <div className="flex items-center" style={{ gap: 8 }}>
        {billTag &&
          (billUrl ? (
            <a
              href={billUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 5,
                background: 'rgba(74,127,222,0.12)',
                color: 'var(--color-dem)',
              }}
            >
              {billTag}
            </a>
          ) : (
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 5,
                background: 'rgba(74,127,222,0.12)',
                color: 'var(--color-dem)',
              }}
            >
              {billTag}
            </span>
          ))}
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: 'var(--color-text-3)',
          }}
        >
          {dateStr}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function PoliticsDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [breakdown, setBreakdown] = useState<ChamberPartyBreakdown | null>(null);
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguish API failure from "no data". Without this the dashboard
  // rendered all-zero stat cards on a 5xx, indistinguishable from
  // congress actually being on recess.
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.getDashboardStats(),
      apiClient.getPeople({ limit: 6, has_ledger: true }),
      apiClient.getRecentActions(5),
      // Server-side aggregate — replaces the previous "fetch 600 people to
      // compute party counts in the browser" pattern (routers/politics_people.py:
      // get_chamber_party_breakdown).
      apiClient.getChamberPartyBreakdown(true),
    ])
      .then(([s, p, a, bp]) => {
        if (cancelled) return;
        setStats(s);
        setPeople(p.people || []);
        setActions(a || []);
        setBreakdown(bp);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[PoliticsDashboardPage] load failed:', err);
        setLoadError(err?.message || 'Could not load dashboard data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const house = useMemo<ChamberBreakdown>(
    () => breakdown?.house ?? EMPTY_BREAKDOWN,
    [breakdown],
  );
  const senate = useMemo<ChamberBreakdown>(
    () => breakdown?.senate ?? EMPTY_BREAKDOWN,
    [breakdown],
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div
          className="animate-spin"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '2px solid var(--color-border)',
            borderTopColor: 'var(--color-accent)',
          }}
        />
      </div>
    );
  }

  const statCards: StatCardProps[] = [
    {
      label: 'Members tracked',
      value: fmtNum(stats?.total_people || 0),
      subLabel: 'House + Senate',
      color: 'var(--color-accent)',
      to: '/politics/people',
    },
    {
      label: 'Bills tracked',
      value: fmtNum(stats?.total_bills || 0),
      subLabel: 'Current session',
      color: 'var(--color-dem)',
      to: '/politics/legislation',
    },
    {
      label: 'Actions monitored',
      value: fmtNum(stats?.total_actions || 0),
      subLabel: 'All time',
      color: 'var(--color-green)',
      to: '/politics/activity',
    },
    {
      label: 'Legislative actions',
      value: fmtNum(stats?.total_claims || 0),
      subLabel: 'Votes, amendments, markups',
      color: 'var(--color-amber)',
      to: '/politics/activity',
    },
  ];

  const subNavLinks = [
    {
      to: '/politics/people',
      label: 'Representatives',
      desc: 'Full member directory',
      color: 'var(--color-accent)',
    },
    {
      to: '/politics/activity',
      label: 'Activity feed',
      desc: 'Latest legislative actions',
      color: 'var(--color-amber)',
    },
    {
      to: '/politics/legislation',
      label: 'Legislation',
      desc: 'Bills & voting tracker',
      color: 'var(--color-green)',
    },
    {
      to: '/politics/compare',
      label: 'Compare',
      desc: 'Side-by-side analysis',
      color: 'var(--color-ind)',
    },
    {
      to: '/politics/states',
      label: 'Explore by state',
      desc: 'State legislatures & bills',
      color: 'var(--color-verify)',
    },
  ];

  const dataSources = [
    'Congress.gov',
    'Senate LDA',
    'USASpending.gov',
    'FEC',
    'Quiver Quant',
    'Federal Register',
    'OpenStates',
    'SAM.gov',
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <PoliticsSectorHeader />

      <div
        className="mx-auto"
        style={{ maxWidth: 1280, padding: '40px 40px 80px' }}
      >
        {loadError && (
          <div
            role="alert"
            style={{
              marginBottom: 24,
              padding: '14px 18px',
              borderRadius: 12,
              border: '1px solid rgba(230, 57, 70, 0.35)',
              background: 'rgba(230, 57, 70, 0.08)',
              color: 'var(--color-red)',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Could not load dashboard data: {loadError}. Stat cards may
            show stale or empty values until you refresh.
          </div>
        )}

        {/* ── HERO ── single column per CLOD prototype */}
        <div className="animate-fade-up" style={{ marginBottom: 40 }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-text)',
              marginBottom: 10,
            }}
          >
            Congressional transparency
          </p>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontStyle: 'italic',
              fontWeight: 800,
              fontSize: 'clamp(32px, 4vw, 52px)',
              color: 'var(--color-text-1)',
              letterSpacing: '-0.01em',
              lineHeight: 1.05,
              margin: '0 0 12px',
            }}
          >
            Tracking what
            <br />
            politicians{' '}
            <span style={{ color: 'var(--color-accent-text)' }}>
              actually do.
            </span>
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 16,
              color: 'var(--color-text-2)',
              maxWidth: 500,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Real voting records, legislative actions, and financial data for
            every member of Congress. No spin.
          </p>
        </div>

        {/* ── STAT CARDS ── 4-column row */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 12,
            marginBottom: 32,
          }}
        >
          {statCards.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>

        {/* ── BALANCE OF POWER ── */}
        {people.length > 0 && (
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 24 }}
            >
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-2)',
                }}
              >
                Balance of power
              </span>
              {/* The standalone /politics/balance-of-power page was merged
                  into this dashboard. Link removed (was a 404). */}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <ChamberBar label="House of Representatives" breakdown={house} />
              <div style={{ borderTop: '1px solid var(--color-border)' }} />
              <ChamberBar label="Senate" breakdown={senate} />
            </div>
          </div>
        )}

        {/* ── SUB-NAV CARDS ── 5 equal columns */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 10,
            marginBottom: 32,
          }}
        >
          {subNavLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="no-underline block"
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: link.color,
                  marginBottom: 4,
                }}
              >
                {link.label}
              </div>
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  color: 'var(--color-text-3)',
                }}
              >
                {link.desc}
              </div>
            </Link>
          ))}
        </div>

        {/* ── FEATURED MEMBERS + RECENT ACTIVITY (+ Data sources) ── */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 20,
          }}
        >
          {/* Left: Featured members */}
          <section>
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 14 }}
            >
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-3)',
                }}
              >
                Featured members
              </span>
              <Link
                to="/politics/people"
                className="no-underline"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: 'var(--color-accent-text)',
                }}
              >
                View all →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {people.map((p) => (
                <MemberCard key={p.person_id} person={p} />
              ))}
            </div>
          </section>

          {/* Right: Recent activity + Data sources */}
          <section>
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 14 }}
            >
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-3)',
                }}
              >
                Recent activity
              </span>
              <Link
                to="/politics/activity"
                className="no-underline"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: 'var(--color-accent-text)',
                }}
              >
                Full feed →
              </Link>
            </div>
            <div
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {actions.map((a) => (
                <ActivityItem key={a.id} action={a} />
              ))}
              <div style={{ padding: '12px 16px' }}>
                <Link
                  to="/politics/activity"
                  className="no-underline inline-flex items-center"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12,
                    color: 'var(--color-accent-text)',
                    gap: 5,
                  }}
                >
                  View all activity
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Data sources chip box (prototype § 761-769) */}
            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 10,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-3)',
                  marginBottom: 10,
                }}
              >
                Data sources
              </div>
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {dataSources.map((s) => (
                  <span
                    key={s}
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'var(--color-surface-2)',
                      color: 'var(--color-text-3)',
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
