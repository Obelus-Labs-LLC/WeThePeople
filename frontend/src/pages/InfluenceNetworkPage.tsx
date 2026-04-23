import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Search, Share2, ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';
import InfluenceGraph from '../components/InfluenceGraph';
import CanvasErrorBoundary from '../components/CanvasErrorBoundary';
import {
  fetchInfluenceNetwork,
  type InfluenceNetworkResponse,
} from '../api/influence';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

// ── Search ──

interface SearchResult {
  id: string;
  label: string;
  type: string; // 'person' | 'finance' | 'health' | 'tech' | 'energy' | ...
  subtitle?: string;
}

async function searchEntities(q: string): Promise<SearchResult[]> {
  if (!q || q.length < 2) return [];
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&limit=10`);
    if (!res.ok) return [];
    const data = await res.json();

    const results: SearchResult[] = [];
    if (Array.isArray(data.politicians)) {
      for (const p of data.politicians) {
        results.push({
          id: p.person_id,
          label: p.name || p.display_name,
          type: 'person',
          subtitle: [p.party, p.state, p.chamber].filter(Boolean).join(' · '),
        });
      }
    }
    if (Array.isArray(data.companies)) {
      for (const c of data.companies) {
        results.push({
          id: c.entity_id,
          label: c.name || c.display_name,
          type: c.sector || 'company',
          subtitle: c.sector || '',
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ── Edge type palette (design-token aligned) ──

const EDGE_TYPE_OPTIONS: { key: string; label: string; hex: string; token: string }[] = [
  { key: 'donation', label: 'Donations', hex: '#3DB87A', token: 'var(--color-green)' },
  { key: 'lobbying', label: 'Lobbying', hex: '#C5A028', token: 'var(--color-accent-text)' },
  { key: 'trade', label: 'Trades', hex: '#E63946', token: 'var(--color-red)' },
  { key: 'legislation', label: 'Bills', hex: '#4A7FDE', token: 'var(--color-dem)' },
  { key: 'contract', label: 'Contracts', hex: '#B06FD8', token: 'var(--color-ind)' },
];

const EXAMPLES: { label: string; type: string; id: string }[] = [
  { label: 'Nancy Pelosi', type: 'person', id: 'nancy_pelosi' },
  { label: 'Ted Cruz', type: 'person', id: 'ted_cruz' },
  { label: 'JPMorgan Chase', type: 'finance', id: 'jpmorgan' },
  { label: 'Pfizer', type: 'health', id: 'pfizer' },
  { label: 'Alphabet (Google)', type: 'tech', id: 'alphabet' },
  { label: 'ExxonMobil', type: 'energy', id: 'exxonmobil' },
];

// ── Shared styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
  display: 'flex',
  flexDirection: 'column',
};

const topBarStyle: React.CSSProperties = {
  borderBottom: '1px solid rgba(235,229,213,0.08)',
  background: 'rgba(7,9,12,0.85)',
  backdropFilter: 'blur(8px)',
  padding: '14px 24px',
};

const backLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--color-text-2)',
  textDecoration: 'none',
  transition: 'color 0.2s',
};

const titleBlock: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const fieldLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
};

// ── Page ──

export default function InfluenceNetworkPage() {
  const { entityType, entityId } = useParams<{ entityType?: string; entityId?: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<InfluenceNetworkResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [depth, setDepth] = useState(1);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    new Set(EDGE_TYPE_OPTIONS.map((o) => o.key)),
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [timelineYear, setTimelineYear] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [yearRange, setYearRange] = useState<[number, number]>([2020, new Date().getFullYear()]);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!entityType || !entityId) return;
    setLoading(true);
    setError(null);
    fetchInfluenceNetwork(entityType, entityId, depth, 80)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load network'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entityType, entityId, depth]);

  useEffect(() => {
    let cancelled = false;
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchEntities(searchQuery).then((r) => { if (!cancelled) setSearchResults(r); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setSearchOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!data?.edges?.length) return;
    let min = Infinity;
    let max = -Infinity;
    for (const e of data.edges) {
      if (e.year != null) {
        if (e.year < min) min = e.year;
        if (e.year > max) max = e.year;
      }
      if (e.years) {
        for (const y of e.years) {
          if (y < min) min = y;
          if (y > max) max = y;
        }
      }
    }
    if (min !== Infinity && max !== -Infinity) {
      setYearRange([min, max]);
    }
    setTimelineYear(null);
    setIsPlaying(false);
  }, [data]);

  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setTimelineYear((prev) => {
          const current = prev ?? yearRange[0];
          if (current >= yearRange[1]) {
            setIsPlaying(false);
            return current;
          }
          return current + 1;
        });
      }, 1500);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, yearRange]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (timelineYear == null || timelineYear >= yearRange[1]) {
        setTimelineYear(yearRange[0]);
      }
      setIsPlaying(true);
    }
  }, [isPlaying, timelineYear, yearRange]);

  const handleShowAll = useCallback(() => {
    setTimelineYear(null);
    setIsPlaying(false);
  }, []);

  const handleSelectEntity = useCallback(
    (result: SearchResult) => {
      setSearchQuery('');
      setSearchResults([]);
      setSearchOpen(false);
      const typeMap: Record<string, string> = { technology: 'tech' };
      const mappedType = typeMap[result.type] || result.type;
      navigate(`/influence/network/${mappedType}/${result.id}`);
    },
    [navigate],
  );

  const toggleEdgeType = useCallback((key: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const nodes = data?.nodes || [];
  const edges = data?.edges || [];
  const stats = data?.stats;

  const showLanding = !entityType || !entityId;

  return (
    <main id="main-content" style={pageShell}>
      {/* Top bar */}
      <div style={topBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <Link
            to="/influence"
            style={backLink}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            <ArrowLeft size={14} /> Influence Explorer
          </Link>

          <div style={titleBlock}>
            <Share2 size={16} style={{ color: 'var(--color-accent-text)' }} />
            <h1
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--color-text-1)',
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              Influence Network
            </h1>
          </div>

          {/* Search */}
          <div ref={searchContainerRef} style={{ position: 'relative', marginLeft: 'auto', width: '288px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(235,229,213,0.08)',
                background: 'var(--color-surface)',
              }}
            >
              <Search size={14} style={{ color: 'var(--color-text-3)' }} />
              <input
                type="text"
                placeholder="Search person or company…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--color-text-1)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                }}
              />
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  zIndex: 50,
                  borderRadius: '10px',
                  border: '1px solid rgba(235,229,213,0.08)',
                  background: 'var(--color-surface-2)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  maxHeight: '260px',
                  overflowY: 'auto',
                }}
              >
                {searchResults.map((r) => (
                  <button
                    key={`${r.type}:${r.id}`}
                    onClick={() => handleSelectEntity(r)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(235,229,213,0.04)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-text-1)', fontWeight: 500 }}>
                        {r.label}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                        {r.subtitle}
                      </div>
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: 'var(--color-text-3)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        marginLeft: '12px',
                      }}
                    >
                      {r.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {!showLanding && (
          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            {/* Edge type filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={fieldLabel}>Show</span>
              {EDGE_TYPE_OPTIONS.map((opt) => {
                const active = visibleTypes.has(opt.key);
                return (
                  <label
                    key={opt.key}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleEdgeType(opt.key)}
                      style={{ accentColor: opt.hex, width: '12px', height: '12px' }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: active ? opt.token : 'var(--color-text-3)',
                      }}
                    >
                      {opt.label}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Depth toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={fieldLabel}>Depth</span>
              {[1, 2].map((d) => {
                const active = depth === d;
                return (
                  <button
                    key={d}
                    onClick={() => setDepth(d)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: active ? '1px solid rgba(197,160,40,0.33)' : '1px solid transparent',
                      background: active ? 'var(--color-accent-dim)' : 'transparent',
                      color: active ? 'var(--color-accent-text)' : 'var(--color-text-3)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {d} hop{d > 1 ? 's' : ''}
                  </button>
                );
              })}
            </div>

            {stats && (
              <div
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--color-text-3)',
                }}
              >
                {stats.total_nodes} nodes · {stats.total_edges} connections
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timeline playback bar */}
      {!showLanding && nodes.length > 0 && (
        <div
          style={{
            borderBottom: '1px solid rgba(235,229,213,0.08)',
            background: 'var(--color-surface)',
            padding: '12px 24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={handlePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '1px solid rgba(235,229,213,0.08)',
                background: isPlaying ? 'rgba(61,184,122,0.12)' : 'var(--color-surface-2)',
                color: isPlaying ? 'var(--color-green)' : 'var(--color-text-2)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: '2px' }} />}
            </button>

            <div style={{ minWidth: '72px', textAlign: 'center' }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  fontWeight: 900,
                  fontSize: '24px',
                  color: 'var(--color-text-1)',
                  fontVariantNumeric: 'tabular-nums',
                  opacity: isPlaying ? 0.85 : 1,
                }}
              >
                {timelineYear ?? '—'}
              </span>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                {yearRange[0]}
              </span>
              <input
                type="range"
                min={yearRange[0]}
                max={yearRange[1]}
                value={timelineYear ?? yearRange[0]}
                onChange={(e) => {
                  setTimelineYear(Number(e.target.value));
                  setIsPlaying(false);
                }}
                style={{
                  flex: 1,
                  accentColor: 'var(--color-accent)',
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                {yearRange[1]}
              </span>
            </div>

            <button
              onClick={handleShowAll}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: timelineYear == null ? '1px solid rgba(197,160,40,0.33)' : '1px solid rgba(235,229,213,0.08)',
                background: timelineYear == null ? 'var(--color-accent-dim)' : 'transparent',
                color: timelineYear == null ? 'var(--color-accent-text)' : 'var(--color-text-3)',
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <RotateCcw size={12} /> Show All
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, position: 'relative' }}>
        {showLanding ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '60vh',
              gap: '20px',
              padding: '48px 24px',
            }}
          >
            <Share2 size={56} style={{ color: 'var(--color-accent-text)', opacity: 0.4 }} />
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: 'clamp(32px, 5vw, 52px)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                margin: 0,
                color: 'var(--color-text-1)',
                textAlign: 'center',
              }}
            >
              Influence <span style={{ color: 'var(--color-accent-text)' }}>network</span> graph
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '15px',
                lineHeight: 1.6,
                color: 'var(--color-text-2)',
                textAlign: 'center',
                maxWidth: '560px',
                margin: 0,
              }}
            >
              Explore the web of connections between politicians, companies, lobbying groups, and
              legislation. Search for a person or company above, or try one of the examples below.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px', marginTop: '8px' }}>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => navigate(`/influence/network/${ex.type}/${ex.id}`)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: '1px solid rgba(235,229,213,0.08)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-2)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(197,160,40,0.33)';
                    e.currentTarget.style.background = 'var(--color-accent-dim)';
                    e.currentTarget.style.color = 'var(--color-accent-text)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)';
                    e.currentTarget.style.background = 'var(--color-surface)';
                    e.currentTarget.style.color = 'var(--color-text-2)';
                  }}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        ) : loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '60vh',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
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
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-text-3)' }}>
                Building network graph…
              </span>
            </div>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-red)', margin: '0 0 8px' }}>
                {error}
              </p>
              <button
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  fetchInfluenceNetwork(entityType!, entityId!, depth, 80)
                    .then(setData)
                    .catch((err) => setError(err.message))
                    .finally(() => setLoading(false));
                }}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  color: 'var(--color-accent-text)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Retry
              </button>
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-text-2)', margin: 0 }}>
                No connections found for this entity.
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-text-3)', marginTop: '4px' }}>
                This entity may not have donation, lobbying, or trade data yet.
              </p>
            </div>
          </div>
        ) : (
          <CanvasErrorBoundary fallbackHeight="500px">
            <InfluenceGraph
              nodes={nodes}
              edges={edges}
              visibleEdgeTypes={visibleTypes}
              timelineYear={timelineYear}
            />
          </CanvasErrorBoundary>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
