import { useState, useEffect, useCallback } from 'react';
import { Search, Pill, FlaskConical, AlertTriangle, ExternalLink } from 'lucide-react';
import { apiFetch, mainSiteUrl } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface HealthCompany {
  company_id: string;
  display_name: string;
}

interface RecallItem {
  id: number;
  recall_number: string | null;
  product_description: string | null;
  reason_for_recall: string | null;
  classification: string | null;
  status: string | null;
  recall_initiation_date: string | null;
}

interface ClinicalTrialItem {
  id: number;
  nct_id: string | null;
  title: string | null;
  phase: string | null;
  overall_status: string | null;
  conditions: string | null;
  interventions: string | null;
  enrollment: number | null;
}

interface SearchResults {
  recalls: (RecallItem & { companyId: string; companyName: string })[];
  trials: (ClinicalTrialItem & { companyId: string; companyName: string })[];
}

// ── Helpers ──

function fmtDate(d: string | null): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

function trialStatusColor(status: string | null): string {
  if (!status) return '#64748B';
  const lower = status.toLowerCase();
  if (lower.includes('recruit') && !lower.includes('not')) return '#10B981';
  if (lower.includes('active') || lower.includes('not yet')) return '#F59E0B';
  if (lower.includes('completed')) return '#3B82F6';
  return '#DC2626';
}

function recallClassColor(cls: string | null): string {
  if (!cls) return '#64748B';
  if (cls.includes('I') && !cls.includes('II') && !cls.includes('III')) return '#DC2626';
  if (cls.includes('II') && !cls.includes('III')) return '#F59E0B';
  if (cls.includes('III')) return '#3B82F6';
  return '#64748B';
}

type ResultTab = 'recalls' | 'trials';

// ── Page ──

export default function DrugLookupPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [companies, setCompanies] = useState<HealthCompany[]>([]);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ResultTab>('recalls');

  const [companiesError, setCompaniesError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ companies: HealthCompany[] }>('/health/companies', {
      params: { limit: 200 },
      signal: controller.signal,
    })
      .then((res) => setCompanies(res.companies || []))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        console.error('[DrugLookup] failed to load companies:', err);
        setCompaniesError(err?.message || 'Failed to load company list');
      })
      .finally(() => {
        if (!controller.signal.aborted) setInitialLoading(false);
      });
    return () => controller.abort();
  }, []);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || companies.length === 0) return;

    setLoading(true);
    setSubmittedQuery(q);
    setActiveTab('recalls');

    const drugResults: SearchResults = { recalls: [], trials: [] };
    const qLower = q.toLowerCase();

    // Search ALL companies in batches of 20 to avoid overwhelming the API
    const batchSize = 20;
    try {
      const allRecalls: (RecallItem & { companyId: string; companyName: string })[] = [];
      const allTrials: (ClinicalTrialItem & { companyId: string; companyName: string })[] = [];

      for (let i = 0; i < companies.length; i += batchSize) {
        const batch = companies.slice(i, i + batchSize);
        const [recallBatch, trialBatch] = await Promise.all([
          Promise.all(
            batch.map((c) =>
              apiFetch<{ recalls: RecallItem[] }>(`/health/companies/${c.company_id}/recalls`, {
                params: { limit: 50 },
              })
                .then((res) =>
                  (res.recalls || [])
                    .filter((r) => r.product_description && r.product_description.toLowerCase().includes(qLower))
                    .map((r) => ({ ...r, companyId: c.company_id, companyName: c.display_name })),
                )
                .catch(() => [] as (RecallItem & { companyId: string; companyName: string })[]),
            ),
          ),
          Promise.all(
            batch.map((c) =>
              apiFetch<{ trials: ClinicalTrialItem[] }>(`/health/companies/${c.company_id}/trials`, {
                params: { limit: 50 },
              })
                .then((res) =>
                  (res.trials || [])
                    .filter(
                      (t) =>
                        (t.title && t.title.toLowerCase().includes(qLower)) ||
                        (t.conditions && t.conditions.toLowerCase().includes(qLower)) ||
                        (t.interventions && t.interventions.toLowerCase().includes(qLower)),
                    )
                    .map((t) => ({ ...t, companyId: c.company_id, companyName: c.display_name })),
                )
                .catch(() => [] as (ClinicalTrialItem & { companyId: string; companyName: string })[]),
            ),
          ),
        ]);
        allRecalls.push(...recallBatch.flat());
        allTrials.push(...trialBatch.flat());
      }

      // Dedupe recalls by `recall_number`. The same recall (e.g. a Class II
      // Kombiglyze recall co-marketed by Bristol-Myers Squibb and AstraZeneca)
      // appears in BOTH companies' per-company recall lists, so the fan-out
      // surfaces visually-identical duplicate cards. Keep the first
      // occurrence and merge subsequent companies into a `coCompanies` list
      // (currently unused at render time but available for the FE to surface
      // co-marketing relationships in the future).
      const recallSeen = new Map<string, RecallItem & { companyId: string; companyName: string; coCompanies?: string[] }>();
      for (const r of allRecalls) {
        const key = r.recall_number || `${r.product_description || ''}|${r.recall_initiation_date || ''}`;
        const existing = recallSeen.get(key);
        if (!existing) {
          recallSeen.set(key, r);
        } else if (existing.companyId !== r.companyId) {
          existing.coCompanies = existing.coCompanies || [];
          if (!existing.coCompanies.includes(r.companyName)) {
            existing.coCompanies.push(r.companyName);
          }
        }
      }
      drugResults.recalls = Array.from(recallSeen.values());
      drugResults.trials = allTrials;
    } catch {
      // partial results still shown
    }

    setResults(drugResults);
    setLoading(false);
  }, [query, companies]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const totalResults = results ? results.recalls.length + results.trials.length : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Drug Lookup"
        title="Drug Search"
        description="Search for a drug or product name to find FDA recalls and clinical trials across all tracked health companies."
        accent="var(--color-red)"
      />

      {/* Search Bar */}
      <div className="flex gap-3 mb-8 max-w-2xl">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Enter drug name (e.g. Humira, Ozempic, Lipitor)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3.5 pl-12 pr-4 text-base text-white outline-none transition-colors focus:border-red-500/50 placeholder:text-zinc-600"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!query.trim() || loading || initialLoading}
          className="rounded-xl px-6 py-3.5 text-sm font-bold text-white cursor-pointer border-0 transition-colors bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Companies load error */}
      {!initialLoading && companiesError && companies.length === 0 && (
        <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          Could not load company list: {companiesError}. Search is disabled until reload.
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent mb-4" />
          <p className="text-sm text-zinc-500">Searching across {companies.length} companies...</p>
        </div>
      )}

      {/* No search yet */}
      {!loading && !results && !submittedQuery && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
            <Pill size={36} className="text-zinc-700" />
          </div>
          <p className="text-lg font-semibold text-zinc-400 mb-2">Search by drug name</p>
          <p className="text-sm text-zinc-600">Results include FDA recalls and clinical trials.</p>
        </div>
      )}

      {/* Results */}
      {!loading && results && (
        <>
          <div className="mb-6">
            <span className="text-sm text-zinc-500">
              {totalResults.toLocaleString()} results for "{submittedQuery}"
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {([
              { key: 'recalls' as ResultTab, label: 'FDA Recalls', count: results.recalls.length, icon: AlertTriangle },
              { key: 'trials' as ResultTab, label: 'Clinical Trials', count: results.trials.length, icon: FlaskConical },
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

          {/* Tab content */}
          <div className="space-y-4">
            {activeTab === 'recalls' && (
              results.recalls.length === 0 ? (
                <EmptyState text={`No recalls found for "${submittedQuery}".`} />
              ) : (
                results.recalls.map((r, idx) => {
                  const barColor = recallClassColor(r.classification);
                  return (
                    <div
                      key={`recall-${r.id}-${idx}`}
                      className="flex rounded-xl border border-zinc-800/60 overflow-hidden"
                      style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.03}s forwards` }}
                    >
                      <div className="w-1.5 shrink-0" style={{ background: barColor }} />
                      <div className="flex-1 p-5 bg-zinc-900/40">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          {r.classification && (
                            <span className="rounded border px-2 py-1 text-xs font-bold" style={{ borderColor: `${barColor}40`, color: barColor }}>
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

                        <p className="text-sm font-semibold text-white mb-2">
                          {r.product_description || 'No product description'}
                        </p>

                        {r.reason_for_recall && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 mb-3">
                            <p className="text-xs uppercase tracking-wider mb-1 text-zinc-600">REASON</p>
                            <p className="text-sm text-zinc-400 line-clamp-2">{r.reason_for_recall}</p>
                          </div>
                        )}

                        <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                          <a
                            href={mainSiteUrl(`/health/${r.companyId}`)}
                            className="flex items-center gap-2 text-sm text-zinc-500 no-underline hover:text-red-300 transition-colors"
                          >
                            {r.companyName}
                            <ExternalLink size={12} />
                          </a>
                          <span className="text-sm text-zinc-600 font-mono">{fmtDate(r.recall_initiation_date)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            )}

            {activeTab === 'trials' && (
              results.trials.length === 0 ? (
                <EmptyState text={`No clinical trials found for "${submittedQuery}".`} />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {results.trials.map((t, idx) => {
                    const statusColor = trialStatusColor(t.overall_status);
                    return (
                      <div
                        key={`trial-${t.id}-${idx}`}
                        className="flex flex-col border border-zinc-800/60 bg-zinc-900/40 rounded-xl p-5"
                        style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.03}s forwards` }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          {t.phase && (
                            <span className="rounded px-2 py-1 text-xs font-bold text-zinc-400 bg-zinc-800 font-mono">
                              {t.phase}
                            </span>
                          )}
                          {t.nct_id && (
                            <a
                              href={`https://clinicaltrials.gov/study/${t.nct_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:underline font-mono"
                            >
                              {t.nct_id}
                            </a>
                          )}
                        </div>

                        <p className="text-base font-semibold leading-snug line-clamp-3 flex-1 mb-3 text-white">
                          {t.title || 'Untitled Trial'}
                        </p>

                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider mb-1 text-zinc-600">CONDITIONS</p>
                            <p className="text-sm truncate text-zinc-400">{t.conditions || '\u2014'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider mb-1 text-zinc-600">INTERVENTIONS</p>
                            <p className="text-sm truncate text-zinc-400">{t.interventions || '\u2014'}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
                            <span className="text-xs text-zinc-400 font-mono">{t.overall_status || 'Unknown'}</span>
                          </div>
                          <a
                            href={mainSiteUrl(`/health/${t.companyId}`)}
                            className="text-xs text-zinc-500 no-underline hover:text-red-300 transition-colors"
                          >
                            {t.companyName}
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
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
