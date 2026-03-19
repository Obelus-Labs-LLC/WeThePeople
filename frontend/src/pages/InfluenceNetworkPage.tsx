import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Search, Share2, ArrowLeft } from 'lucide-react';
import InfluenceGraph from '../components/InfluenceGraph';
import {
  fetchInfluenceNetwork,
  type NetworkNode,
  type NetworkEdge,
  type InfluenceNetworkResponse,
} from '../api/influence';

// ── Search ──

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

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

  const handleSelectEntity = useCallback(
    (result: SearchResult) => {
      setSearchQuery('');
      setSearchResults([]);
      setSearchOpen(false);
      navigate(`/influence/network/${result.type}/${result.id}`);
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
          <div className="relative ml-auto w-72">
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

      {/* Main content */}
      <div className="flex-1 relative">
        {showLanding ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 px-8">
            <Share2 className="w-16 h-16 text-blue-400/40" />
            <h2 className="text-2xl font-bold text-white/80">Influence Network Graph</h2>
            <p className="text-white/40 text-center max-w-lg">
              Explore the web of connections between politicians, companies, lobbying groups, and legislation.
              Search for a person or company above to generate their influence network.
            </p>
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
          />
        )}
      </div>
    </div>
  );
}
