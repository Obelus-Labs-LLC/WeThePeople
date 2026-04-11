import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Search, Share2, ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';
import InfluenceGraph from '../components/InfluenceGraph';
import {
  fetchInfluenceNetwork,
  type NetworkNode,
  type NetworkEdge,
  type InfluenceNetworkResponse,
} from '../api/influence';

// ── Search ──

import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

interface SearchResult {
  id: string;
  label: string;
  type: string;       // 'person' | 'finance' | 'health' | 'tech' | 'energy'
  subtitle?: string;
}

async function searchEntities(q: string): Promise<SearchResult[]> {
  if (!q || q.length < 2) return [];
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&limit=10`);
    if (!res.ok) return [];
    const data = await res.json();

    // The /search endpoint returns { politicians: [...], companies: [...], query }
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

// ── Edge type labels ──

const EDGE_TYPE_OPTIONS = [
  { key: 'donation', label: 'Donations', color: '#10B981' },
  { key: 'lobbying', label: 'Lobbying', color: '#F59E0B' },
  { key: 'trade', label: 'Trades', color: '#EF4444' },
  { key: 'legislation', label: 'Bills', color: '#3B82F6' },
  { key: 'contract', label: 'Contracts', color: '#6366F1' },
];

// ── Page ──

export default function InfluenceNetworkPage() {
  const { entityType, entityId } = useParams<{ entityType?: string; entityId?: string }>();
  const navigate = useNavigate();

  // Network data
  const [data, setData] = useState<InfluenceNetworkResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Controls
  const [depth, setDepth] = useState(1);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    new Set(EDGE_TYPE_OPTIONS.map((o) => o.key)),
  );

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Timeline playback
  const [timelineYear, setTimelineYear] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [yearRange, setYearRange] = useState<[number, number]>([2020, new Date().getFullYear()]);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load network
  useEffect(() => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setError(null);
    fetchInfluenceNetwork(entityType, entityId, depth, 80)
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load network'))
      .finally(() => setLoading(false));
  }, [entityType, entityId, depth]);

  // Search debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchEntities(searchQuery).then(setSearchResults);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close search dropdown on click outside or Escape
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

  // Compute year range from edge data
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
    // Reset timeline state when data changes
    setTimelineYear(null);
    setIsPlaying(false);
  }, [data]);

  // Playback interval
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
      // If at end or no year selected, start from beginning
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
      // Map search result types to influence network entity types
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

  // If no entity specified, show search landing
  const showLanding = !entityType || !entityId;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="border-b border-white/10 bg-slate-950/80 backdrop-blur-sm px-6 py-4 lg:px-12">
        <div className="flex items-center gap-4 flex-wrap">
          <Link
            to="/influence"
            className="text-white/40 hover:text-white/70 flex items-center gap-1.5 text-sm no-underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Influence Explorer
          </Link>

          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-bold text-white">Influence Network</h1>
          </div>

          {/* Entity search */}
          <div ref={searchContainerRef} className="relative ml-auto w-72">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <Search className="w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Search person or company..."
                className="bg-transparent text-sm text-white placeholder-white/30 outline-none w-full"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
              />
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-white/10 bg-slate-900 shadow-xl max-h-64 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={`${r.type}:${r.id}`}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors flex items-center justify-between"
                    onClick={() => handleSelectEntity(r)}
                  >
                    <div>
                      <div className="text-sm text-white font-medium">{r.label}</div>
                      <div className="text-xs text-white/40">{r.subtitle}</div>
                    </div>
                    <span className="text-[10px] uppercase font-mono text-white/30">{r.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Controls row */}
        {!showLanding && (
          <div className="mt-3 flex items-center gap-6 flex-wrap">
            {/* Edge type filters */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/40 uppercase tracking-wider">Show:</span>
              {EDGE_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-center gap-1.5 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={visibleTypes.has(opt.key)}
                    onChange={() => toggleEdgeType(opt.key)}
                    className="accent-blue-500 w-3 h-3"
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: visibleTypes.has(opt.key) ? opt.color : 'rgba(255,255,255,0.3)' }}
                  >
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>

            {/* Depth toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40 uppercase tracking-wider">Depth:</span>
              <button
                className={`px-2.5 py-1 rounded text-xs font-mono ${depth === 1 ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'text-white/40 hover:text-white/60'}`}
                onClick={() => setDepth(1)}
              >
                1 hop
              </button>
              <button
                className={`px-2.5 py-1 rounded text-xs font-mono ${depth === 2 ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'text-white/40 hover:text-white/60'}`}
                onClick={() => setDepth(2)}
              >
                2 hops
              </button>
            </div>

            {/* Stats */}
            {stats && (
              <div className="ml-auto text-xs text-white/30 font-mono">
                {stats.total_nodes} nodes &middot; {stats.total_edges} connections
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timeline playback bar */}
      {!showLanding && nodes.length > 0 && (
        <div className="border-b border-white/10 bg-zinc-900/90 backdrop-blur-sm px-6 py-3 lg:px-12">
          <div className="flex items-center gap-4">
            {/* Play/Pause button */}
            <button
              onClick={handlePlayPause}
              className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
                isPlaying
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-zinc-700 text-white/70 hover:bg-zinc-600 hover:text-white'
              }`}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            {/* Year display */}
            <div className="min-w-[4rem] text-center">
              <span
                className={`text-2xl font-bold text-white tabular-nums ${
                  isPlaying ? 'animate-pulse' : ''
                }`}
              >
                {timelineYear ?? '—'}
              </span>
            </div>

            {/* Range slider */}
            <div className="flex-1 flex items-center gap-3">
              <span className="text-xs text-white/40 font-mono">{yearRange[0]}</span>
              <input
                type="range"
                min={yearRange[0]}
                max={yearRange[1]}
                value={timelineYear ?? yearRange[0]}
                onChange={(e) => {
                  setTimelineYear(Number(e.target.value));
                  setIsPlaying(false);
                }}
                className="flex-1 h-1.5 appearance-none rounded-full bg-zinc-700 cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400
                  [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(16,185,129,0.5)] [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-emerald-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              />
              <span className="text-xs text-white/40 font-mono">{yearRange[1]}</span>
            </div>

            {/* Show All button */}
            <button
              onClick={handleShowAll}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                timelineYear == null
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'text-white/50 hover:text-white/80 border border-zinc-700 hover:border-zinc-500'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              Show All
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 relative">
        {showLanding ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 px-8">
            <Share2 className="w-16 h-16 text-blue-400/40" />
            <h2 className="text-2xl font-bold text-white/80">Influence Network Graph</h2>
            <p className="text-white/40 text-center max-w-lg">
              Explore the web of connections between politicians, companies, lobbying groups, and legislation.
              Search for a person or company above, or try one of the examples below.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {[
                { label: 'Nancy Pelosi', type: 'person', id: 'nancy_pelosi' },
                { label: 'Ted Cruz', type: 'person', id: 'ted_cruz' },
                { label: 'JPMorgan Chase', type: 'finance', id: 'jpmorgan' },
                { label: 'Pfizer', type: 'health', id: 'pfizer' },
                { label: 'Alphabet (Google)', type: 'tech', id: 'alphabet' },
                { label: 'ExxonMobil', type: 'energy', id: 'exxonmobil' },
              ].map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => navigate(`/influence/network/${ex.type}/${ex.id}`)}
                  className="px-4 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-white/60 hover:text-white hover:border-blue-500/40 hover:bg-blue-500/10 transition-all"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full min-h-[60vh]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span className="text-sm text-white/40">Building network graph...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full min-h-[60vh]">
            <div className="text-center">
              <p className="text-red-400 text-sm mb-2">{error}</p>
              <button
                className="text-xs text-blue-400 hover:underline"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  fetchInfluenceNetwork(entityType!, entityId!, depth, 80)
                    .then(setData)
                    .catch((err) => setError(err.message))
                    .finally(() => setLoading(false));
                }}
              >
                Retry
              </button>
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[60vh]">
            <div className="text-center">
              <p className="text-white/40 text-sm">No connections found for this entity.</p>
              <p className="text-white/25 text-xs mt-1">
                This entity may not have donation, lobbying, or trade data yet.
              </p>
            </div>
          </div>
        ) : (
          <InfluenceGraph
            nodes={nodes}
            edges={edges}
            visibleEdgeTypes={visibleTypes}
            timelineYear={timelineYear}
          />
        )}
      </div>
    </div>
  );
}
