import { useState, useCallback } from 'react';
import { Search, ShieldAlert, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';

// ── Types ──

interface FdaRecall {
  recall_number: string | null;
  classification: string | null;
  status: string | null;
  product_description: string | null;
  reason_for_recall: string | null;
  recall_initiation_date: string | null;
  recalling_firm: string | null;
  city: string | null;
  state: string | null;
  distribution_pattern: string | null;
}

// Drug and device recalls use the same shape as FDA food recalls

// ── Helpers ──

function fmtDate(d: string | null): string {
  if (!d) return '\u2014';
  try {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

function classColor(cls: string | null): string {
  if (!cls) return '#64748B';
  if (cls.includes('I') && !cls.includes('II') && !cls.includes('III')) return '#DC2626';
  if (cls.includes('II') && !cls.includes('III')) return '#F59E0B';
  if (cls.includes('III')) return '#3B82F6';
  return '#64748B';
}

function classBgColor(cls: string | null): string {
  if (!cls) return 'bg-zinc-500/10';
  if (cls.includes('I') && !cls.includes('II') && !cls.includes('III')) return 'bg-red-500/10';
  if (cls.includes('II') && !cls.includes('III')) return 'bg-amber-500/10';
  if (cls.includes('III')) return 'bg-blue-500/10';
  return 'bg-zinc-500/10';
}

type ResultTab = 'food' | 'drug' | 'device';

// ── Page ──

export default function FoodSafetyPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [foodRecalls, setFoodRecalls] = useState<FdaRecall[]>([]);
  const [drugRecalls, setDrugRecalls] = useState<FdaRecall[]>([]);
  const [deviceRecalls, setDeviceRecalls] = useState<FdaRecall[]>([]);
  const [foodTotal, setFoodTotal] = useState(0);
  const [drugTotal, setDrugTotal] = useState(0);
  const [deviceTotal, setDeviceTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultTab>('food');
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setSubmittedQuery(q);
    setSearched(true);
    setActiveTab('food');

    try {
      const [foodRes, drugRes, deviceRes] = await Promise.all([
        apiFetch<{ total: number; recalls: FdaRecall[] }>('/research/food-recalls', { params: { search: q, limit: 50 } }).catch(() => ({ total: 0, recalls: [] })),
        apiFetch<{ total: number; recalls: FdaRecall[] }>('/research/drug-recalls', { params: { search: q, limit: 50 } }).catch(() => ({ total: 0, recalls: [] })),
        apiFetch<{ total: number; recalls: FdaRecall[] }>('/research/device-recalls', { params: { search: q, limit: 50 } }).catch(() => ({ total: 0, recalls: [] })),
      ]);
      setFoodRecalls(foodRes.recalls);
      setFoodTotal(foodRes.total);
      setDrugRecalls(drugRes.recalls);
      setDrugTotal(drugRes.total);
      setDeviceRecalls(deviceRes.recalls);
      setDeviceTotal(deviceRes.total);
    } catch {
      // partial results still shown
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Back link */}
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8">
        <ArrowLeft size={14} />
        Back to Research Tools
      </Link>

      {/* Header */}
      <div className="mb-8">
        <span className="text-xs font-bold tracking-[0.2em] text-red-500 uppercase">Food Safety</span>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50 mt-1" style={{ fontFamily: 'Oswald, sans-serif' }}>
          Food Safety Search
        </h1>
        <p className="text-base text-zinc-400 mt-2 max-w-2xl">
          Search 84,000+ FDA recalls across food, drugs, and medical devices. Find by product, company, or reason.
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3 mb-8 max-w-2xl">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search product or company (e.g. peanut butter, Tyson)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3.5 pl-12 pr-4 text-base text-white outline-none transition-colors focus:border-red-500/50 placeholder:text-zinc-600"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!query.trim() || loading}
          className="rounded-xl px-6 py-3.5 text-sm font-bold text-white cursor-pointer border-0 transition-colors bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent mb-4" />
          <p className="text-sm text-zinc-500">Searching FDA and USDA databases...</p>
        </div>
      )}

      {/* No search yet */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
            <ShieldAlert size={36} className="text-zinc-700" />
          </div>
          <p className="text-lg font-semibold text-zinc-400 mb-2">Search food recalls</p>
          <p className="text-sm text-zinc-600">Results include FDA food, drug, and medical device recalls.</p>
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <>
          <div className="mb-6">
            <span className="text-sm text-zinc-500">
              {(foodRecalls.length + drugRecalls.length + deviceRecalls.length).toLocaleString()} results for &ldquo;{submittedQuery}&rdquo;
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {([
              { key: 'food' as ResultTab, label: 'Food Recalls', count: foodRecalls.length, icon: ShieldAlert },
              { key: 'drug' as ResultTab, label: 'Drug Recalls', count: drugRecalls.length, icon: AlertTriangle },
              { key: 'device' as ResultTab, label: 'Device Recalls', count: deviceRecalls.length, icon: ShieldAlert },
            ]).map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium cursor-pointer border transition-colors ${
                    isActive
                      ? 'bg-red-500/10 border-red-500/30 text-red-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <tab.icon size={14} />
                  {tab.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? 'bg-red-500/20 text-red-300' : 'bg-zinc-800 text-zinc-600'}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Food Tab */}
          {activeTab === 'food' && (
            <div className="space-y-4">
              {foodRecalls.length === 0 ? (
                <EmptyState text={`No food recalls found for "${submittedQuery}".`} />
              ) : (
                foodRecalls.map((r, idx) => {
                  const barColor = classColor(r.classification);
                  return (
                    <div
                      key={`fda-${r.recall_number}-${idx}`}
                      className="flex rounded-xl border border-zinc-800/60 overflow-hidden"
                      style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.03}s forwards` }}
                    >
                      <div className="w-1.5 shrink-0" style={{ background: barColor }} />
                      <div className="flex-1 p-5 bg-zinc-900/40">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          {r.classification && (
                            <span
                              className={`rounded border px-2 py-1 text-xs font-bold ${classBgColor(r.classification)}`}
                              style={{ borderColor: `${barColor}40`, color: barColor }}
                            >
                              {r.classification}
                            </span>
                          )}
                          {r.status && (
                            <span className={`rounded px-2 py-1 text-xs font-bold ${r.status.toLowerCase().includes('ongoing') ? 'text-red-300' : 'text-zinc-500'}`}>
                              {r.status.toUpperCase()}
                            </span>
                          )}
                          {r.recall_number && (
                            <span className="text-xs text-zinc-600 ml-auto font-mono">{r.recall_number}</span>
                          )}
                        </div>

                        <p className="text-sm font-semibold text-white mb-2 line-clamp-2">
                          {r.product_description || 'No product description'}
                        </p>

                        {r.reason_for_recall && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 mb-3">
                            <p className="text-xs uppercase tracking-wider mb-1 text-zinc-600">REASON</p>
                            <p className="text-sm text-zinc-400 line-clamp-2">{r.reason_for_recall}</p>
                          </div>
                        )}

                        {r.distribution_pattern && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 mb-3">
                            <p className="text-xs uppercase tracking-wider mb-1 text-zinc-600">DISTRIBUTION</p>
                            <p className="text-sm text-zinc-400 line-clamp-2">{r.distribution_pattern}</p>
                          </div>
                        )}

                        <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                          <span className="text-sm text-zinc-400">
                            {r.recalling_firm || '\u2014'}
                            {r.city && r.state ? ` \u00b7 ${r.city}, ${r.state}` : ''}
                          </span>
                          <span className="text-sm text-zinc-600 font-mono">{fmtDate(r.recall_initiation_date)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Drug Tab */}
          {activeTab === 'drug' && (
            <div className="space-y-4">
              {drugRecalls.length === 0 ? (
                <EmptyState text={`No drug recalls found for "${submittedQuery}".`} />
              ) : (
                drugRecalls.map((r, idx) => {
                  const barColor = classColor(r.classification);
                  return (
                    <div key={`drug-${r.recall_number}-${idx}`} className="flex rounded-xl border border-zinc-800/60 overflow-hidden" style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.03}s forwards` }}>
                      <div className="w-1.5 shrink-0" style={{ background: barColor }} />
                      <div className="flex-1 p-5 bg-zinc-900/40">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          {r.classification && <span className={`rounded border px-2 py-1 text-xs font-bold ${classBgColor(r.classification)}`} style={{ borderColor: `${barColor}40`, color: barColor }}>{r.classification}</span>}
                          {r.status && <span className={`rounded px-2 py-1 text-xs font-bold ${r.status.toLowerCase().includes('ongoing') ? 'text-red-300' : 'text-zinc-500'}`}>{r.status.toUpperCase()}</span>}
                          {r.recall_number && <span className="text-xs text-zinc-600 ml-auto font-mono">{r.recall_number}</span>}
                        </div>
                        <p className="text-sm font-semibold text-white mb-2 line-clamp-2">{r.product_description || 'No product description'}</p>
                        {r.reason_for_recall && <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 mb-3"><p className="text-xs uppercase tracking-wider mb-1 text-zinc-600">REASON</p><p className="text-sm text-zinc-400 line-clamp-2">{r.reason_for_recall}</p></div>}
                        <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                          <span className="text-sm text-zinc-400">{r.recalling_firm || '\u2014'}{r.city && r.state ? ` \u00b7 ${r.city}, ${r.state}` : ''}</span>
                          <span className="text-sm text-zinc-600 font-mono">{fmtDate(r.recall_initiation_date)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Device Tab */}
          {activeTab === 'device' && (
            <div className="space-y-4">
              {deviceRecalls.length === 0 ? (
                <EmptyState text={`No device recalls found for "${submittedQuery}".`} />
              ) : (
                deviceRecalls.map((r, idx) => {
                  const barColor = classColor(r.classification);
                  return (
                    <div key={`device-${r.recall_number}-${idx}`} className="flex rounded-xl border border-zinc-800/60 overflow-hidden" style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.03}s forwards` }}>
                      <div className="w-1.5 shrink-0" style={{ background: barColor }} />
                      <div className="flex-1 p-5 bg-zinc-900/40">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          {r.classification && <span className={`rounded border px-2 py-1 text-xs font-bold ${classBgColor(r.classification)}`} style={{ borderColor: `${barColor}40`, color: barColor }}>{r.classification}</span>}
                          {r.status && <span className={`rounded px-2 py-1 text-xs font-bold ${r.status.toLowerCase().includes('ongoing') ? 'text-red-300' : 'text-zinc-500'}`}>{r.status.toUpperCase()}</span>}
                          {r.recall_number && <span className="text-xs text-zinc-600 ml-auto font-mono">{r.recall_number}</span>}
                        </div>
                        <p className="text-sm font-semibold text-white mb-2 line-clamp-2">{r.product_description || 'No product description'}</p>
                        {r.reason_for_recall && <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 mb-3"><p className="text-xs uppercase tracking-wider mb-1 text-zinc-600">REASON</p><p className="text-sm text-zinc-400 line-clamp-2">{r.reason_for_recall}</p></div>}
                        <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                          <span className="text-sm text-zinc-400">{r.recalling_firm || '\u2014'}{r.city && r.state ? ` \u00b7 ${r.city}, ${r.state}` : ''}</span>
                          <span className="text-sm text-zinc-600 font-mono">{fmtDate(r.recall_initiation_date)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes card-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-zinc-800 bg-zinc-900/30">
      <Search size={48} className="text-zinc-800 mb-4" />
      <p className="text-sm text-zinc-500">{text}</p>
    </div>
  );
}
