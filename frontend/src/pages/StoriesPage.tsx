import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Newspaper, ArrowRight, Filter, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import SpotlightCard from '../components/SpotlightCard';
import { getApiBaseUrl } from '../api/client';

interface Story {
  id: number;
  title: string;
  slug: string;
  summary: string;
  category: string;
  sector: string | null;
  entity_ids: string[];
  evidence: Record<string, unknown>;
  status: string;
  published_at: string | null;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  lobbying_spike: 'Lobbying Spike',
  contract_windfall: 'Contract Windfall',
  enforcement_gap: 'Enforcement Gap',
  trade_cluster: 'Trade Cluster',
  cross_sector: 'Cross-Sector',
  regulatory_influence: 'Regulatory Influence',
  it_failure: 'IT Failure',
};

const CATEGORY_COLORS: Record<string, string> = {
  lobbying_spike: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  contract_windfall: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  enforcement_gap: 'bg-red-500/10 border-red-500/20 text-red-400',
  trade_cluster: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  cross_sector: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  regulatory_influence: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
  it_failure: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

const SECTOR_OPTIONS = [
  { value: '', label: 'All Sectors' },
  { value: 'politics', label: 'Politics' },
  { value: 'finance', label: 'Finance' },
  { value: 'health', label: 'Health' },
  { value: 'tech', label: 'Technology' },
  { value: 'energy', label: 'Energy' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'defense', label: 'Defense' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [sector, setSector] = useState('');
  const [category, setCategory] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 12;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (sector) params.set('sector', sector);
    if (category) params.set('category', category);

    fetch(`${getApiBaseUrl()}/stories/?${params}`)
      .then((r) => r.ok ? r.json() : { stories: [], total: 0 })
      .then((d) => {
        setStories(d.stories || []);
        setTotal(d.total || 0);
      })
      .catch(() => setStories([]))
      .finally(() => setLoading(false));
  }, [sector, category, offset]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-6 shadow-lg shadow-blue-600/30">
            <Newspaper className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold mb-4">Stories</h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto">
            Real patterns of influence uncovered in government data.
            Every claim backed by public records.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <Filter className="w-4 h-4 text-white/40" />
          <select
            value={sector}
            onChange={(e) => { setSector(e.target.value); setOffset(0); }}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
          >
            {SECTOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setOffset(0); }}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
          >
            <option value="" className="bg-slate-900">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k} className="bg-slate-900">{v}</option>
            ))}
          </select>
          <span className="text-xs text-white/30 ml-auto">{total} stories</span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {/* Empty state */}
        {!loading && stories.length === 0 && (
          <div className="text-center py-20">
            <Newspaper className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/40">No stories yet. Check back soon.</p>
          </div>
        )}

        {/* Story Grid */}
        {!loading && stories.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stories.map((story, idx) => (
              <motion.div
                key={story.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
              >
                <Link to={`/stories/${story.slug}`} className="no-underline block">
                  <SpotlightCard className="rounded-xl border border-white/5 p-6 h-full transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04]">
                    {/* Category badge */}
                    <span className={`inline-block rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider mb-3 ${CATEGORY_COLORS[story.category] || 'bg-white/5 border-white/10 text-white/40'}`}>
                      {CATEGORY_LABELS[story.category] || story.category}
                    </span>

                    {/* Sector tag */}
                    {story.sector && (
                      <span className="inline-block ml-2 rounded-full bg-white/5 px-2 py-1 text-[10px] text-white/30 uppercase">
                        {story.sector}
                      </span>
                    )}

                    {/* Title */}
                    <h3 className="font-semibold text-white text-lg leading-snug mb-2 mt-2 group-hover:text-blue-400 transition-colors">
                      {story.title}
                    </h3>

                    {/* Summary */}
                    <p className="text-sm text-white/60 leading-relaxed mb-4">
                      {story.summary}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-white/5">
                      <span className="text-[10px] text-white/20">{fmtDate(story.published_at)}</span>
                      <ArrowRight className="w-4 h-4 text-white/20" />
                    </div>
                  </SpotlightCard>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex justify-center gap-4 mt-8">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/60 disabled:opacity-30 hover:bg-white/10 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= total}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/60 disabled:opacity-30 hover:bg-white/10 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
