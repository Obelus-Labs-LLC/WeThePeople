import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Pill, AlertTriangle, AlertCircle, Activity, FlaskConical,
  ExternalLink, Building2,
} from 'lucide-react';
import { HealthSectorHeader } from '../components/SectorHeader';
import {
  ResearchToolLayout,
  ResearchSection,
  ResearchRowCard,
  ResearchEmptyState,
} from '../components/research/ResearchToolLayout';
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
import { fmtDate, fmtNum } from '../utils/format';

interface DrugResults {
  adverseEvents: (AdverseEventItem & { companyId: string; companyName: string })[];
  recalls: (RecallItem & { companyId: string; companyName: string })[];
  trials: (ClinicalTrialItem & { companyId: string; companyName: string })[];
}

function trialStatusAccent(status: string | null): string {
  if (!status) return 'var(--color-text-3)';
  const lower = status.toLowerCase();
  if (lower.includes('recruit') && !lower.includes('not')) return 'var(--color-green)';
  if (lower.includes('active') || lower.includes('not yet')) return 'var(--color-accent)';
  if (lower.includes('completed')) return 'var(--color-dem)';
  return 'var(--color-red)';
}

function recallClassAccent(cls: string | null): string {
  if (!cls) return 'var(--color-text-3)';
  if (cls.includes('I') && !cls.includes('II') && !cls.includes('III')) return 'var(--color-red)';
  if (cls.includes('II') && !cls.includes('III')) return 'var(--color-accent)';
  if (cls.includes('III')) return 'var(--color-dem)';
  return 'var(--color-text-3)';
}

type ResultTab = 'adverse' | 'recalls' | 'trials';

export default function DrugLookupPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [results, setResults] = useState<DrugResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ResultTab>('adverse');

  useEffect(() => {
    let cancelled = false;
    getHealthCompanies({ limit: 200 })
      .then((res) => { if (!cancelled) setCompanies(res.companies || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setInitialLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || companies.length === 0) return;
    setLoading(true);
    setSubmittedQuery(q);
    setActiveTab('adverse');

    const drugResults: DrugResults = { adverseEvents: [], recalls: [], trials: [] };
    const companySlice = companies.slice(0, 10);
    const qLower = q.toLowerCase();

    try {
      const [aeResults, recallResults, trialResults] = await Promise.all([
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
    } catch {
      // partial results still shown
    }

    setResults(drugResults);
    setLoading(false);
  }, [query, companies]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const totalResults = results ? results.adverseEvents.length + results.recalls.length + results.trials.length : 0;

  return (
    <ResearchToolLayout
      sectorHeader={<HealthSectorHeader />}
      eyebrow={{ label: 'Drug Lookup', color: 'var(--color-red)' }}
      title="Drug Search"
      description="Search for a drug name across tracked companies to surface adverse events, FDA recalls, and clinical trials."
      accent="var(--color-red)"
      loading={initialLoading}
      stats={results ? [
        { label: 'Total Results', value: fmtNum(totalResults), icon: Pill, accent: 'var(--color-red)' },
        { label: 'Adverse Events', value: fmtNum(results.adverseEvents.length), icon: AlertTriangle, accent: 'var(--color-red)' },
        { label: 'Recalls', value: fmtNum(results.recalls.length), icon: Activity, accent: 'var(--color-accent)' },
        { label: 'Trials', value: fmtNum(results.trials.length), icon: FlaskConical, accent: 'var(--color-dem)' },
      ] : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 420px', minWidth: '280px' }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)' }} />
            <input
              type="text"
              placeholder="Enter drug name (e.g. Humira, Ozempic, Lipitor)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '14px 14px 14px 40px',
                borderRadius: '10px',
                border: '1px solid rgba(235,229,213,0.1)',
                background: 'var(--color-surface)',
                color: 'var(--color-text-1)',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || loading || initialLoading}
            style={{
              padding: '14px 28px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--color-red)',
              color: '#0A0A0F',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: (!query.trim() || loading || initialLoading) ? 'not-allowed' : 'pointer',
              opacity: (!query.trim() || loading || initialLoading) ? 0.4 : 1,
            }}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-text-3)' }}>
            Searching across {companies.length} companies…
          </div>
        )}

        {!loading && !results && !submittedQuery && (
          <ResearchEmptyState icon={Pill} text="Search by drug name — results will include adverse events, FDA recalls, and clinical trials." />
        )}

        {!loading && results && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
              {totalResults.toLocaleString()} results for "{submittedQuery}"
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {([
                { key: 'adverse' as ResultTab, label: 'Adverse Events', count: results.adverseEvents.length, icon: AlertTriangle },
                { key: 'recalls' as ResultTab, label: 'Recalls', count: results.recalls.length, icon: Activity },
                { key: 'trials' as ResultTab, label: 'Clinical Trials', count: results.trials.length, icon: FlaskConical },
              ]).map((tab) => {
                const isActive = activeTab === tab.key;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: `1px solid ${isActive ? 'rgba(230,57,70,0.3)' : 'rgba(235,229,213,0.1)'}`,
                      background: isActive ? 'rgba(230,57,70,0.12)' : 'var(--color-surface)',
                      color: isActive ? 'var(--color-red)' : 'var(--color-text-2)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon size={13} />
                    {tab.label}
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: isActive ? 'rgba(230,57,70,0.2)' : 'rgba(235,229,213,0.06)',
                        color: isActive ? 'var(--color-red)' : 'var(--color-text-3)',
                        fontSize: '10px',
                      }}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <ResearchSection title="Results" subtitle={`${activeTab === 'adverse' ? 'Adverse events' : activeTab === 'recalls' ? 'FDA recalls' : 'Clinical trials'} matching "${submittedQuery}".`}>
              {activeTab === 'adverse' && (
                results.adverseEvents.length === 0 ? (
                  <ResearchEmptyState icon={Search} text={`No adverse events found for "${submittedQuery}".`} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {results.adverseEvents.map((e, idx) => (
                      <ResearchRowCard key={`ae-${e.id}-${idx}`} accent={e.serious ? 'var(--color-red)' : 'var(--color-text-3)'}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '10px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {e.serious ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, background: 'rgba(230,57,70,0.15)', border: '1px solid rgba(230,57,70,0.3)', color: 'var(--color-red)' }}>
                                <AlertCircle size={11} /> SERIOUS
                              </span>
                            ) : (
                              <span style={{ padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, background: 'rgba(235,229,213,0.05)', color: 'var(--color-text-3)' }}>
                                ROUTINE
                              </span>
                            )}
                            {e.report_id && (
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>#{e.report_id}</span>
                            )}
                          </div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>{fmtDate(e.receive_date)}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px', marginBottom: '10px' }}>
                          <div>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 4px' }}>Drug</p>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 600, color: 'var(--color-text-1)', margin: 0 }}>{e.drug_name || '—'}</p>
                          </div>
                          <div>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 4px' }}>Reactions</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {(e.reaction || '').split(',').filter(Boolean).map((r, i) => (
                                <span key={i} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(235,229,213,0.08)', background: 'rgba(235,229,213,0.04)', color: 'var(--color-text-2)', fontFamily: 'var(--font-body)', fontSize: '12px' }}>
                                  {r.trim()}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid rgba(235,229,213,0.06)' }}>
                          <Link
                            to={`/health/${e.companyId}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', textDecoration: 'none' }}
                          >
                            <Building2 size={12} />
                            {e.companyName}
                            <ExternalLink size={10} />
                          </Link>
                          {e.outcome && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: e.outcome.toLowerCase().includes('fatal') ? 'var(--color-red)' : 'var(--color-text-3)', fontWeight: e.outcome.toLowerCase().includes('fatal') ? 700 : 400 }}>
                              Outcome: {e.outcome}
                            </span>
                          )}
                        </div>
                      </ResearchRowCard>
                    ))}
                  </div>
                )
              )}

              {activeTab === 'recalls' && (
                results.recalls.length === 0 ? (
                  <ResearchEmptyState icon={Search} text={`No recalls found for "${submittedQuery}".`} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {results.recalls.map((r) => {
                      const accent = recallClassAccent(r.classification);
                      return (
                        <ResearchRowCard key={r.id} accent={accent}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                            {r.classification && (
                              <span style={{ padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, background: `${accent}1f`, border: `1px solid ${accent}33`, color: accent }}>
                                {r.classification}
                              </span>
                            )}
                            {r.status && (
                              <span style={{ padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, background: r.status.toLowerCase().includes('ongoing') ? 'rgba(230,57,70,0.15)' : 'rgba(235,229,213,0.05)', color: r.status.toLowerCase().includes('ongoing') ? 'var(--color-red)' : 'var(--color-text-3)' }}>
                                {r.status.toUpperCase()}
                              </span>
                            )}
                            {r.recall_number && (
                              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)' }}>{r.recall_number}</span>
                            )}
                          </div>
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-1)', margin: '0 0 10px' }}>
                            {r.product_description || 'No product description'}
                          </p>
                          {r.reason_for_recall && (
                            <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(235,229,213,0.06)', background: 'rgba(235,229,213,0.03)', marginBottom: '10px' }}>
                              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 4px' }}>Reason</p>
                              <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-text-2)', margin: 0 }}>{r.reason_for_recall}</p>
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(235,229,213,0.06)' }}>
                            <Link
                              to={`/health/${r.companyId}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', textDecoration: 'none' }}
                            >
                              <Building2 size={12} />
                              {r.companyName}
                              <ExternalLink size={10} />
                            </Link>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>Initiated: {fmtDate(r.recall_initiation_date)}</span>
                          </div>
                        </ResearchRowCard>
                      );
                    })}
                  </div>
                )
              )}

              {activeTab === 'trials' && (
                results.trials.length === 0 ? (
                  <ResearchEmptyState icon={Search} text={`No clinical trials found for "${submittedQuery}".`} />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '12px' }}>
                    {results.trials.map((t) => {
                      const statusAccent = trialStatusAccent(t.overall_status);
                      return (
                        <ResearchRowCard key={t.id} accent={statusAccent}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            {t.phase && (
                              <span style={{ padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, background: 'rgba(235,229,213,0.05)', color: 'var(--color-text-2)' }}>
                                {t.phase}
                              </span>
                            )}
                            {t.nct_id && (
                              <a
                                href={`https://clinicaltrials.gov/study/${t.nct_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-dem)', textDecoration: 'none' }}
                              >
                                {t.nct_id}
                              </a>
                            )}
                          </div>
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-1)', margin: '0 0 10px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {t.title || 'Untitled Trial'}
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <div>
                              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 4px' }}>Conditions</p>
                              <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-text-2)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.conditions || '—'}</p>
                            </div>
                            <div>
                              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 4px' }}>Interventions</p>
                              <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-text-2)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.interventions || '—'}</p>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(235,229,213,0.06)' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: statusAccent }} />
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-2)' }}>{t.overall_status || 'Unknown'}</span>
                            </div>
                            <Link
                              to={`/health/${t.companyId}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', textDecoration: 'none' }}
                            >
                              <Building2 size={11} />
                              {t.companyName}
                            </Link>
                          </div>
                        </ResearchRowCard>
                      );
                    })}
                  </div>
                )
              )}
            </ResearchSection>
          </div>
        )}
      </div>
    </ResearchToolLayout>
  );
}
