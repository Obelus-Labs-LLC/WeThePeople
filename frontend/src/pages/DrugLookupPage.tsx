import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, Pill, AlertTriangle, AlertCircle, Activity, FlaskConical,
  ExternalLink, Building2,
} from 'lucide-react';
import { HealthSectorHeader } from '../components/SectorHeader';
import {
  getHealthCompanies,
  getHealthCompanyAdverseEvents,
  getHealthCompanyRecalls,
  getHealthCompanyTrials,
  type CompanyListItem,
  type AdverseEventItem,
  type RecallItem,
  type ClinicalTrialItem,
} from '../api/health';
import { fmtDate } from '../utils/format';

// ── Types ──

interface DrugResults {
  adverseEvents: (AdverseEventItem & { companyId: string; companyName: string })[];
  recalls: (RecallItem & { companyId: string; companyName: string })[];
  trials: (ClinicalTrialItem & { companyId: string; companyName: string })[];
}

// ── Trial status color ──

function trialStatusColor(status: string | null): string {
  if (!status) return '#64748B';
  const lower = status.toLowerCase();
  if (lower.includes('recruit') && !lower.includes('not')) return '#10B981';
  if (lower.includes('active') || lower.includes('not yet')) return '#F59E0B';
  if (lower.includes('completed')) return '#3B82F6';
  return '#DC2626';
}

// ── Recall classification colors ──

function recallClassColor(cls: string | null): { bar: string; bg: string; border: string; text: string } {
  if (!cls) return { bar: '#64748B', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', text: '#94A3B8' };
  if (cls.includes('I') && !cls.includes('II') && !cls.includes('III'))
    return { bar: '#DC2626', bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.2)', text: '#FCA5A5' };
  if (cls.includes('II') && !cls.includes('III'))
    return { bar: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#FDE68A' };
  if (cls.includes('III'))
    return { bar: '#3B82F6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', text: '#93C5FD' };
  return { bar: '#64748B', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', text: '#94A3B8' };
}

// ── Tab type ──

type ResultTab = 'adverse' | 'recalls' | 'trials';

// ── Page ──

export default function DrugLookupPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [results, setResults] = useState<DrugResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ResultTab>('adverse');
  const navigate = useNavigate();

  // Load companies on mount
  useEffect(() => {
    getHealthCompanies({ limit: 200 })
      .then((res) => setCompanies(res.companies || []))
      .catch(console.error)
      .finally(() => setInitialLoading(false));
  }, []);

  // Search across all companies for a drug name
  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || companies.length === 0) return;

    setLoading(true);
    setSubmittedQuery(q);
    setActiveTab('adverse');

    const drugResults: DrugResults = {
      adverseEvents: [],
      recalls: [],
      trials: [],
    };

    // Search across companies in sequential batches of 10 to avoid rate limits
    // (3 API calls per company x 10 = 30 concurrent requests per batch)
    const companySlice = companies.slice(0, 10);
    const qLower = q.toLowerCase();

    try {
      const [aeResults, recallResults, trialResults] = await Promise.all([
        // Adverse events: fetch from each company and filter by drug name
        Promise.all(
          companySlice.map((c) =>
            getHealthCompanyAdverseEvents(c.company_id, { limit: 50 })
              .then((res) =>
                (res.adverse_events || [])
                  .filter((e) => e.drug_name && e.drug_name.toLowerCase().includes(qLower))
                  .map((e) => ({ ...e, companyId: c.company_id, companyName: c.display_name }))
              )
              .catch(() => [] as (AdverseEventItem & { companyId: string; companyName: string })[])
          )
        ),
        // Recalls: fetch and filter by product description
        Promise.all(
          companySlice.map((c) =>
            getHealthCompanyRecalls(c.company_id, { limit: 50 })
              .then((res) =>
                (res.recalls || [])
                  .filter((r) => r.product_description && r.product_description.toLowerCase().includes(qLower))
                  .map((r) => ({ ...r, companyId: c.company_id, companyName: c.display_name }))
              )
              .catch(() => [] as (RecallItem & { companyId: string; companyName: string })[])
          )
        ),
        // Trials: fetch and filter by title, conditions, or interventions
        Promise.all(
          companySlice.map((c) =>
            getHealthCompanyTrials(c.company_id, { limit: 50 })
              .then((res) =>
                (res.trials || [])
                  .filter(
                    (t) =>
                      (t.title && t.title.toLowerCase().includes(qLower)) ||
                      (t.conditions && t.conditions.toLowerCase().includes(qLower)) ||
                      (t.interventions && t.interventions.toLowerCase().includes(qLower))
                  )
                  .map((t) => ({ ...t, companyId: c.company_id, companyName: c.display_name }))
              )
              .catch(() => [] as (ClinicalTrialItem & { companyId: string; companyName: string })[])
          )
        ),
      ]);

      drugResults.adverseEvents = aeResults.flat();
      drugResults.recalls = recallResults.flat();
      drugResults.trials = trialResults.flat();
    } catch (err) {
      console.error('Drug search error:', err);
    }

    setResults(drugResults);
    setLoading(false);
  }, [query, companies]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const totalResults = results
    ? results.adverseEvents.length + results.recalls.length + results.trials.length
    : 0;

  return (
    <div className="flex flex-col w-full min-h-screen">
      <div className="mx-auto w-full max-w-[1400px] flex flex-col px-8 py-8 md:px-12 md:py-10">
        <HealthSectorHeader />

        {/* Header */}
        <div className="flex items-end justify-between pb-6 mb-8 shrink-0 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Pill size={16} style={{ color: '#DC2626' }} />
              <span
                className="text-sm uppercase text-white/40"
                style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.2em' }}
              >
                DRUG LOOKUP
              </span>
            </div>
            <h1
              className="text-4xl md:text-5xl font-bold text-white"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Drug Search
            </h1>
            <p className="text-sm mt-2 text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Search for a drug name to find adverse events, recalls, and clinical trials across all tracked companies.
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Enter drug name (e.g. Humira, Ozempic, Lipitor)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-xl border border-white/10 bg-white/[0.05] backdrop-blur-sm py-4 pl-12 pr-4 text-base text-white outline-none transition-colors focus:border-[#DC2626]/50 placeholder:text-white/30"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || loading || initialLoading}
            className="rounded-xl px-8 py-4 text-sm font-bold text-white cursor-pointer border-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: '#DC2626',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DC2626] border-t-transparent mb-4" />
            <p className="text-sm text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Searching across {companies.length} companies...
            </p>
          </div>
        )}

        {/* No search yet */}
        {!loading && !results && !submittedQuery && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center mb-6">
              <Pill size={36} className="text-white/20" />
            </div>
            <p className="text-lg font-semibold text-white/60 mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
              Search by drug name
            </p>
            <p className="text-sm text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Results include adverse events, FDA recalls, and clinical trials.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && results && (
          <>
            {/* Summary bar */}
            <div className="flex items-center gap-6 mb-6">
              <span className="text-sm text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {totalResults.toLocaleString()} results for "{submittedQuery}"
              </span>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              {([
                { key: 'adverse' as ResultTab, label: 'Adverse Events', count: results.adverseEvents.length, icon: AlertTriangle },
                { key: 'recalls' as ResultTab, label: 'Recalls', count: results.recalls.length, icon: Activity },
                { key: 'trials' as ResultTab, label: 'Clinical Trials', count: results.trials.length, icon: FlaskConical },
              ]).map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium cursor-pointer border transition-colors"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      background: isActive ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.05)',
                      borderColor: isActive ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.1)',
                      color: isActive ? '#FCA5A5' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    <tab.icon size={14} />
                    {tab.label}
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        background: isActive ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.05)',
                        color: isActive ? '#FCA5A5' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="space-y-4">
              {activeTab === 'adverse' && (
                results.adverseEvents.length === 0 ? (
                  <EmptyResults text={`No adverse events found for "${submittedQuery}".`} />
                ) : (
                  results.adverseEvents.map((e, idx) => (
                    <div
                      key={`ae-${e.id}-${idx}`}
                      className="rounded-xl border border-white/10 bg-white/[0.05] backdrop-blur-sm p-5 transition-colors hover:border-white/20"
                      style={{
                        opacity: 0,
                        animation: `card-enter 0.3s ease-out ${idx * 0.03}s forwards`,
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {e.serious ? (
                            <span className="flex items-center gap-1 rounded border px-2 py-1 text-xs font-bold"
                              style={{ background: 'rgba(220,38,38,0.15)', borderColor: 'rgba(220,38,38,0.3)', color: '#FCA5A5' }}>
                              <AlertCircle size={12} /> SERIOUS
                            </span>
                          ) : (
                            <span className="rounded px-2 py-1 text-xs font-bold"
                              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                              ROUTINE
                            </span>
                          )}
                          {e.report_id && (
                            <span className="text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                              #{e.report_id}
                            </span>
                          )}
                        </div>
                        <span className="text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                          {fmtDate(e.receive_date)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-3">
                        <div>
                          <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.3)' }}>DRUG</p>
                          <p className="text-lg font-semibold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>
                            {e.drug_name || '\u2014'}
                          </p>
                        </div>
                        <div className="lg:col-span-2">
                          <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.3)' }}>REACTIONS</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(e.reaction || '').split(',').filter(Boolean).map((r, i) => (
                              <span key={i} className="rounded-md border border-white/10 px-2 py-1 text-sm text-white/70 bg-white/[0.05]">
                                {r.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Company link */}
                      <div className="flex items-center justify-between border-t border-white/10 pt-3">
                        <Link
                          to={`/health/${e.companyId}`}
                          className="flex items-center gap-2 text-sm no-underline transition-colors hover:text-[#FCA5A5]"
                          style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.5)' }}
                        >
                          <Building2 size={14} />
                          {e.companyName}
                          <ExternalLink size={12} />
                        </Link>
                        {e.outcome && (
                          <span className="text-sm" style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            color: e.outcome.toLowerCase().includes('fatal') ? '#FCA5A5' : 'rgba(255,255,255,0.4)',
                            fontWeight: e.outcome.toLowerCase().includes('fatal') ? 700 : 400,
                          }}>
                            Outcome: {e.outcome}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )
              )}

              {activeTab === 'recalls' && (
                results.recalls.length === 0 ? (
                  <EmptyResults text={`No recalls found for "${submittedQuery}".`} />
                ) : (
                  results.recalls.map((r, idx) => {
                    const cls = recallClassColor(r.classification);
                    return (
                      <div
                        key={`recall-${r.id}-${idx}`}
                        className="flex rounded-xl border border-white/10 overflow-hidden"
                        style={{
                          opacity: 0,
                          animation: `card-enter 0.3s ease-out ${idx * 0.03}s forwards`,
                        }}
                      >
                        <div className="w-2 shrink-0" style={{ background: cls.bar }} />
                        <div className="flex-1 p-5 bg-white/[0.05] backdrop-blur-sm">
                          <div className="flex items-center gap-2 mb-3">
                            {r.classification && (
                              <span className="rounded border px-2 py-1 text-xs font-bold"
                                style={{ background: cls.bg, borderColor: cls.border, color: cls.text }}>
                                {r.classification}
                              </span>
                            )}
                            {r.status && (
                              <span className="rounded px-2 py-1 text-xs font-bold"
                                style={{
                                  background: r.status.toLowerCase().includes('ongoing') ? 'rgba(220,38,38,0.1)' : 'rgba(255,255,255,0.05)',
                                  color: r.status.toLowerCase().includes('ongoing') ? '#FCA5A5' : 'rgba(255,255,255,0.4)',
                                }}>
                                {r.status.toUpperCase()}
                              </span>
                            )}
                            {r.recall_number && (
                              <span className="text-sm ml-auto" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.3)' }}>
                                {r.recall_number}
                              </span>
                            )}
                          </div>

                          <p className="text-sm font-semibold text-white mb-3" style={{ fontFamily: "'Syne', sans-serif" }}>
                            {r.product_description || 'No product description'}
                          </p>

                          {r.reason_for_recall && (
                            <div className="rounded-lg border border-white/10 p-3 mb-3 bg-white/[0.03]">
                              <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.3)' }}>REASON</p>
                              <p className="text-sm text-white/70">{r.reason_for_recall}</p>
                            </div>
                          )}

                          <div className="flex items-center justify-between border-t border-white/10 pt-3">
                            <Link
                              to={`/health/${r.companyId}`}
                              className="flex items-center gap-2 text-sm no-underline transition-colors hover:text-[#FCA5A5]"
                              style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.5)' }}
                            >
                              <Building2 size={14} />
                              {r.companyName}
                              <ExternalLink size={12} />
                            </Link>
                            <span className="text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                              Initiated: {fmtDate(r.recall_initiation_date)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )
              )}

              {activeTab === 'trials' && (
                results.trials.length === 0 ? (
                  <EmptyResults text={`No clinical trials found for "${submittedQuery}".`} />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {results.trials.map((t, idx) => {
                      const statusColor = trialStatusColor(t.overall_status);
                      return (
                        <div
                          key={`trial-${t.id}-${idx}`}
                          className="flex flex-col border border-white/10 bg-white/[0.05] backdrop-blur-sm rounded-xl p-5"
                          style={{
                            opacity: 0,
                            animation: `card-enter 0.3s ease-out ${idx * 0.03}s forwards`,
                          }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            {t.phase && (
                              <span className="rounded px-2 py-1 text-xs font-bold"
                                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontFamily: "'JetBrains Mono', monospace" }}>
                                {t.phase}
                              </span>
                            )}
                            {t.nct_id && (
                              <a
                                href={`https://clinicaltrials.gov/study/${t.nct_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs hover:underline"
                                style={{ fontFamily: "'JetBrains Mono', monospace", color: '#93C5FD' }}
                              >
                                {t.nct_id}
                              </a>
                            )}
                          </div>

                          <p className="text-base font-semibold leading-snug line-clamp-3 flex-1 mb-3 text-white"
                            style={{ fontFamily: "'Syne', sans-serif" }}>
                            {t.title || 'Untitled Trial'}
                          </p>

                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <p className="uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>CONDITIONS</p>
                              <p className="text-sm truncate text-white/70">{t.conditions || '\u2014'}</p>
                            </div>
                            <div>
                              <p className="uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>INTERVENTIONS</p>
                              <p className="text-sm truncate text-white/70">{t.interventions || '\u2014'}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-white/10 pt-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
                              <span className="text-xs font-medium" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.6)' }}>
                                {t.overall_status || 'Unknown'}
                              </span>
                            </div>
                            <Link
                              to={`/health/${t.companyId}`}
                              className="flex items-center gap-1 text-xs no-underline transition-colors hover:text-[#FCA5A5]"
                              style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}
                            >
                              <Building2 size={12} />
                              {t.companyName}
                            </Link>
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
      </div>

      <style>{`
        @keyframes card-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Empty results ──

function EmptyResults({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-white/10 bg-white/[0.03]">
      <Search size={48} className="text-white/10 mb-4" />
      <p className="text-sm text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{text}</p>
    </div>
  );
}
