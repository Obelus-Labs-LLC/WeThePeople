import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, ChevronRight, RefreshCw } from 'lucide-react';
import { apiFetch, humanizeError } from '../api/client';
import { categoryLabel } from '../utils/categoryLabels';
import { TIER_LABEL_UPPER, TIER_TAILWIND, asTier } from '../utils/tierLabels';

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
    score: number;       // 0-1 in vault responses
    relevance?: string;
    progress?: string;
    timing?: string;
  } | null;
}

interface VaultResponse {
  total: number;
  limit: number;
  offset: number;
  items: VaultItem[];
  results?: VaultItem[];
  count?: number;
}

/** Render the stored 0-1 score as a 0-100 display value. Returns null
 *  for missing scores AND for tier='none', because a "0/100" badge next
 *  to "UNVERIFIED" reads as a failing grade rather than absence of
 *  evidence and makes the vault look worse than it is. */
function displayScore(raw: number | undefined | null, tier: string): string | null {
  if (raw == null) return null;
  if (tier === 'none') return null;
  const value = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
  return String(value);
}

export default function VaultPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  // Hide tier='none' (Unverified) items by default. 74% of the vault
  // is currently unverified because Veritas's evaluator only matches
  // legislative records and most stored claims are FARA / contract /
  // donor claims that need a different matcher. Showing all of them
  // by default makes the platform read as low-confidence. Power users
  // can toggle them back on.
  const [showUnverified, setShowUnverified] = useState(false);
  const limit = 25;

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    apiFetch<VaultResponse>('/claims/verifications', {
      params: { limit, offset },
      signal,
    })
      .then((data) => {
        setItems(data.items || data.results || []);
        setTotal(data.total || data.count || 0);
      })
      .catch((err) => {
        if (signal?.aborted) return;
        setError(humanizeError(err));
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, [offset]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Apply the unverified-tier filter client-side. Doing this server-side
  // (?tier_in=strong,moderate,weak) is cleaner long-term but the API
  // endpoint doesn't support a tier-filter param yet; client-side keeps
  // the fix shippable today. Pagination math uses the post-filter count.
  const visibleItems = showUnverified
    ? items
    : items.filter((it) => asTier(it.evaluation?.tier) !== 'none');
  const hiddenCount = items.length - visibleItems.length;

  return (
    <main id="main-content" className="flex-1 px-4 py-10 sm:py-14">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-emerald-400 transition-colors mb-3"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <h1
              className="text-2xl sm:text-3xl font-bold text-white"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              <span className="text-emerald-400">Verification</span> Vault
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {total.toLocaleString()} verifications in the database
              {hiddenCount > 0 && !showUnverified && (
                <>
                  <span className="text-zinc-700 mx-1.5">·</span>
                  <button
                    type="button"
                    onClick={() => setShowUnverified(true)}
                    className="text-emerald-400 hover:underline"
                  >
                    Show {hiddenCount} unverified on this page
                  </button>
                </>
              )}
              {showUnverified && (
                <>
                  <span className="text-zinc-700 mx-1.5">·</span>
                  <button
                    type="button"
                    onClick={() => setShowUnverified(false)}
                    className="text-zinc-500 hover:underline"
                  >
                    Hide unverified
                  </button>
                </>
              )}
            </p>
          </div>
          <Shield size={28} className="text-emerald-400/30" />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20" aria-busy="true">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" role="status">
              <span className="sr-only">Loading verifications...</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={() => load()}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        )}

        {/* Items */}
        {!loading && !error && visibleItems.length === 0 && (
          <div className="text-center py-20">
            <Shield size={48} className="mx-auto text-zinc-700 mb-4" />
            {items.length === 0 ? (
              <>
                <p className="text-zinc-500 text-sm mb-2">No verifications yet.</p>
                <p className="text-zinc-600 text-xs mb-6">
                  Submit a claim or URL on the home page to start building your vault.
                </p>
              </>
            ) : (
              <>
                <p className="text-zinc-500 text-sm mb-2">
                  Every verification on this page is currently unverified.
                </p>
                <p className="text-zinc-600 text-xs mb-6">
                  Toggle "Show unverified" above to view them, or browse another page.
                </p>
              </>
            )}
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2.5 bg-emerald-500 text-black font-bold text-sm rounded-lg uppercase tracking-wider hover:bg-emerald-400 transition-colors"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              Verify a Claim
            </button>
          </div>
        )}

        {!loading && !error && visibleItems.length > 0 && (
          <div className="space-y-3">
            {visibleItems.map((item) => {
              const tier = asTier(item.evaluation?.tier);
              const style = TIER_TAILWIND[tier];
              const score = displayScore(item.evaluation?.score, tier);

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
                      {TIER_LABEL_UPPER[tier]}
                    </span>
                    {score !== null && (
                      <div className="text-[10px] font-mono text-zinc-500 text-center mt-0.5">
                        {score}
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
                          {categoryLabel(item.category)}
                        </span>
                      )}
                      {item.created_at && (
                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight size={16} className="text-zinc-700 group-hover:text-emerald-400 transition-colors shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {/* Pagination — pages by the un-filtered total so the user
            sees consistent forward/back even when they're hiding
            unverified items. The visibleItems filter only narrows
            the in-memory page; the pager always advances by `limit`. */}
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
              {offset + 1}&ndash;{Math.min(offset + limit, total)} of {total}
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
