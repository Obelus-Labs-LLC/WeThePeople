import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Target, CheckCircle2, XCircle, Clock, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react';
import { fetchPromise, castVote, PromiseItem } from '../api/civic';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-zinc-800', text: 'text-zinc-400' },
  in_progress: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  partially_fulfilled: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  fulfilled: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  broken: { bg: 'bg-red-500/15', text: 'text-red-400' },
  retired: { bg: 'bg-zinc-800', text: 'text-zinc-500' },
};

const MILESTONE_ICON: Record<string, typeof CheckCircle2> = {
  achieved: CheckCircle2,
  missed: XCircle,
  pending: Clock,
};

export default function PromiseDetailPage() {
  const { promiseId } = useParams<{ promiseId: string }>();
  const [promise, setPromise] = useState<PromiseItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    if (!promiseId) return;
    fetchPromise(parseInt(promiseId))
      .then(setPromise)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [promiseId]);

  const handleVote = async (value: 1 | -1) => {
    if (!promise || voting) return;
    setVoting(true);
    try {
      await castVote('promise', promise.id, value);
      const updated = await fetchPromise(promise.id);
      setPromise(updated);
    } catch {
      // silently fail for unauth users
    }
    setVoting(false);
  };

  if (loading) {
    return (
      <main id="main-content" className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" role="status">
          <span className="sr-only">Loading...</span>
        </div>
      </main>
    );
  }

  if (error || !promise) {
    return (
      <main id="main-content" className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4">{error || 'Promise not found'}</p>
          <Link to="/civic" className="text-amber-400 text-sm hover:underline">Back to Civic Hub</Link>
        </div>
      </main>
    );
  }

  const sc = STATUS_COLORS[promise.status] || STATUS_COLORS.pending;

  return (
    <main id="main-content" className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        {/* Back nav */}
        <Link to="/civic" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-amber-400 transition-colors mb-6">
          <ArrowLeft size={14} /> Civic Hub
        </Link>

        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <Target size={28} className="text-amber-400 shrink-0 mt-1" />
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold mb-2" style={{ fontFamily: 'Oswald, sans-serif' }}>
              {promise.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Link to={`/politics/people/${promise.person_id}`} className="text-amber-400 hover:underline font-mono">
                {promise.person_name || promise.person_id}
              </Link>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${sc.bg} ${sc.text}`} style={{ fontFamily: 'Oswald, sans-serif' }}>
                {promise.status.replace(/_/g, ' ')}
              </span>
              {promise.category && <span className="text-xs text-zinc-500 uppercase">{promise.category}</span>}
            </div>
          </div>
        </div>

        {/* Description */}
        {promise.description && (
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">{promise.description}</p>
        )}

        {/* Source */}
        {promise.source_url && (
          <a href={promise.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-amber-400 transition-colors mb-6">
            <ExternalLink size={12} /> Source
          </a>
        )}

        {/* Progress */}
        <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-zinc-300">Progress</span>
            <span className="text-sm font-mono text-amber-400">{promise.progress}%</span>
          </div>
          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${promise.progress}%` }} />
          </div>
        </div>

        {/* Voting */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => handleVote(1)} disabled={voting} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
            <ThumbsUp size={14} /> Support
          </button>
          <button onClick={() => handleVote(-1)} disabled={voting} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm hover:bg-red-500/20 transition-colors disabled:opacity-50">
            <ThumbsDown size={14} /> Oppose
          </button>
          {promise.confidence_score != null && (
            <span className="text-xs text-zinc-600 font-mono ml-auto">
              confidence: {(promise.confidence_score * 100).toFixed(1)}%
            </span>
          )}
        </div>

        {/* Milestones */}
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ fontFamily: 'Oswald, sans-serif' }}>
          Milestones
          <span className="text-xs text-zinc-600 font-mono">{promise.milestones?.length || 0}</span>
        </h2>
        {(!promise.milestones || promise.milestones.length === 0) ? (
          <div className="text-center py-8 bg-zinc-900/40 rounded-xl border border-white/5">
            <p className="text-zinc-500 text-sm">No milestones yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {promise.milestones.map((m) => {
              const Icon = MILESTONE_ICON[m.status] || Clock;
              const iconColor = m.status === 'achieved' ? 'text-emerald-400' : m.status === 'missed' ? 'text-red-400' : 'text-zinc-500';
              return (
                <div key={m.id} className="flex items-start gap-3 bg-zinc-900/60 border border-white/10 rounded-xl p-4">
                  <Icon size={16} className={`shrink-0 mt-0.5 ${iconColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-200">{m.title}</div>
                    {m.description && <p className="text-xs text-zinc-500 mt-1">{m.description}</p>}
                    {m.achieved_date && <span className="text-[10px] text-zinc-600 mt-1 block">{new Date(m.achieved_date).toLocaleDateString()}</span>}
                  </div>
                  {m.evidence_url && (
                    <a href={m.evidence_url} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-amber-400">
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
