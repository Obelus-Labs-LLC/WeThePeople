import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

interface Anomaly {
  id: number;
  pattern_type: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  score: number;
  title: string;
  description: string | null;
  evidence: Record<string, unknown> | null;
  detected_at: string | null;
}

interface AnomalyResponse {
  total: number;
  anomalies: Anomaly[];
}

const PATTERN_LABELS: Record<string, string> = {
  trade_near_vote: 'Insider trade',
  lobbying_spike: 'Lobbying spike',
  enforcement_gap: 'Enforcement gap',
  revolving_door: 'Revolving door',
};

// Map pattern_type → visual "type" slug in design
const PATTERN_TO_TYPE: Record<string, string> = {
  trade_near_vote: 'insider',
  lobbying_spike: 'lobbying',
  enforcement_gap: 'enforce',
  revolving_door: 'vote',
};

// Severity from score (score is 0..10 in backend)
type Severity = 'high' | 'med' | 'low';
function severityFromScore(s: number): Severity {
  if (s >= 7) return 'high';
  if (s >= 5) return 'med';
  return 'low';
}
const SEV_COLOR: Record<Severity, string> = {
  high: DRD,
  med: GOLD,
  low: DBL,
};

// score 0..10 → approx σ (1.5..3+) for display bar
function sigmaFromScore(s: number): number {
  return Math.max(1.5, Math.min(3.2, 1.5 + (s / 10) * 1.7));
}

function entityRoute(
  entityType: string,
  entityId: string,
  _patternType: string,
  evidence: Record<string, unknown> | null,
): string {
  if (entityType === 'person') return `/politics/people/${entityId}`;
  const sector = evidence?.sector as string | undefined;
  if (sector === 'finance') return `/finance/${entityId}`;
  if (sector === 'health') return `/health/${entityId}`;
  if (sector === 'tech' || sector === 'technology') return `/technology/${entityId}`;
  if (sector === 'energy') return `/energy/${entityId}`;
  if (sector === 'defense') return `/defense/${entityId}`;
  if (sector === 'transportation') return `/transportation/${entityId}`;
  if (sector === 'agriculture') return `/agriculture/${entityId}`;
  if (sector === 'chemicals') return `/chemicals/${entityId}`;
  if (sector === 'telecom' || sector === 'telecommunications')
    return `/telecom/${entityId}`;
  if (sector === 'education') return `/education/${entityId}`;
  return `/`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Filter pills spec (key maps to either pattern_type or severity)
type FilterKey = 'all' | 'high' | 'insider' | 'contract' | 'lobbying' | 'vote';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High severity' },
  { key: 'insider', label: 'Insider trades' },
  { key: 'contract', label: 'Contracts' },
  { key: 'lobbying', label: 'Lobbying' },
  { key: 'vote', label: 'Votes' },
];

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg, ' + BG + ')',
  color: T1,
  fontFamily: 'var(--font-body)',
};

export default function AnomaliesPage() {
  const [searchParams] = useSearchParams();
  const entityFilter = searchParams.get('entity_id') || '';
  const entityTypeQP = searchParams.get('entity_type') || 'person';
  const patternQP = searchParams.get('pattern') as FilterKey | null;

  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>(patternQP || 'all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();

    // Map filter key → backend params
    const patternMap: Record<Exclude<FilterKey, 'all' | 'high'>, string> = {
      insider: 'trade_near_vote',
      contract: 'enforcement_gap', // closest contract-level flag; loose map
      lobbying: 'lobbying_spike',
      vote: 'revolving_door',
    };
    if (filter !== 'all' && filter !== 'high') {
      params.set('pattern_type', patternMap[filter]);
    }
    if (filter === 'high') {
      params.set('min_score', '7');
    }
    params.set('limit', '200');

    const url = entityFilter
      ? `${API_BASE}/anomalies/entity/${encodeURIComponent(entityTypeQP)}/${encodeURIComponent(entityFilter)}`
      : `${API_BASE}/anomalies?${params}`;

    setError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: AnomalyResponse) => {
        if (cancelled) return;
        setAnomalies(data.anomalies || []);
        setTotal(data.total || 0);
      })
      .catch((err) => {
        if (cancelled) return;
        // Distinguish "no anomalies" from "couldn't load" so users can
        // tell whether to retry or accept the empty state.
        console.warn('[AnomaliesPage] fetch failed:', err);
        setAnomalies([]);
        setTotal(0);
        setError(err?.message || 'Could not load anomalies');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filter, entityFilter, entityTypeQP]);

  // Derived counts for stat cards
  const stats = useMemo(() => {
    const active = total || anomalies.length;
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const newThisWeek = anomalies.filter((a) => {
      if (!a.detected_at) return false;
      const t = new Date(a.detected_at).getTime();
      return !isNaN(t) && now - t <= weekMs;
    }).length;
    const avgSigma =
      anomalies.length > 0
        ? (
            anomalies.reduce((s, a) => s + sigmaFromScore(a.score), 0) /
            anomalies.length
          ).toFixed(1)
        : '—';
    return {
      active: active.toLocaleString(),
      newThisWeek: newThisWeek.toLocaleString(),
      resolved: '—', // backend doesn't expose resolved count yet
      avgSigma,
    };
  }, [anomalies, total]);

  return (
    <main id="main-content" style={pageShell}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 40px 96px' }}>
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
            Anomaly Feed · Live
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
            What looks unusual.
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
            Statistical deviations ≥1.5σ from sector/cohort medians. Surfaced as
            patterns, not allegations. Each flag links to its methodology and
            primary sources.
          </p>
        </div>

        {/* Stat cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginBottom: 20,
          }}
        >
          {[
            { label: 'Active flags', value: stats.active, color: DRD },
            { label: 'New this week', value: stats.newThisWeek, color: GOLD },
            { label: 'Resolved', value: stats.resolved, color: DGR },
            { label: 'Avg σ', value: stats.avgSigma, color: T1 },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                padding: '14px 18px',
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
                  fontSize: 26,
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

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                style={{
                  padding: '6px 12px',
                  borderRadius: 7,
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
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Results */}
        {loading ? (
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
            Loading flags…
          </div>
        ) : error ? (
          <div
            style={{
              background: SURF,
              border: `1px solid ${B}`,
              borderRadius: 12,
              padding: '80px 24px',
              textAlign: 'center',
              color: 'var(--color-red)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
            }}
          >
            Could not load anomalies: {error}. Refresh the page to try again.
          </div>
        ) : anomalies.length === 0 ? (
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
            No anomalies match the current filter.
          </div>
        ) : (
          <div
            style={{
              background: SURF,
              border: `1px solid ${B}`,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {anomalies.map((a, i) => {
              const sev = severityFromScore(a.score);
              const sevColor = SEV_COLOR[sev];
              const sigma = sigmaFromScore(a.score);
              const conf = Math.round(50 + (a.score / 10) * 50); // 50–100%
              const typeLabel =
                PATTERN_TO_TYPE[a.pattern_type] || a.pattern_type;
              const patternLabel =
                PATTERN_LABELS[a.pattern_type] || a.pattern_type;

              return (
                <Link
                  key={a.id}
                  to={entityRoute(
                    a.entity_type,
                    a.entity_id,
                    a.pattern_type,
                    a.evidence,
                  )}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1.8fr 1fr 90px 80px 40px',
                    padding: '14px 18px',
                    borderBottom:
                      i < anomalies.length - 1 ? `1px solid ${B}` : 'none',
                    gap: 14,
                    alignItems: 'center',
                    cursor: 'pointer',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = SURF2;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      'transparent';
                  }}
                >
                  {/* Severity badge */}
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 10,
                      fontWeight: 700,
                      color: sevColor,
                      background: sevColor + '18',
                      borderRadius: 4,
                      padding: '3px 7px',
                      textAlign: 'center',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {sev}
                  </span>

                  {/* Title + entity */}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 13,
                        fontWeight: 600,
                        color: T1,
                        marginBottom: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={a.title}
                    >
                      {a.title}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 11,
                        color: T3,
                      }}
                    >
                      {(a.entity_name || a.entity_id) + ' · ' + typeLabel}
                    </div>
                  </div>

                  {/* Deviation (σ bar) */}
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 11,
                        color: T3,
                        marginBottom: 3,
                      }}
                    >
                      Deviation
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          fontWeight: 700,
                          color: sevColor,
                        }}
                      >
                        {sigma.toFixed(1)}σ
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 3,
                          background: SURF2,
                          borderRadius: 2,
                        }}
                      >
                        <div
                          style={{
                            height: 3,
                            background: sevColor,
                            width: `${Math.min((sigma / 3) * 100, 100)}%`,
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </div>
                    <span
                      style={{
                        display: 'none',
                      }}
                      title={patternLabel}
                    />
                  </div>

                  {/* Confidence */}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      fontWeight: 700,
                      color: DGR,
                    }}
                  >
                    {conf}%
                  </span>

                  {/* Relative time */}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: T3,
                    }}
                  >
                    {relativeTime(a.detected_at) || '—'}
                  </span>

                  {/* Arrow */}
                  <span
                    style={{
                      color: T3,
                      textAlign: 'right',
                      fontFamily: 'var(--font-body)',
                      fontSize: 16,
                    }}
                  >
                    →
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
