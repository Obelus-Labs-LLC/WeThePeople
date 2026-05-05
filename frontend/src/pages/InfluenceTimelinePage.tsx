import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, Calendar } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  category: 'lobbying' | 'contract' | 'enforcement' | 'trade' | 'donation' | 'vote' | 'bill';
  source_url?: string;
  amount?: number;
  entity_name?: string;
}

// ── Category palette (token + hex pair for alpha interpolation) ──

const CATEGORY_TOKEN: Record<string, { token: string; hex: string; label: string }> = {
  lobbying: { token: 'var(--color-accent-text)', hex: '#C5A028', label: 'Lobbying' },
  contract: { token: 'var(--color-green)', hex: '#3DB87A', label: 'Contract' },
  enforcement: { token: 'var(--color-red)', hex: '#E63946', label: 'Enforcement' },
  trade: { token: 'var(--color-dem)', hex: '#4A7FDE', label: 'Trade' },
  donation: { token: 'var(--color-ind)', hex: '#B06FD8', label: 'Donation' },
  vote: { token: 'var(--color-accent-text)', hex: '#D4AE35', label: 'Vote' },
  bill: { token: 'var(--color-dem)', hex: '#6B95E8', label: 'Bill' },
};

// Person IDs use the canonical person_id slug ("nancy_pelosi"), not
// the short last-name form ("pelosi") — `/people/pelosi` 404s and
// `/influence/network?entity_type=person&entity_id=pelosi` returns
// an empty graph. Same applies to the energy entry: the populated
// dataset is keyed under `exxonmobil`, not `exxon-mobil`.
const EXAMPLES: { type: string; id: string; name: string }[] = [
  { type: 'person', id: 'nancy_pelosi', name: 'Nancy Pelosi' },
  { type: 'person', id: 'ted_cruz', name: 'Ted Cruz' },
  { type: 'finance', id: 'jpmorgan', name: 'JPMorgan Chase' },
  { type: 'tech', id: 'alphabet', name: 'Alphabet' },
  { type: 'energy', id: 'exxonmobil', name: 'ExxonMobil' },
  { type: 'health', id: 'pfizer', name: 'Pfizer' },
];

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ── Shared styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: '900px',
  margin: '0 auto',
  padding: '56px 24px 96px',
};

const backLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--color-text-2)',
  textDecoration: 'none',
  marginBottom: '20px',
  transition: 'color 0.2s',
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 12px',
  borderRadius: '999px',
  background: 'var(--color-accent-dim)',
  color: 'var(--color-accent-text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '20px',
};

// ── Page ──

export default function InfluenceTimelinePage() {
  const [searchParams] = useSearchParams();
  const entityType = searchParams.get('type') || 'person';
  const entityId = searchParams.get('id') || '';
  const entityName = searchParams.get('name') || entityId;

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    if (!entityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      entity_type: entityType,
      entity_id: entityId,
      depth: '1',
      limit: '100',
    });
    fetch(`${API_BASE}/influence/network?${params}`)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        const timelineEvents: TimelineEvent[] = [];
        for (const edge of data.edges || []) {
          if (edge.type === 'donation' && edge.year) {
            timelineEvents.push({
              date: `${edge.year}-01-01`,
              title: `PAC Donation: ${edge.label || ''}`,
              description: `${edge.source_name} donated to ${edge.target_name}`,
              category: 'donation',
              amount: edge.amount,
              entity_name: edge.source_name || edge.target_name,
            });
          } else if (edge.type === 'lobbying' && edge.year) {
            timelineEvents.push({
              date: `${edge.year}-06-01`,
              title: `Lobbying: ${edge.label || 'Filing'}`,
              description: `${edge.source_name} lobbied on behalf of ${edge.target_name}`,
              category: 'lobbying',
              amount: edge.amount,
              entity_name: edge.source_name,
            });
          } else if (edge.type === 'trade' && edge.year) {
            timelineEvents.push({
              date: `${edge.year}-03-01`,
              title: `Stock Trade: ${edge.label || ''}`,
              description: `${edge.source_name} traded stocks`,
              category: 'trade',
              amount: edge.amount,
              entity_name: edge.source_name,
            });
          } else if (edge.type === 'legislation' && edge.year) {
            timelineEvents.push({
              date: `${edge.year}-01-01`,
              title: `Bill: ${edge.label || ''}`,
              description: `${edge.source_name} sponsored legislation`,
              category: 'bill',
              entity_name: edge.source_name,
            });
          } else if (edge.type === 'contract' && edge.year) {
            timelineEvents.push({
              date: `${edge.year}-01-01`,
              title: `Contract: ${edge.label || ''}`,
              description: `${edge.source_name} awarded contract to ${edge.target_name}`,
              category: 'contract',
              amount: edge.amount,
              entity_name: edge.target_name,
            });
          }
        }
        timelineEvents.sort((a, b) => b.date.localeCompare(a.date));
        setEvents(timelineEvents);
      })
      .catch((err) => { console.warn('[InfluenceTimelinePage] fetch failed:', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  const filteredEvents =
    filterCategory === 'all' ? events : events.filter((e) => e.category === filterCategory);

  const byYear: Record<string, TimelineEvent[]> = {};
  for (const e of filteredEvents) {
    const year = e.date.substring(0, 4);
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(e);
  }
  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  return (
    <main id="main-content" style={pageShell}>
      <div style={contentWrap}>
        <Link
          to="/influence"
          style={backLink}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
        >
          <ArrowLeft size={14} /> Influence Explorer
        </Link>

        <span style={eyebrowStyle}>Influence / Timeline</span>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(36px, 5.5vw, 56px)',
            lineHeight: 1.02,
            letterSpacing: '-0.02em',
            margin: '0 0 14px',
            color: 'var(--color-text-1)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            flexWrap: 'wrap',
          }}
        >
          <Clock size={32} style={{ color: 'var(--color-accent-text)' }} />
          <span>
            Influence <span style={{ color: 'var(--color-accent-text)' }}>timeline</span>
          </span>
        </h1>

        {entityId ? (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              lineHeight: 1.6,
              color: 'var(--color-text-2)',
              margin: '0 0 32px',
            }}
          >
            Chronological history of lobbying, donations, trades, and legislation for{' '}
            <span style={{ color: 'var(--color-text-1)', fontWeight: 600 }}>{entityName}</span>.
          </p>
        ) : (
          <div
            style={{
              marginTop: '32px',
              textAlign: 'center',
              padding: '64px 24px',
              background: 'var(--color-surface)',
              border: '1px solid rgba(235,229,213,0.08)',
              borderRadius: '16px',
            }}
          >
            <Calendar size={40} style={{ color: 'var(--color-text-3)', margin: '0 auto 16px', display: 'block' }} />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '15px',
                color: 'var(--color-text-2)',
                margin: '0 0 20px',
              }}
            >
              Select an entity to view their influence timeline
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px' }}>
              {EXAMPLES.map((e) => (
                <Link
                  key={e.id}
                  to={`/influence/timeline?type=${e.type}&id=${e.id}&name=${encodeURIComponent(e.name)}`}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: '1px solid rgba(235,229,213,0.08)',
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text-2)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    fontWeight: 500,
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(el) => {
                    el.currentTarget.style.borderColor = 'rgba(197,160,40,0.33)';
                    el.currentTarget.style.background = 'var(--color-accent-dim)';
                    el.currentTarget.style.color = 'var(--color-accent-text)';
                  }}
                  onMouseLeave={(el) => {
                    el.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)';
                    el.currentTarget.style.background = 'var(--color-surface-2)';
                    el.currentTarget.style.color = 'var(--color-text-2)';
                  }}
                >
                  {e.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {entityId && (
          <>
            {/* Category filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
              <button
                onClick={() => setFilterCategory('all')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  border:
                    filterCategory === 'all'
                      ? '1px solid rgba(197,160,40,0.33)'
                      : '1px solid rgba(235,229,213,0.08)',
                  background:
                    filterCategory === 'all' ? 'var(--color-accent-dim)' : 'var(--color-surface)',
                  color:
                    filterCategory === 'all' ? 'var(--color-accent-text)' : 'var(--color-text-3)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                All ({events.length})
              </button>
              {Object.entries(CATEGORY_TOKEN).map(([cat, cfg]) => {
                const count = events.filter((e) => e.category === cat).length;
                if (count === 0) return null;
                const active = filterCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '999px',
                      border: active ? `1px solid ${cfg.hex}33` : '1px solid rgba(235,229,213,0.08)',
                      background: active ? `${cfg.hex}1F` : 'var(--color-surface)',
                      color: active ? cfg.token : 'var(--color-text-3)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {cfg.label} ({count})
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
                <div
                  role="status"
                  style={{
                    width: '32px',
                    height: '32px',
                    border: '2px solid var(--color-accent)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                >
                  <span style={{ position: 'absolute', left: '-9999px' }}>Loading…</span>
                </div>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 24px' }}>
                <Clock size={40} style={{ color: 'var(--color-text-3)', margin: '0 auto 16px', display: 'block', opacity: 0.4 }} />
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-text-3)', margin: 0 }}>
                  No timeline events found for this entity.
                </p>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                {/* Vertical timeline line */}
                <div
                  style={{
                    position: 'absolute',
                    left: '19px',
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    background: 'rgba(235,229,213,0.1)',
                  }}
                />

                {years.map((year) => (
                  <div key={year} style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: 'var(--color-accent-dim)',
                          border: '2px solid rgba(197,160,40,0.33)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          zIndex: 2,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'var(--color-accent-text)',
                          }}
                        >
                          {year}
                        </span>
                      </div>
                    </div>

                    {byYear[year].map((event, i) => {
                      const cfg = CATEGORY_TOKEN[event.category] || CATEGORY_TOKEN.lobbying;
                      return (
                        <div key={i} style={{ marginLeft: '48px', marginBottom: '10px' }}>
                          <div
                            style={{
                              background: 'var(--color-surface)',
                              border: '1px solid rgba(235,229,213,0.08)',
                              borderRadius: '12px',
                              padding: '14px 16px',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--color-surface-2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'var(--color-surface)';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      background: `${cfg.hex}1F`,
                                      color: cfg.token,
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      letterSpacing: '0.08em',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    {cfg.label}
                                  </span>
                                  <span
                                    style={{
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '11px',
                                      color: 'var(--color-text-3)',
                                    }}
                                  >
                                    {formatDate(event.date)}
                                  </span>
                                </div>
                                <p
                                  style={{
                                    fontFamily: 'var(--font-body)',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'var(--color-text-1)',
                                    margin: 0,
                                  }}
                                >
                                  {event.title}
                                </p>
                                <p
                                  style={{
                                    fontFamily: 'var(--font-body)',
                                    fontSize: '12px',
                                    color: 'var(--color-text-2)',
                                    margin: '4px 0 0',
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {event.description}
                                </p>
                              </div>
                              {event.amount != null && event.amount > 0 && (
                                <span
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    color: 'var(--color-text-1)',
                                    flexShrink: 0,
                                  }}
                                >
                                  {formatMoney(event.amount)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
