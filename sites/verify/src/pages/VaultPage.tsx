import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, ChevronRight } from 'lucide-react';
import { apiFetch } from '../api/client';

interface VaultItem {
  id: number;
  person_id: string;
  text: string;
  category?: string;
  intent?: string;
  claim_date?: string;
  source_url?: string;
  created_at?: string;
  evaluation?: {
    tier: string;
    score: number;
    relevance?: number;
    progress?: string;
    timing?: string;
  } | null;
}

interface VaultResponse {
  total: number;
  limit: number;
  offset: number;
  items: VaultItem[];
}

const TIER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  strong: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'STRONG' },
  moderate: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'MODERATE' },
  weak: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'WEAK' },
  none: { bg: 'bg-zinc-500/10', text: 'text-zinc-500', label: 'NONE' },
};

export default function VaultPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  useEffect(() => {
    setLoading(true);
    apiFetch<VaultResponse>('/claims/verifications', {
      params: { limit, offset },
    })
      .then((data) => {
        setItems(data.items || data.results || []);
        setTotal(data.total || data.count || 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [offset]);

  return (
    <main className="flex-1 px-4 py-10 sm:py-14">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-amber-400 transition-colors mb-3"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <h1
              className="text-2xl sm:text-3xl font-bold text-white"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              <span className="text-amber-400">Verification</span> Vault
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {total.toLocaleString()} verifications in the database
            </p>
          </div>
          <Shield size={28} className="text-amber-400/30" />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Items */}
        {!loading && !error && items.length === 0 && (
          <div className="text-center py-20">
            <Shield size={48} className="mx-auto text-zinc-700 mb-4" />
            <p className="text-zinc-500 text-sm mb-2">No verifications yet.</p>
            <p className="text-zinc-600 text-xs mb-6">Submit a claim or URL on the home page to start building your vault.</p>
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2.5 bg-amber-500 text-black font-bold text-sm rounded-lg uppercase tracking-wider hover:bg-amber-400 transition-colors"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              Verify a Claim
            </button>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map((item) => {
              const tier = item.evaluation?.tier || 'none';
              const style = TIER_STYLE[tier] || TIER_STYLE.none;

              return (
                <button
                  key={item.id}
                  onClick={() => navigate(`/results/${item.id}`)}
                  className="w-full text-left bg-zinc-900/60 border border-white/10 rounded-xl p-4 card-hover flex items-center gap-4 group"
                >
                  {/* Tier badge */}
                  <div className={`shrink-0 px-2.5 py-1 rounded-lg ${style.bg} border border-white/5`}>
                    <span
                      className={`text-xs font-bold uppercase tracking-wider ${style.text}`}
                      style={{ fontFamily: 'Oswald, sans-serif' }}
                    >
                      {style.label}
                    </span>
                    {item.evaluation?.score != null && (
                      <div className="text-[10px] font-mono text-zinc-500 text-center mt-0.5">
                        {item.evaluation.score}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{item.text}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-600">
                      {item.person_id && (
                        <span className="font-mono">{item.person_id}</span>
                      )}
                      {item.category && item.category !== 'general' && (
                        <span className="px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-500 uppercase text-[10px]">
                          {item.category.replace(/_/g, ' ')}
                        </span>
                      )}
                      {item.created_at && (
                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight size={16} className="text-zinc-700 group-hover:text-amber-400 transition-colors shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && total > limit && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-4 py-2 text-xs text-zinc-400 border border-zinc-800 rounded-lg hover:border-zinc-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-xs text-zinc-600 font-mono">
              {offset + 1}--{Math.min(offset + limit, total)} of {total}
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= total}
              className="px-4 py-2 text-xs text-zinc-400 border border-zinc-800 rounded-lg hover:border-zinc-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
