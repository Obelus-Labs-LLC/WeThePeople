import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Filter, ArrowLeft, ExternalLink } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

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
  trade_near_vote: 'Trade Near Vote',
  lobbying_spike: 'Lobbying Spike',
  enforcement_gap: 'Enforcement Gap',
  revolving_door: 'Revolving Door',
};

const PATTERN_COLORS: Record<string, string> = {
  trade_near_vote: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  lobbying_spike: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  enforcement_gap: 'bg-red-500/10 text-red-400 border-red-500/30',
  revolving_door: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};

function scoreColor(score: number): string {
  if (score >= 8) return 'bg-red-500';
  if (score >= 6) return 'bg-orange-500';
  if (score >= 4) return 'bg-amber-500';
  return 'bg-slate-500';
}

function scoreTextColor(score: number): string {
  if (score >= 8) return 'text-red-400';
  if (score >= 6) return 'text-orange-400';
  if (score >= 4) return 'text-amber-400';
  return 'text-slate-400';
}

function entityRoute(entityType: string, entityId: string, patternType: string, evidence: Record<string, unknown> | null): string {
  if (entityType === 'person') return `/politics/people/${entityId}`;
  const sector = evidence?.sector as string | undefined;
  if (sector === 'finance') return `/finance/${entityId}`;
  if (sector === 'health') return `/health/${entityId}`;
  if (sector === 'tech') return `/technology/${entityId}`;
  if (sector === 'energy') return `/energy/${entityId}`;
  return `/`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PATTERNS = ['all', 'trade_near_vote', 'lobbying_spike', 'enforcement_gap', 'revolving_door'] as const;
const MIN_SCORES = [0, 3, 5, 7, 8] as const;

export default function AnomaliesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPattern = searchParams.get('pattern') || 'all';
  const initialEntity = searchParams.get('entity_id') || '';

  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [patternFilter, setPatternFilter] = useState<string>(initialPattern);
  const [minScore, setMinScore] = useState<number>(0);
  const [entityFilter] = useState<string>(initialEntity);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (patternFilter && patternFilter !== 'all') params.set('pattern_type', patternFilter);
    if (minScore > 0) params.set('min_score', String(minScore));
    params.set('limit', '100');

    let url: string;
    if (entityFilter) {
      // Entity-specific view
      const entityType = searchParams.get('entity_type') || 'person';
      url = `${API_BASE}/anomalies/entity/${entityType}/${entityFilter}`;
    } else {
      url = `${API_BASE}/anomalies?${params}`;
    }

    fetch(url)
      .then((r) => r.json())
      .then((data: AnomalyResponse) => {
        setAnomalies(data.anomalies || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        setAnomalies([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [patternFilter, minScore, entityFilter, searchParams]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-[1200px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Navigation */}
        <Link to="/influence" className="text-white/40 hover:text-white/70 text-sm mb-6 inline-block no-underline">
          <ArrowLeft className="w-4 h-4 inline mr-1 -mt-0.5" />
          Back to Influence Explorer
        </Link>

        {/* Hero */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <h1 className="text-4xl font-bold text-white">Suspicious Patterns</h1>
          </div>
          <p className="text-white/50 max-w-2xl">
            Automatically detected correlations between money and political action.
            Higher scores indicate more suspicious patterns.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <Filter className="w-4 h-4 text-white/40" />
          {PATTERNS.map((p) => (
            <button
              key={p}
              onClick={() => setPatternFilter(p)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                patternFilter === p
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                  : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20'
              }`}
            >
              {p === 'all' ? 'All' : PATTERN_LABELS[p]}
            </button>
          ))}
          <span className="text-white/20 mx-2">|</span>
          <span className="text-xs text-white/40">Min Score:</span>
          {MIN_SCORES.map((s) => (
            <button
              key={s}
              onClick={() => setMinScore(s)}
              className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                minScore === s
                  ? 'bg-white/10 text-white border-white/20'
                  : 'bg-white/5 text-white/40 border-white/10 hover:border-white/15'
              }`}
            >
              {s === 0 ? 'Any' : `${s}+`}
            </button>
          ))}
        </div>

        {/* Count */}
        <div className="text-xs text-white/30 mb-4 font-mono">
          {total} anomalies found
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          </div>
        ) : anomalies.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            No anomalies found matching your filters.
          </div>
        ) : (
          <div className="space-y-3">
            {anomalies.map((a) => (
              <Link
                key={a.id}
                to={entityRoute(a.entity_type, a.entity_id, a.pattern_type, a.evidence)}
                className="block rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-white/10 hover:bg-white/[0.04] transition-all no-underline group"
              >
                <div className="flex items-start gap-4">
                  {/* Score badge */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${scoreColor(a.score)} text-white font-bold text-lg`}>
                      {a.score.toFixed(0)}
                    </div>
                    <span className={`text-[10px] mt-1 ${scoreTextColor(a.score)} font-mono`}>
                      /10
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${PATTERN_COLORS[a.pattern_type] || 'bg-white/5 text-white/40 border-white/10'}`}>
                        {PATTERN_LABELS[a.pattern_type] || a.pattern_type}
                      </span>
                      <span className="text-[10px] text-white/20 font-mono">
                        {formatDate(a.detected_at)}
                      </span>
                    </div>
                    <h2 className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors mb-1">
                      {a.title}
                    </h2>
                    {a.description && (
                      <p className="text-xs text-white/40 line-clamp-2">
                        {a.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-white/30 font-mono">
                        {a.entity_name || a.entity_id}
                      </span>
                      <ExternalLink className="w-3 h-3 text-white/20 group-hover:text-white/40" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
