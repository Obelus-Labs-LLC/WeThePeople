import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '../api/client';

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

interface LobbyingLeader {
  entity_id: string;
  display_name: string;
  sector: string;
  total_lobbying: number;
}

interface SectorStats {
  lobbying: number;
  contracts: number;
  enforcement: number;
}

interface StatsData {
  total_lobbying_spend: number;
  total_contract_value: number;
  total_enforcement_actions: number;
  by_sector: Record<string, SectorStats>;
}

// Sector → accent color for this page
const SECTOR_COLORS: Record<string, string> = {
  finance: DGR,
  health: DPR,
  tech: DBL,
  energy: GOLD,
  defense: DRD,
  transportation: GOLDT,
};

const SECTOR_LABELS: Record<string, string> = {
  finance: 'Finance',
  health: 'Health',
  tech: 'Tech',
  energy: 'Energy',
  defense: 'Defense',
  transportation: 'Transport',
};

const METRIC_LABELS: Record<'lobbying' | 'contracts' | 'enforcement', string> = {
  lobbying: 'Lobbying $',
  contracts: 'Contracts $',
  enforcement: 'Enforcement',
};

function formatMoney(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function companyRoute(sector: string, entityId: string): string {
  const map: Record<string, string> = {
    finance: 'finance',
    health: 'health',
    tech: 'technology',
    energy: 'energy',
    defense: 'defense',
    transportation: 'transportation',
  };
  return `/${map[sector] || 'politics'}/${entityId}`;
}

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg, ' + BG + ')',
  color: T1,
  fontFamily: 'var(--font-body)',
};

const EXPLORE_LINKS = [
  {
    to: '/influence/money-flow',
    label: 'Money Flow Sankey',
    desc: 'Follow the money visually',
    color: GOLD,
  },
  {
    to: '/influence/network',
    label: 'Influence Network',
    desc: 'Force-directed connections',
    color: DBL,
  },
  {
    to: '/influence/map',
    label: 'Spending Map',
    desc: 'Geographic breakdown',
    color: DPR,
  },
  {
    to: '/influence/timeline',
    label: 'Influence Timeline',
    desc: 'Per-bill chronology',
    color: DGR,
  },
  {
    to: '/influence/closed-loops',
    label: 'Closed Loops',
    desc: 'Donation → vote → reward',
    color: DRD,
  },
  {
    to: '/influence/anomalies',
    label: 'Anomalies',
    desc: 'Flagged statistical deviations',
    color: DRD,
  },
];

export default function DataExplorerPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [leaders, setLeaders] = useState<LobbyingLeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(
    new Set(['finance', 'health', 'tech', 'energy']),
  );
  const [metric, setMetric] = useState<'lobbying' | 'contracts' | 'enforcement'>(
    'lobbying',
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/influence/stats`).then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      }),
      fetch(`${API_BASE}/influence/top-lobbying?limit=30`).then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      }),
    ])
      .then(([s, l]) => {
        if (cancelled) return;
        setStats(s);
        setLeaders(l.leaders || []);
      })
      .catch((err) => { console.warn('[DataExplorerPage] fetch failed:', err); })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSector = (s: string) => {
    setSelectedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const filteredLeaders = leaders.filter((l) => selectedSectors.has(l.sector));
  const maxLobbying = Math.max(
    1,
    ...filteredLeaders.map((l) => l.total_lobbying),
  );

  const filteredStats = stats
    ? Object.entries(stats.by_sector)
        .filter(([s]) => selectedSectors.has(s))
        .reduce(
          (acc, [, d]) => ({
            lobbying: acc.lobbying + d.lobbying,
            contracts: acc.contracts + d.contracts,
            enforcement: acc.enforcement + d.enforcement,
          }),
          { lobbying: 0, contracts: 0, enforcement: 0 },
        )
    : null;

  return (
    <main id="main-content" style={pageShell}>
      <div
        style={{ maxWidth: 1240, margin: '0 auto', padding: '32px 40px 96px' }}
      >
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
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              fontWeight: 700,
              color: GOLDT,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Data Explorer · Cross-sector
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
            Query the whole database.
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: T2,
              maxWidth: 640,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Interactive cross-sector comparison. Toggle sectors to filter the
            breakdown, totals, and top-spender leaderboard at once.
          </p>
        </div>

        {/* Sector toggle row */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          {Object.entries(SECTOR_COLORS).map(([sector, color]) => {
            const on = selectedSectors.has(sector);
            return (
              <button
                key={sector}
                onClick={() => toggleSector(sector)}
                aria-pressed={on}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: `1px solid ${on ? color : B}`,
                  background: on ? color + '18' : 'transparent',
                  color: on ? color : T3,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {SECTOR_LABELS[sector] || sector}
              </button>
            );
          })}
          <button
            onClick={() =>
              setSelectedSectors(
                new Set(['finance', 'health', 'tech', 'energy']),
              )
            }
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: 'transparent',
              border: `1px solid ${B}`,
              color: T3,
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            ↺ Reset
          </button>
          <span
            style={{
              marginLeft: 'auto',
              color: T3,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            {selectedSectors.size} sector{selectedSectors.size !== 1 ? 's' : ''}{' '}
            active
          </span>
        </div>

        {/* Loading state */}
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
            }}
          >
            Loading cross-sector stats…
          </div>
        )}

        {!loading && (
          <>
            {/* Top grid: breakdown / totals / quick-nav */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
                gap: 14,
                marginBottom: 18,
              }}
            >
              {/* Sector breakdown card */}
              {stats && (
                <div
                  style={{
                    background: SURF,
                    border: `1px solid ${B}`,
                    borderRadius: 12,
                    padding: 20,
                    minWidth: 0,
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
                      marginBottom: 12,
                    }}
                  >
                    Sector Breakdown
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(stats.by_sector)
                      .filter(([s]) => selectedSectors.has(s))
                      .map(([sector, data]) => {
                        const val =
                          metric === 'lobbying'
                            ? data.lobbying
                            : metric === 'contracts'
                              ? data.contracts
                              : data.enforcement;
                        const total = Object.entries(stats.by_sector)
                          .filter(([s]) => selectedSectors.has(s))
                          .reduce(
                            (sum, [, d]) =>
                              sum +
                              (metric === 'lobbying'
                                ? d.lobbying
                                : metric === 'contracts'
                                  ? d.contracts
                                  : d.enforcement),
                            0,
                          );
                        const pct = total > 0 ? (val / total) * 100 : 0;
                        const color = SECTOR_COLORS[sector] || T2;
                        return (
                          <div key={sector}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'baseline',
                                marginBottom: 4,
                              }}
                            >
                              <span
                                style={{
                                  color,
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  letterSpacing: '0.06em',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {SECTOR_LABELS[sector] || sector}
                              </span>
                              <span
                                style={{
                                  color: T1,
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 12,
                                }}
                              >
                                {metric === 'enforcement'
                                  ? val.toLocaleString()
                                  : formatMoney(val)}
                              </span>
                            </div>
                            <div
                              style={{
                                height: 6,
                                background: SURF2,
                                borderRadius: 3,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  background: color,
                                  width: `${pct}%`,
                                  transition: 'width 0.4s',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Metric toggle */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: `1px solid ${B}`,
                    }}
                  >
                    {(['lobbying', 'contracts', 'enforcement'] as const).map(
                      (m) => {
                        const on = metric === m;
                        return (
                          <button
                            key={m}
                            onClick={() => setMetric(m)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 5,
                              border: `1px solid ${on ? GOLD : B}`,
                              background: on ? GOLDD : 'transparent',
                              color: on ? GOLDT : T3,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              fontWeight: on ? 700 : 500,
                              cursor: 'pointer',
                            }}
                          >
                            {METRIC_LABELS[m]}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              )}

              {/* Totals card */}
              {filteredStats && (
                <div
                  style={{
                    background: SURF,
                    border: `1px solid ${B}`,
                    borderRadius: 12,
                    padding: 20,
                    minWidth: 0,
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
                      marginBottom: 12,
                    }}
                  >
                    Filtered Totals
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    {[
                      {
                        label: 'Lobbying spend',
                        value: formatMoney(filteredStats.lobbying),
                        color: GOLD,
                      },
                      {
                        label: 'Contract value',
                        value: formatMoney(filteredStats.contracts),
                        color: DPR,
                      },
                      {
                        label: 'Enforcement actions',
                        value: filteredStats.enforcement.toLocaleString(),
                        color: DRD,
                      },
                    ].map((t) => (
                      <div key={t.label}>
                        <div
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 10,
                            fontWeight: 700,
                            color: T3,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            marginBottom: 3,
                          }}
                        >
                          {t.label}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 22,
                            fontWeight: 700,
                            color: t.color,
                            lineHeight: 1,
                          }}
                        >
                          {t.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick-nav card */}
              <div
                style={{
                  background: SURF,
                  border: `1px solid ${B}`,
                  borderRadius: 12,
                  padding: 20,
                  minWidth: 0,
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
                    marginBottom: 12,
                  }}
                >
                  Explore
                </div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  {EXPLORE_LINKS.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      style={{
                        display: 'block',
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: SURF2,
                        border: `1px solid ${B}`,
                        textDecoration: 'none',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor =
                          link.color + '50';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = B;
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 13,
                          fontWeight: 600,
                          color: T1,
                        }}
                      >
                        <span style={{ color: link.color, marginRight: 6 }}>
                          ◆
                        </span>
                        {link.label}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 11,
                          color: T3,
                          marginTop: 2,
                        }}
                      >
                        {link.desc}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Top lobbying leaderboard */}
            <div
              style={{
                background: SURF,
                border: `1px solid ${B}`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 14,
                  paddingBottom: 12,
                  borderBottom: `1px solid ${B}`,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 10,
                      fontWeight: 700,
                      color: T3,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      marginBottom: 4,
                    }}
                  >
                    Leaderboard · Read-only
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      fontWeight: 700,
                      fontSize: 22,
                      color: T1,
                    }}
                  >
                    Top lobbying spenders
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: T3,
                  }}
                >
                  {filteredLeaders.length} result
                  {filteredLeaders.length !== 1 ? 's' : ''}
                </span>
              </div>

              {filteredLeaders.length === 0 ? (
                <div
                  style={{
                    padding: '40px 10px',
                    textAlign: 'center',
                    color: T3,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                  }}
                >
                  No spenders match the selected sectors.
                </div>
              ) : (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {filteredLeaders.slice(0, 20).map((l, i) => {
                    const color = SECTOR_COLORS[l.sector] || T2;
                    return (
                      <Link
                        key={l.entity_id}
                        to={companyRoute(l.sector, l.entity_id)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '36px 1fr 90px 80px',
                          gap: 12,
                          alignItems: 'center',
                          padding: '8px 10px',
                          borderRadius: 8,
                          textDecoration: 'none',
                          color: 'inherit',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background =
                            SURF2;
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background =
                            'transparent';
                        }}
                      >
                        <span
                          style={{
                            color: T3,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            textAlign: 'right',
                          }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: 13,
                              fontWeight: 600,
                              color: T1,
                              marginBottom: 4,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={l.display_name}
                          >
                            {l.display_name}
                          </div>
                          <div
                            style={{
                              height: 4,
                              background: SURF2,
                              borderRadius: 2,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                background: color,
                                width: `${(l.total_lobbying / maxLobbying) * 100}%`,
                                transition: 'width 0.4s',
                              }}
                            />
                          </div>
                        </div>
                        <span
                          style={{
                            color: GOLDT,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            textAlign: 'right',
                          }}
                        >
                          {formatMoney(l.total_lobbying)}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            fontWeight: 700,
                            color,
                            background: color + '18',
                            border: `1px solid ${color}30`,
                            borderRadius: 5,
                            padding: '3px 7px',
                            textAlign: 'center',
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {SECTOR_LABELS[l.sector] || l.sector}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
