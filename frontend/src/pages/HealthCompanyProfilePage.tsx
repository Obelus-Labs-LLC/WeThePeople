import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Activity, Pill, AlertTriangle, AlertCircle, ExternalLink,
  ArrowLeft, Landmark, FileText, BarChart3, Stethoscope, List, Filter,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import BackButton from '../components/BackButton';
import { HealthSectorHeader } from '../components/SectorHeader';
import {
  getHealthCompanyDetail,
  getHealthCompanyAdverseEvents,
  getHealthCompanyRecalls,
  getHealthCompanyTrials,
  getHealthCompanyPayments,
  getHealthCompanyPaymentSummary,
  getHealthCompanyFilings,
  getHealthCompanyStock,
  getHealthCompanyLobbying,
  getHealthCompanyLobbySummary,
  getHealthCompanyContracts,
  getHealthCompanyEnforcement,
  type CompanyDetail,
  type AdverseEventItem,
  type RecallItem,
  type ClinicalTrialItem,
  type PaymentItem,
  type PaymentSummary,
  type HealthFiling,
  type HealthStockSnapshot,
  type HealthLobbyingFiling,
  type HealthLobbySummary,
  type HealthContractItem,
  type HealthEnforcementAction,
} from '../api/health';
import { fmtDollar, fmtDate } from '../utils/format';
import { getApiBaseUrl } from '../api/client';
import SanctionsBadge from '../components/SanctionsBadge';
import AnomalyBadge from '../components/AnomalyBadge';
import TrendChart from '../components/TrendChart';
import ShareButton from '../components/ShareButton';
import WatchlistButton from '../components/WatchlistButton';
import { LOCAL_LOGOS } from '../data/healthLogos';
import { getLogoUrl } from '../utils/logos';
import CompanyLogo from '../components/CompanyLogo';

function companyLogoUrl(c: { company_id: string; logo_url?: string | null; display_name: string }): string {
  return getLogoUrl(c.company_id, c.logo_url, LOCAL_LOGOS);
}

// -- Helpers --

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return `${(n * 100).toFixed(2)}%`;
}

// -- Trial status colors --

function trialStatusColor(status: string | null): string {
  if (!status) return '#64748B';
  const lower = status.toLowerCase();
  if (lower.includes('recruit') && !lower.includes('not')) return '#10B981';
  if (lower.includes('active') || lower.includes('not yet')) return '#F59E0B';
  if (lower.includes('completed')) return '#3B82F6';
  return '#DC2626';
}

// -- Recall classification colors (dark theme) --

function recallClassColor(cls: string | null): { bar: string; bg: string; border: string; text: string } {
  if (!cls) return { bar: '#64748B', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', text: 'rgba(255,255,255,0.5)' };
  if (cls.includes('I') && !cls.includes('II') && !cls.includes('III'))
    return { bar: '#DC2626', bg: 'rgba(220,38,38,0.15)', border: 'rgba(220,38,38,0.3)', text: '#FCA5A5' };
  if (cls.includes('II') && !cls.includes('III'))
    return { bar: '#F59E0B', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)', text: '#FDE68A' };
  if (cls.includes('III'))
    return { bar: '#3B82F6', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#93C5FD' };
  return { bar: '#64748B', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', text: 'rgba(255,255,255,0.5)' };
}

// -- Tab definitions --

const TABS = [
  { key: 'lobbying', label: 'Lobbying' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'enforcement', label: 'Enforcement' },
  { key: 'trials', label: 'Drug Pipeline' },
  { key: 'payments', label: 'Payments & Filings' },
  // { key: 'adverse', label: 'Safety Data' },  // Hidden from UI — data kept in backend
  { key: 'recalls', label: 'Recalls' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// -- Adverse Events Tab --

function AdverseEventsTab({ companyId }: { companyId: string }) {
  const [events, setEvents] = useState<AdverseEventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    getHealthCompanyAdverseEvents(companyId, { limit: 50 })
      .then((res) => { setEvents(res.adverse_events || []); setTotal(res.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  const handleLoadMore = () => {
    setLoadingMore(true);
    getHealthCompanyAdverseEvents(companyId, { limit: 50, offset: events.length })
      .then((res) => { setEvents((prev) => [...prev, ...(res.adverse_events || [])]); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-widest mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
        {total.toLocaleString()} TOTAL REPORTS
      </p>
      {events.length === 0 ? (
        <EmptyState text="No adverse events on record." />
      ) : (
        events.map((e) => (
          <div
            key={e.id}
            className="rounded-xl border p-5 transition-colors backdrop-blur-sm"
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderColor: 'rgba(255,255,255,0.1)',
            }}
            onMouseEnter={(ev) => (ev.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
            onMouseLeave={(ev) => (ev.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
          >
            {/* Top row: badge + ID + date */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {e.serious ? (
                  <span
                    className="flex items-center gap-1 rounded border px-2 py-1 text-xs font-bold"
                    style={{ background: 'rgba(220,38,38,0.15)', borderColor: 'rgba(220,38,38,0.3)', color: '#FCA5A5' }}
                  >
                    <AlertCircle size={12} /> SERIOUS
                  </span>
                ) : (
                  <span
                    className="rounded px-2 py-1 text-xs font-bold"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}
                  >
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

            {/* Drug, Reaction, Outcome */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-3">
              <div>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>DRUG</p>
                <p className="text-lg font-semibold" style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0' }}>
                  {e.drug_name || '\u2014'}
                </p>
              </div>
              <div className="lg:col-span-2">
                <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>REACTIONS</p>
                <div className="flex flex-wrap gap-1.5">
                  {(e.reaction || '').split(',').filter(Boolean).map((r, i) => (
                    <span
                      key={i}
                      className="rounded-md border px-2 py-1 text-sm"
                      style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#CBD5E1' }}
                    >
                      {r.trim()}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Outcome */}
            {e.outcome && (
              <div className="border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                <span
                  className="text-sm"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color: e.outcome.toLowerCase().includes('fatal') ? '#FCA5A5' : 'rgba(255,255,255,0.4)',
                    fontWeight: e.outcome.toLowerCase().includes('fatal') ? 700 : 400,
                  }}
                >
                  Outcome: {e.outcome}
                </span>
              </div>
            )}
          </div>
        ))
      )}
      {events.length < total && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-4 w-full rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-50"
        >
          {loadingMore ? 'Loading...' : `Load More (${events.length} of ${total.toLocaleString()})`}
        </button>
      )}
    </div>
  );
}

// -- Recalls Tab --

function RecallsTab({ companyId }: { companyId: string }) {
  const [recalls, setRecalls] = useState<RecallItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    getHealthCompanyRecalls(companyId, { limit: 50 })
      .then((res) => { setRecalls(res.recalls || []); setTotal(res.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  const handleLoadMore = () => {
    setLoadingMore(true);
    getHealthCompanyRecalls(companyId, { limit: 50, offset: recalls.length })
      .then((res) => { setRecalls((prev) => [...prev, ...(res.recalls || [])]); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-widest mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
        {total.toLocaleString()} TOTAL RECALLS
      </p>
      {recalls.length === 0 ? (
        <EmptyState text="No FDA recalls on record." />
      ) : (
        recalls.map((r) => {
          const cls = recallClassColor(r.classification);
          return (
            <div
              key={r.id}
              className="flex rounded-xl border overflow-hidden shadow-sm"
              style={{ borderColor: 'rgba(255,255,255,0.1)' }}
            >
              {/* Color bar */}
              <div className="w-3 shrink-0" style={{ background: cls.bar }} />

              {/* Content */}
              <div className="flex-1 p-5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                {/* Badges */}
                <div className="flex items-center gap-2 mb-3">
                  {r.classification && (
                    <span
                      className="rounded border px-2 py-1 text-xs font-bold"
                      style={{ background: cls.bg, borderColor: cls.border, color: cls.text }}
                    >
                      {r.classification}
                    </span>
                  )}
                  {r.status && (
                    <span
                      className="rounded px-2 py-1 text-xs font-bold"
                      style={{
                        background: r.status.toLowerCase().includes('ongoing') ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.05)',
                        color: r.status.toLowerCase().includes('ongoing') ? '#FCA5A5' : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {r.status.toUpperCase()}
                    </span>
                  )}
                  {r.recall_number && (
                    <span className="text-sm ml-auto" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                      {r.recall_number}
                    </span>
                  )}
                </div>

                {/* Product description */}
                <p className="text-sm mb-3" style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0', fontWeight: 600 }}>
                  {r.product_description || 'No product description'}
                </p>

                {/* Reason */}
                {r.reason_for_recall && (
                  <div className="rounded-lg border p-3 mb-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)' }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>REASON</p>
                    <p className="text-sm" style={{ color: '#CBD5E1' }}>{r.reason_for_recall}</p>
                  </div>
                )}

                {/* Date */}
                <span className="text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                  Initiated: {fmtDate(r.recall_initiation_date)}
                </span>
              </div>
            </div>
          );
        })
      )}
      {recalls.length < total && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-4 w-full rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-50"
        >
          {loadingMore ? 'Loading...' : `Load More (${recalls.length} of ${total.toLocaleString()})`}
        </button>
      )}
    </div>
  );
}

// -- Clinical Trials Tab --

function TrialsTab({ companyId }: { companyId: string }) {
  const [trials, setTrials] = useState<ClinicalTrialItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    getHealthCompanyTrials(companyId, { limit: 50 })
      .then((res) => { setTrials(res.trials || []); setTotal(res.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  const handleLoadMore = () => {
    setLoadingMore(true);
    getHealthCompanyTrials(companyId, { limit: 50, offset: trials.length })
      .then((res) => { setTrials((prev) => [...prev, ...(res.trials || [])]); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* WTP Research CTA */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-body text-sm text-white/70">Full clinical pipeline analysis, trial phase breakdowns, and drug development tracking.</p>
        </div>
        <a href="https://research.wethepeopleforus.com/pipeline" target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 font-body text-xs font-semibold text-white hover:bg-blue-500 transition-colors no-underline">
          Open in WTP Research &#8599;
        </a>
      </div>
      <p className="text-xs uppercase tracking-widest mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
        {total.toLocaleString()} TOTAL TRIALS
      </p>
      {trials.length === 0 ? (
        <EmptyState text="No clinical trials on record." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {trials.map((t) => {
            const statusColor = trialStatusColor(t.overall_status);
            return (
              <div
                key={t.id}
                className="flex flex-col border rounded-xl p-5 shadow-sm backdrop-blur-sm"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
              >
                {/* Top: Phase + NCT ID */}
                <div className="flex items-center justify-between mb-3">
                  {t.phase && (
                    <span
                      className="rounded px-2 py-1 text-xs font-bold"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {t.phase}
                    </span>
                  )}
                  {t.nct_id && (
                    <a
                      href={`https://clinicaltrials.gov/study/${t.nct_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs hover:underline"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: '#60A5FA' }}
                    >
                      {t.nct_id}
                    </a>
                  )}
                </div>

                {/* Title */}
                <p
                  className="text-lg font-semibold leading-snug line-clamp-3 flex-1 mb-3"
                  style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0' }}
                >
                  {t.title || 'Untitled Trial'}
                </p>

                {/* Conditions & Interventions */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>CONDITIONS</p>
                    <p className="text-sm truncate" style={{ color: '#CBD5E1' }}>{t.conditions || '\u2014'}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>INTERVENTIONS</p>
                    <p className="text-sm truncate" style={{ color: '#CBD5E1' }}>{t.interventions || '\u2014'}</p>
                  </div>
                </div>

                {/* Footer: Status + Enrollment */}
                <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
                    <span className="text-xs font-medium" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.5)' }}>
                      {t.overall_status || 'Unknown'}
                    </span>
                  </div>
                  {t.enrollment != null && (
                    <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                      Target: {t.enrollment.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {trials.length < total && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-4 w-full rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-50"
        >
          {loadingMore ? 'Loading...' : `Load More (${trials.length} of ${total.toLocaleString()})`}
        </button>
      )}
    </div>
  );
}

// -- Payments & Filings Tab (Financial Pulse spec) --

function PaymentsFilingsTab({ companyId, company }: { companyId: string; company: CompanyDetail }) {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [filings, setFilings] = useState<HealthFiling[]>([]);
  const [stock, setStock] = useState<HealthStockSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getHealthCompanyPayments(companyId, { limit: 50 }),
      getHealthCompanyPaymentSummary(companyId),
      getHealthCompanyFilings(companyId, { limit: 20 }),
      getHealthCompanyStock(companyId),
    ])
      .then(([payRes, sumRes, filRes, stockRes]) => {
        setPayments(payRes.payments || []);
        setPaymentSummary(sumRes);
        setFilings(filRes.filings || []);
        setStock(stockRes.stock);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <LoadingSpinner />;

  const topNatures = paymentSummary
    ? Object.entries(paymentSummary.by_nature).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];
  const maxNature = topNatures.length > 0 ? topNatures[0][1] : 1;

  const topSpecialties = paymentSummary
    ? Object.entries(paymentSummary.by_specialty).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];
  const maxSpecialty = topSpecialties.length > 0 ? topSpecialties[0][1] : 1;

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)' }} className="rounded-xl p-6 md:p-8 -mx-4 md:-mx-0">
      {/* Header Card */}
      <div className="rounded-2xl border p-6 shadow-sm mb-6 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-4">
          <div className="rounded-xl p-3" style={{ background: '#1E293B' }}>
            <Landmark size={28} className="text-white" />
          </div>
          <div>
            <h3 className="text-3xl font-bold" style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0' }}>
              {company.display_name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                FINANCIAL PULSE
              </span>
              <SanctionsBadge status={company.sanctions_status} />
              <AnomalyBadge entityType="company" entityId={companyId || ''} />
            </div>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-4">
          {company.ticker && (
            <span className="rounded-md px-3 py-1 text-xl font-bold text-white" style={{ background: '#1E293B', fontFamily: "'JetBrains Mono', monospace" }}>
              {company.ticker}
            </span>
          )}
          {stock?.market_cap != null && (
            <span className="text-xl font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E2E8F0' }}>
              {fmtDollar(stock.market_cap)}
            </span>
          )}
        </div>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Fundamentals + Filings */}
        <div className="flex flex-col gap-6 md:overflow-y-auto md:max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
          {/* Fundamentals */}
          {stock && (
            <div className="rounded-2xl border p-6" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
              <h4 className="text-xs font-bold uppercase tracking-widest mb-6" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                STOCK FUNDAMENTALS
              </h4>
              <div className="space-y-3">
                {[
                  ['P/E Ratio', stock.pe_ratio != null ? stock.pe_ratio.toFixed(2) : '\u2014'],
                  ['EPS', stock.eps != null ? `$${stock.eps.toFixed(2)}` : '\u2014'],
                  ['Profit Margin', fmtPct(stock.profit_margin)],
                  ['Operating Margin', fmtPct(stock.operating_margin)],
                  ['ROE', fmtPct(stock.return_on_equity)],
                  ['Dividend Yield', fmtPct(stock.dividend_yield)],
                  ['52-Wk High', stock.week_52_high != null ? `$${stock.week_52_high.toFixed(2)}` : '\u2014'],
                  ['52-Wk Low', stock.week_52_low != null ? `$${stock.week_52_low.toFixed(2)}` : '\u2014'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center border-b pb-2" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                    <span className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E2E8F0' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SEC Filings */}
          <div className="rounded-2xl border p-6" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
            <h4 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
              SEC FILINGS
            </h4>
            {filings.length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No filings on record.</p>
            ) : (
              <div className="space-y-2">
                {filings.map((f) => (
                  <a
                    key={f.id}
                    href={f.primary_doc_url || f.filing_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-lg p-3 transition-colors no-underline hover:bg-white/[0.05]"
                    style={{ border: '1px solid transparent' }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
                    onMouseLeave={(ev) => (ev.currentTarget.style.borderColor = 'transparent')}
                  >
                    <span
                      className="w-12 text-center rounded px-1 py-0.5 text-xs font-bold text-white shrink-0"
                      style={{ background: '#0F172A', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {f.form_type || '?'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#E2E8F0' }}>
                        {f.description || f.form_type || 'Filing'}
                      </p>
                      <p className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                        {fmtDate(f.filing_date)}
                      </p>
                    </div>
                    <ExternalLink size={12} className="text-white/30 group-hover:text-[#60A5FA] transition-colors shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Column 2 & 3: Payment Summary + Ledger */}
        <div className="md:col-span-2 flex flex-col gap-6">
          {/* Dark CMS Summary Card */}
          {paymentSummary && (
            <div
              className="rounded-2xl p-6 text-white shadow-lg relative overflow-hidden"
              style={{ background: 'linear-gradient(to bottom right, #1E293B, #0F172A)' }}
            >
              {/* Decorative glow */}
              <div
                className="absolute rounded-full"
                style={{
                  width: '256px',
                  height: '256px',
                  background: '#DC2626',
                  filter: 'blur(100px)',
                  opacity: 0.2,
                  top: '-80px',
                  right: '-80px',
                }}
              />

              {/* Top metrics */}
              <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <p className="text-sm mb-1" style={{ color: '#94A3B8' }}>Total Payments</p>
                  <p className="text-3xl font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {paymentSummary.total_payments.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#94A3B8' }}>Total Amount</p>
                  <p className="text-3xl font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#F87171' }}>
                    {fmtDollar(paymentSummary.total_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#94A3B8' }}>Top Category</p>
                  <p className="text-lg font-bold" style={{ fontFamily: "'Syne', sans-serif" }}>
                    {topNatures.length > 0 ? topNatures[0][0] : '\u2014'}
                  </p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#94A3B8' }}>Top Specialty</p>
                  <p className="text-lg font-bold" style={{ fontFamily: "'Syne', sans-serif" }}>
                    {topSpecialties.length > 0 ? topSpecialties[0][0] : '\u2014'}
                  </p>
                </div>
              </div>

              {/* Charts */}
              <div className="relative z-10 border-t pt-6 grid grid-cols-1 md:grid-cols-2 gap-8" style={{ borderColor: '#334155' }}>
                {/* Nature of Payment */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 size={14} style={{ color: '#3B82F6' }} />
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8' }}>
                      BY NATURE
                    </span>
                  </div>
                  <div className="space-y-2">
                    {topNatures.map(([label, count], idx) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-24 text-xs truncate" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#CBD5E1' }}>{label}</span>
                        <div className="flex-1 h-2 rounded-full" style={{ background: '#334155' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              background: '#3B82F6',
                              width: `${(count / maxNature) * 100}%`,
                              animation: `bar-grow 1s ease-out ${idx * 0.1}s both`,
                            }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8' }}>
                          {count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Physician Specialty */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Stethoscope size={14} style={{ color: '#10B981' }} />
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8' }}>
                      BY SPECIALTY
                    </span>
                  </div>
                  <div className="space-y-2">
                    {topSpecialties.map(([label, count], idx) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-24 text-xs truncate" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#CBD5E1' }}>{label}</span>
                        <div className="flex-1 h-2 rounded-full" style={{ background: '#334155' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              background: '#10B981',
                              width: `${(count / maxSpecialty) * 100}%`,
                              animation: `bar-grow 1s ease-out ${idx * 0.1}s both`,
                            }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8' }}>
                          {count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent Transactions Ledger */}
          <div
            className="rounded-2xl border flex-1 flex flex-col min-h-0"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)' }}>
              <div className="flex items-center gap-2">
                <List size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                  RECENT TRANSACTIONS
                </span>
              </div>
              <select
                value={paymentFilter || ''}
                onChange={(e) => setPaymentFilter(e.target.value || null)}
                className="flex items-center gap-1 rounded border px-3 py-1 text-xs"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontFamily: "'JetBrains Mono', monospace" }}
              >
                <option value="">All Types</option>
                {[...new Set(payments.map((p) => p.payment_nature).filter(Boolean))].sort().map((nature) => (
                  <option key={nature} value={nature!}>{nature}</option>
                ))}
              </select>
            </div>

            <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10" style={{ background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(8px)', boxShadow: '0 1px 0 rgba(255,255,255,0.1)' }}>
                  <tr>
                    {['DATE', 'PHYSICIAN', 'SPECIALTY', 'NATURE', 'STATE', 'AMOUNT'].map((h, i) => (
                      <th
                        key={h}
                        className={`p-3 font-medium ${i === 5 ? 'text-right' : 'text-left'}`}
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.filter((p) => !paymentFilter || p.payment_nature === paymentFilter).map((p, idx) => (
                    <tr
                      key={p.id}
                      className="transition-colors hover:bg-white/[0.05]"
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        opacity: 0,
                        animation: `row-fade 0.3s ease-out ${idx * 0.05}s forwards`,
                      }}
                    >
                      <td className="p-3 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.5)' }}>
                        {fmtDate(p.payment_date)}
                      </td>
                      <td className="p-3 text-sm font-medium" style={{ color: '#E2E8F0' }}>
                        {p.physician_name || '\u2014'}
                      </td>
                      <td className="p-3 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {p.physician_specialty || '\u2014'}
                      </td>
                      <td className="p-3">
                        {p.payment_nature && (
                          <span
                            className="rounded border px-2 py-0.5 text-xs"
                            style={{ background: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.3)', color: '#93C5FD', fontFamily: "'JetBrains Mono', monospace" }}
                          >
                            {p.payment_nature}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                        {p.state || '\u2014'}
                      </td>
                      <td className="p-3 text-right text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E2E8F0' }}>
                        {p.amount != null ? fmtDollar(p.amount) : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {payments.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No payment records found.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bar-grow {
          from { width: 0%; }
        }
        @keyframes row-fade {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// -- Shared Components --

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DC2626] border-t-transparent" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-xl border" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
      <Activity size={48} style={{ color: 'rgba(255,255,255,0.1)' }} className="mb-4" />
      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{text}</p>
    </div>
  );
}

// -- Lobbying Tab --

function LobbyingTab({ companyId }: { companyId: string }) {
  const [filings, setFilings] = useState<HealthLobbyingFiling[]>([]);
  const [summary, setSummary] = useState<HealthLobbySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getHealthCompanyLobbying(companyId, { limit: 50 }),
      getHealthCompanyLobbySummary(companyId),
    ])
      .then(([lobbyRes, sumRes]) => { setFilings(lobbyRes.filings || []); setSummary(sumRes); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Total Filings</p>
            <p className="text-2xl font-bold text-white font-mono">{summary.total_filings.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Total Spend</p>
            <p className="text-2xl font-bold text-white font-mono">{fmtDollar(summary.total_income)}</p>
          </div>
        </div>
      )}
      {filings.length === 0 ? (
        <EmptyState text="No lobbying filings found" />
      ) : (
        <div className="space-y-3">
          {filings.map((f) => (
            <div key={f.id} className="rounded-xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-white">{f.registrant_name || 'Unknown Firm'}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{f.filing_period} {f.filing_year}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold font-mono text-emerald-400">{fmtDollar(f.income || 0)}</p>
                </div>
              </div>
              {f.lobbying_issues && (
                <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span className="font-semibold">Issues:</span> {f.lobbying_issues}
                </p>
              )}
              {f.government_entities && (
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  <span className="font-semibold">Entities:</span> {f.government_entities}
                </p>
              )}
              {f.filing_uuid && (
                <a href={`https://lda.senate.gov/filings/filing/${f.filing_uuid}/`} target="_blank" rel="noopener noreferrer" className="text-xs text-red-400 hover:underline mt-2 inline-flex items-center gap-1">
                  <ExternalLink size={10} /> Senate LDA Filing
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Contracts Tab --

function ContractsTab({ companyId }: { companyId: string }) {
  const [contracts, setContracts] = useState<HealthContractItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHealthCompanyContracts(companyId, { limit: 50 })
      .then((res) => setContracts(res.contracts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <LoadingSpinner />;
  if (contracts.length === 0) return <EmptyState text="No government contracts found" />;

  return (
    <div className="space-y-3">
      {contracts.map((ct) => (
        <div key={ct.id} className="rounded-xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 mr-4">
              <p className="text-sm font-bold text-white line-clamp-2">{ct.description || 'Government Contract'}</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{ct.awarding_agency || 'Unknown Agency'}</p>
            </div>
            <p className="text-lg font-bold font-mono text-emerald-400 shrink-0">{fmtDollar(ct.award_amount || 0)}</p>
          </div>
          <div className="flex items-center gap-4 mt-2">
            {ct.start_date && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{fmtDate(ct.start_date)} — {ct.end_date ? fmtDate(ct.end_date) : 'Ongoing'}</span>}
            {ct.contract_type && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>{ct.contract_type}</span>}
          </div>
          {ct.award_id && (
            <a href={`https://www.usaspending.gov/award/${ct.award_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-red-400 hover:underline mt-2 inline-flex items-center gap-1">
              <ExternalLink size={10} /> USASpending
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// -- Enforcement Tab --

function EnforcementTab({ companyId }: { companyId: string }) {
  const [actions, setActions] = useState<HealthEnforcementAction[]>([]);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHealthCompanyEnforcement(companyId, { limit: 50 })
      .then((res) => { setActions(res.actions || []); setTotalPenalties(res.total_penalties || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <LoadingSpinner />;
  if (actions.length === 0) return <EmptyState text="No enforcement actions found" />;

  return (
    <div className="space-y-4">
      {totalPenalties > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.1)' }}>
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Total Penalties</p>
          <p className="text-2xl font-bold font-mono text-red-400">{fmtDollar(totalPenalties)}</p>
        </div>
      )}
      <div className="space-y-3">
        {actions.map((a) => (
          <div key={a.id} className="rounded-xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 mr-4">
                <p className="text-sm font-bold text-white line-clamp-2">{a.case_title}</p>
                <div className="flex items-center gap-2 mt-1">
                  {a.source && <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(220,38,38,0.2)', color: '#FCA5A5' }}>{a.source}</span>}
                  {a.enforcement_type && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{a.enforcement_type}</span>}
                </div>
              </div>
              {(a.penalty_amount || 0) > 0 && (
                <p className="text-lg font-bold font-mono text-red-400 shrink-0">{fmtDollar(a.penalty_amount || 0)}</p>
              )}
            </div>
            {a.case_date && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{fmtDate(a.case_date)}</p>}
            {a.description && <p className="text-xs mt-2 line-clamp-3" style={{ color: 'rgba(255,255,255,0.5)' }}>{a.description}</p>}
            {a.case_url && (
              <a href={a.case_url} target="_blank" rel="noopener noreferrer" className="text-xs text-red-400 hover:underline mt-2 inline-flex items-center gap-1">
                <ExternalLink size={10} /> View Source
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Main Page --

export default function HealthCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('lobbying');
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    getHealthCompanyDetail(companyId)
      .then((d) => { if (!cancelled) setCompany(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    // Fetch trends
    fetch(`${getApiBaseUrl()}/health/companies/${encodeURIComponent(companyId)}/trends`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled && d) setTrends(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [companyId]);

  if (loading || !company) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DC2626] border-t-transparent" />
      </div>
    );
  }

  const seriousPct = company.adverse_event_count > 0
    ? Math.round((company.serious_event_count / company.adverse_event_count) * 100)
    : 0;

  return (
    <div className="flex flex-col w-full h-screen relative">
      <div className="relative z-10 px-6 pt-4 shrink-0">
        <HealthSectorHeader />
        <div className="mb-2">
          <BackButton to="/health/companies" label="Companies" />
        </div>
      </div>
      {/* Top Bar — Patient Chart Style */}
      <div
        className="w-full px-6 py-3 flex items-center justify-between shrink-0 z-10 shadow-md"
        style={{ background: '#DC2626' }}
      >
        <div className="flex items-center gap-6">
          {[
            ['ENTITY', company.display_name],
            ['SECTOR', (company.sector_type || '').toUpperCase()],
            ['CIK', company.sec_cik || '\u2014'],
            ['AE COUNT', company.adverse_event_count.toLocaleString()],
          ].map(([label, value]) => (
            <span key={label} className="text-sm tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span className="text-white/70">{label}: </span>
              <span className="text-white font-bold">{value}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <ShareButton url={window.location.href} title={`${company.display_name} — WeThePeople`} />
          <Activity size={24} className="text-white animate-pulse" />
        </div>
      </div>

      {/* Main Content: Sidebar + Data */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar */}
        <div
          className="hidden md:flex flex-col w-[30%] lg:w-[25%] border-r p-8 overflow-y-auto shrink-0"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
        >
          {/* Logo */}
          <div className="mb-6 flex justify-center">
            <CompanyLogo
              id={company.company_id}
              name={company.display_name}
              logoUrl={company.logo_url}
              localLogos={LOCAL_LOGOS}
              size={128}
              iconFallback
              className="rounded-2xl"
            />
          </div>

          {/* Name */}
          <div className="flex items-center justify-center gap-3">
            <h2
              className="text-4xl font-bold leading-tight mb-1 text-center"
              style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0' }}
            >
              {company.display_name}
            </h2>
            <WatchlistButton entityType="company" entityId={company.company_id || companyId || ""} entityName={company.display_name} sector="health" />
          </div>
          {company.headquarters && (
            <p className="text-sm text-center mb-6" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
              {company.headquarters}
            </p>
          )}

          {(company as any).ai_profile_summary && (
            <div className="mb-6">
              <span className="text-zinc-500 text-xs uppercase tracking-wider">AI Analysis</span>
              <p className="text-zinc-400 text-sm mt-1">{(company as any).ai_profile_summary}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-6">
            {[
              ['TICKER', company.ticker],
              ['SECTOR', company.sector_type],
              ['SEC CIK', company.sec_cik],
              ['FDA NAME', company.fda_manufacturer_name],
              ['CT SPONSOR', company.ct_sponsor_name],
            ].map(([label, value]) => value ? (
              <div key={label}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>{label}</p>
                <p className="text-sm font-medium" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E2E8F0' }}>{value}</p>
              </div>
            ) : null)}
          </div>

          {/* Risk Level */}
          <div className="mt-auto pt-8">
            <div className="rounded-xl border p-4" style={{ background: 'rgba(220,38,38,0.1)', borderColor: 'rgba(220,38,38,0.3)' }}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} style={{ color: '#FCA5A5' }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#FCA5A5' }}>
                  RISK LEVEL
                </span>
              </div>
              <div className="w-full h-2 rounded-full mb-2" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ background: '#DC2626', width: `${Math.min(seriousPct, 100)}%` }}
                />
              </div>
              <p className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#FCA5A5' }}>
                {seriousPct}% SERIOUS EVENTS
              </p>
            </div>
          </div>

          {/* Activity Over Time */}
          {trends && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-wider mb-3" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                Activity Over Time
              </p>
              <TrendChart data={trends} height={100} />
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col min-h-0" style={{ background: 'transparent' }}>
          {/* Tabs */}
          <div className="relative flex gap-8 border-b px-8 pt-4 shrink-0" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const count = tab.key === 'recalls' ? company.recall_count
                : tab.key === 'trials' ? company.trial_count
                : tab.key === 'payments' ? company.payment_count + company.filing_count
                : 0; // lobbying/contracts/enforcement counts loaded lazily

              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="relative pb-4 cursor-pointer bg-transparent border-0"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '14px',
                    color: isActive ? '#DC2626' : 'rgba(255,255,255,0.4)',
                    fontWeight: isActive ? 700 : 400,
                  }}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className="ml-2 rounded-full px-2 py-0.5 text-xs"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}
                    >
                      {count.toLocaleString()}
                    </span>
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-1 rounded-full"
                      style={{ background: '#DC2626' }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-8" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'lobbying' && <LobbyingTab companyId={company.company_id} />}
                {activeTab === 'contracts' && <ContractsTab companyId={company.company_id} />}
                {activeTab === 'enforcement' && <EnforcementTab companyId={company.company_id} />}
                {/* Adverse Events tab hidden from UI — data kept in backend */}
                {/* {activeTab === 'adverse' && <AdverseEventsTab companyId={company.company_id} />} */}
                {activeTab === 'recalls' && <RecallsTab companyId={company.company_id} />}
                {activeTab === 'trials' && <TrialsTab companyId={company.company_id} />}
                {activeTab === 'payments' && <PaymentsFilingsTab companyId={company.company_id} company={company} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
