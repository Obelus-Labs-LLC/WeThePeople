import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Newspaper, Calendar, Tag, Share2 } from 'lucide-react';
import { motion } from 'framer-motion';
import ShareButton from '../components/ShareButton';
import { getApiBaseUrl } from '../api/client';

interface StoryDetail {
  id: number;
  title: string;
  slug: string;
  summary: string;
  body: string;
  category: string;
  sector: string | null;
  entity_ids: string[];
  data_sources: string[];
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

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function StoryDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`${getApiBaseUrl()}/stories/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Story not found');
        return r.json();
      })
      .then((d) => setStory(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center">
        <Newspaper className="w-12 h-12 text-white/20 mb-4" />
        <p className="text-white/40 mb-4">Story not found</p>
        <Link to="/stories" className="text-blue-400 hover:text-blue-300 text-sm no-underline">
          Back to Stories
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12">
        {/* Back link */}
        <Link to="/stories" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/60 no-underline mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Stories
        </Link>

        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-3 py-1 text-xs font-bold uppercase text-blue-400">
              <Tag className="w-3 h-3" />
              {CATEGORY_LABELS[story.category] || story.category}
            </span>
            {story.sector && (
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/40 uppercase">
                {story.sector}
              </span>
            )}
            {story.published_at && (
              <span className="inline-flex items-center gap-1 text-xs text-white/30">
                <Calendar className="w-3 h-3" />
                {fmtDate(story.published_at)}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-4xl font-bold leading-tight mb-4">
            {story.title}
          </h1>

          {/* Summary */}
          {story.summary && (
            <p className="text-lg text-white/60 italic mb-8 leading-relaxed">
              {story.summary}
            </p>
          )}

          {/* Body */}
          <div className="prose prose-invert prose-sm max-w-none mb-8">
            {story.body?.split('\n').map((paragraph, idx) => {
              if (!paragraph.trim()) return null;
              if (paragraph.startsWith('## ')) {
                return <h2 key={idx} className="text-xl font-bold text-white mt-8 mb-3">{paragraph.slice(3)}</h2>;
              }
              if (paragraph.startsWith('### ')) {
                return <h3 key={idx} className="text-lg font-bold text-white mt-6 mb-2">{paragraph.slice(4)}</h3>;
              }
              if (paragraph.startsWith('- ')) {
                return <li key={idx} className="text-white/70 ml-4">{paragraph.slice(2)}</li>;
              }
              // Bold text
              const parts = paragraph.split(/\*\*(.*?)\*\*/g);
              return (
                <p key={idx} className="text-white/70 leading-relaxed mb-4">
                  {parts.map((part, i) =>
                    i % 2 === 1 ? <strong key={i} className="text-white">{part}</strong> : part
                  )}
                </p>
              );
            })}
          </div>

          {/* Evidence sidebar */}
          {story.evidence && Object.keys(story.evidence).length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 mb-8">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white/40 mb-4">Evidence</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {Object.entries(story.evidence).map(([key, val]) => {
                  if (typeof val === 'object' || key === 'source_table' || key === 'source_tables') return null;
                  const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                  let display = String(val);
                  if (typeof val === 'number' && val > 10000) {
                    display = `$${(val / 1000000).toFixed(1)}M`;
                  }
                  return (
                    <div key={key} className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-[10px] text-white/30 uppercase tracking-wider">{label}</p>
                      <p className="text-sm text-white font-mono mt-1">{display}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Entity links */}
          {story.entity_ids && story.entity_ids.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              <span className="text-xs text-white/30">Related entities:</span>
              {story.entity_ids.map((eid) => (
                <span key={eid} className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-white/50">
                  {eid}
                </span>
              ))}
            </div>
          )}

          {/* Share */}
          <div className="flex items-center gap-4 pt-6 border-t border-white/5">
            <ShareButton url={`https://wethepeopleforus.com/stories/${story.slug}`} title={story.title} text={story.summary} />
            <Link to="/stories" className="text-sm text-white/30 hover:text-white/50 no-underline ml-auto">
              More stories
            </Link>
          </div>
        </motion.article>
      </div>
    </div>
  );
}
