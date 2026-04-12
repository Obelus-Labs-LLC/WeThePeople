import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Newspaper, ArrowRight, Filter, Clock, Bell } from 'lucide-react';
import { motion } from 'framer-motion';
import SpotlightCard from '../components/SpotlightCard';
import { getApiBaseUrl } from '../api/client';

interface Story {
  id: number;
  title: string;
  slug: string;
  summary: string;
  body?: string;
  category: string;
  sector: string | null;
  entity_ids: string[];
  data_sources?: string[];
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

const SECTOR_COLORS: Record<string, string> = {
  politics: 'text-blue-400',
  finance: 'text-green-400',
  health: 'text-pink-400',
  tech: 'text-emerald-400',
  energy: 'text-yellow-400',
  transportation: 'text-cyan-400',
  defense: 'text-orange-400',
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

function estimateReadTime(summary: string, body?: string): string {
  const text = (summary || '') + (body || '');
  const words = text.split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
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
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (sector) params.set('sector', sector);
    if (category) params.set('category', category);

    fetch(`${getApiBaseUrl()}/stories/?${params}`)
      .then((r) => r.ok ? r.json() : { stories: [], total: 0 })
      .then((d) => {
        if (cancelled) return;
        setStories(d.stories || []);
        setTotal(d.total || 0);
      })
      .catch(() => setStories([]))
      .finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, [sector, category, offset]);

  const featured = stories.length > 0 ? stories[0] : null;
  const rest = stories.length > 1 ? stories.slice(1) : [];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12">
        {/* Masthead */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 mb-2 font-mono">WeThePeople Research</p>
              <h1 className="font-['Oswald',_sans-serif] text-4xl sm:text-5xl font-bold tracking-tight">The Influence Journal</h1>
            </div>
            <Link
              to="/digest"
              className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-medium text-white no-underline transition-colors"
            >
              <Bell className="w-4 h-4" />
              Subscribe
            </Link>
          </div>
          <div className="border-t border-white/10 pt-4">
            <p className="text-white/50 text-sm sm:text-base leading-relaxed max-w-2xl">
              Data-driven investigations into corporate influence on American politics.
              Every story is sourced from public government records.
            </p>
          </div>
          {/* Mobile subscribe */}
          <Link
            to="/digest"
            className="sm:hidden mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-medium text-white no-underline transition-colors"
          >
            <Bell className="w-4 h-4" />
            Subscribe to Weekly Digest
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-8 pb-6 border-b border-white/5">
          <Filter className="w-4 h-4 text-white/30" />
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
          <span className="text-xs text-white/30 ml-auto font-mono">{total} stories</span>
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

        {/* Featured Story */}
        {!loading && featured && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10"
          >
            <Link to={`/stories/${featured.slug}`} className="no-underline block group">
              <SpotlightCard className="rounded-xl border border-white/5 p-8 sm:p-10 transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04]">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className={`inline-block rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${CATEGORY_COLORS[featured.category] || 'bg-white/5 border-white/10 text-white/40'}`}>
                    {CATEGORY_LABELS[featured.category] || featured.category}
                  </span>
                  {featured.sector && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${SECTOR_COLORS[featured.sector] || 'text-white/30'}`}>
                      {featured.sector}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] text-white/25">
                    <Clock className="w-3 h-3" />
                    {estimateReadTime(featured.summary, featured.body)}
                  </span>
                </div>

                <h2 className="font-['Oswald',_sans-serif] text-2xl sm:text-3xl font-bold leading-tight mb-3 group-hover:text-blue-400 transition-colors">
                  {featured.title}
                </h2>

                <p className="text-white/50 text-base leading-relaxed mb-5 max-w-3xl">
                  {featured.summary}
                </p>

                <div className="flex items-center gap-4">
                  <span className="text-xs text-white/20 font-mono">{fmtDate(featured.published_at)}</span>
                  {featured.data_sources && featured.data_sources.length > 0 && (
                    <span className="text-[10px] text-white/20">
                      {featured.data_sources.length} cited source{featured.data_sources.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <ArrowRight className="w-4 h-4 text-blue-400/50 ml-auto group-hover:translate-x-1 transition-transform" />
                </div>
              </SpotlightCard>
            </Link>
          </motion.div>
        )}

        {/* Remaining Stories - 2 column grid */}
        {!loading && rest.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {rest.map((story, idx) => (
              <motion.div
                key={story.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
              >
                <Link to={`/stories/${story.slug}`} className="no-underline block group">
                  <SpotlightCard className="rounded-xl border border-white/5 p-6 h-full transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04]">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CATEGORY_COLORS[story.category] || 'bg-white/5 border-white/10 text-white/40'}`}>
                        {CATEGORY_LABELS[story.category] || story.category}
                      </span>
                      {story.sector && (
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${SECTOR_COLORS[story.sector] || 'text-white/30'}`}>
                          {story.sector}
                        </span>
                      )}
                    </div>

                    <h3 className="font-['Oswald',_sans-serif] font-semibold text-white text-lg leading-snug mb-2 group-hover:text-blue-400 transition-colors">
                      {story.title}
                    </h3>

                    <p className="text-sm text-white/50 leading-relaxed mb-4 line-clamp-3">
                      {story.summary}
                    </p>

                    <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                      <span className="text-[10px] text-white/20 font-mono">{fmtDate(story.published_at)}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-white/20">
                        <Clock className="w-3 h-3" />
                        {estimateReadTime(story.summary, story.body)}
                      </span>
                      {story.data_sources && story.data_sources.length > 0 && (
                        <span className="text-[10px] text-white/20 ml-auto">
                          {story.data_sources.length} sources
                        </span>
                      )}
                    </div>
                  </SpotlightCard>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex justify-center gap-4 mt-10">
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
