import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Building2, FileText, Landmark, Shield, Scale, TrendingUp,
  Calendar, Hash, ExternalLink, AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import SpotlightCard from '../components/SpotlightCard';
import CompanyLogo from '../components/CompanyLogo';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import { AgricultureSectorHeader } from '../components/SectorHeader';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';
import { getApiBaseUrl } from '../api/client';
import SanctionsBadge from '../components/SanctionsBadge';
import AnomalyBadge from '../components/AnomalyBadge';
import TrendChart from '../components/TrendChart';
import ShareButton from '../components/ShareButton';
import WatchlistButton from '../components/WatchlistButton';
import {
  getAgricultureCompanyDetail,
  getAgricultureCompanyContracts,
  getAgricultureCompanyContractSummary,
  getAgricultureCompanyLobbying,
  getAgricultureCompanyLobbySummary,
  getAgricultureCompanyEnforcement,
  getAgricultureCompanyFilings,
  getAgricultureCompanyStock,
  type AgricultureCompanyDetail,
  type AgricultureContractItem,
  type AgricultureContractSummary,
  type AgricultureLobbyingItem,
  type AgricultureLobbySummary,
  type AgricultureEnforcementItem,
  type AgricultureFilingItem,
  type AgricultureStockData,
} from '../api/agriculture';

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return `${(n * 100).toFixed(2)}%`;
}

// ── Sub-components ──

function MetricCard({ label, value, icon: Icon, color = '#0D9488' }: { label: string; value: string; icon: LucideIcon; color?: string }) {
  return (
    <SpotlightCard className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs uppercase tracking-wider text-white/40">{label}</span>
        <Icon size={16} style={{ color }} />
      </div>
      <p className="font-mono text-2xl font-bold text-white">{value}</p>
    </SpotlightCard>
  );
}

function SectionHeader({ title, icon: Icon, count }: { title: string; icon: LucideIcon; count?: number }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
      <div className="flex items-center gap-3">
        <Icon size={20} className="text-lime-500" />
        <h2 className="font-heading text-xl font-bold uppercase text-white">{title}</h2>
      </div>
      {count !== undefined && (
        <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-white/60">{count}</span>
      )}
    </div>
  );
}

// ── Tab config ──

type TabKey = 'overview' | 'contracts' | 'lobbying' | 'enforcement' | 'filings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'lobbying', label: 'Lobbying' },
  { key: 'enforcement', label: 'Enforcement' },
  { key: 'filings', label: 'SEC Filings' },
];

// ── Page ──

export default function AgricultureCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const [detail, setDetail] = useState<AgricultureCompanyDetail | null>(null);
  const [stock, setStock] = useState<AgricultureStockData['latest_stock']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lazy-loaded tab data
  const [contracts, setContracts] = useState<AgricultureContractItem[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [contractSummary, setContractSummary] = useState<AgricultureContractSummary | null>(null);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  const [lobbying, setLobbying] = useState<AgricultureLobbyingItem[]>([]);
  const [lobbyTotal, setLobbyTotal] = useState(0);
  const [lobbySummary, setLobbySummary] = useState<AgricultureLobbySummary | null>(null);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);

  const [enforcement, setEnforcement] = useState<AgricultureEnforcementItem[]>([]);
  const [enforcementTotal, setEnforcementTotal] = useState(0);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);

  const [filings, setFilings] = useState<AgricultureFilingItem[]>([]);
  const [filingTotal, setFilingTotal] = useState(0);
  const [filingsLoaded, setFilingsLoaded] = useState(false);

  // Trends
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  // Load overview on mount
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getAgricultureCompanyDetail(companyId),
      getAgricultureCompanyStock(companyId).catch(() => ({ latest_stock: null })),
    ])
      .then(([d, s]) => {
        if (cancelled) return;
        setDetail(d);
        setStock(s.latest_stock || null);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    // Fetch trends
    fetch(`${getApiBaseUrl()}/agriculture/companies/${encodeURIComponent(companyId)}/trends`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled && d) setTrends(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [companyId]);

  // Lazy load tab data
  useEffect(() => {
    if (!companyId) return;

    if (activeTab === 'contracts' && !contractsLoaded) {
      Promise.all([
        getAgricultureCompanyContracts(companyId, { limit: 100 }),
        getAgricultureCompanyContractSummary(companyId).catch(() => null),
      ])
        .then(([c, s]) => {
          setContracts(c.contracts || []); setContractTotal(c.total);
          if (s) setContractSummary(s);
          setContractsLoaded(true);
        })
        .catch(() => {});
    }
    if (activeTab === 'lobbying' && !lobbyingLoaded) {
      Promise.all([
        getAgricultureCompanyLobbying(companyId, { limit: 100 }),
        getAgricultureCompanyLobbySummary(companyId).catch(() => null),
      ])
        .then(([l, s]) => {
          setLobbying(l.filings || []); setLobbyTotal(l.total);
          if (s) setLobbySummary(s);
          setLobbyingLoaded(true);
        })
        .catch(() => {});
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getAgricultureCompanyEnforcement(companyId, { limit: 100 })
        .then((r) => {
          setEnforcement(r.actions || []); setEnforcementTotal(r.total);
          setTotalPenalties(r.total_penalties || 0);
          setEnforcementLoaded(true);
        })
        .catch(() => {});
    }
    if (activeTab === 'filings' && !filingsLoaded) {
      getAgricultureCompanyFilings(companyId, { limit: 100 })
        .then((r) => { setFilings(r.filings || []); setFilingTotal(r.total); setFilingsLoaded(true); })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, companyId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-lime-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="font-body text-lg text-red-400">{error || 'Company not found.'}</p>
        <Link to="/agriculture/companies" className="font-body text-sm text-white/50 hover:text-white no-underline">
          &larr; Back to Companies
        </Link>
      </div>
    );
  }

  const stk = stock || detail.latest_stock;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden px-8 py-6 lg:px-12">
        <div className="shrink-0">
          <AgricultureSectorHeader />
        </div>
        <div className="mb-4 shrink-0">
          <Breadcrumbs items={[
            { label: 'Agriculture', to: '/agriculture' },
            { label: 'Companies', to: '/agriculture/companies' },
            { label: detail.display_name },
          ]} />
        </div>

        {/* Company Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 flex items-center gap-6 rounded-xl border border-white/10 bg-white/[0.03] p-6 shrink-0"
        >
          <CompanyLogo
            id={detail.company_id}
            name={detail.display_name}
            logoUrl={detail.logo_url}
            size={64}
            iconFallback
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-3xl font-bold uppercase text-white lg:text-4xl xl:text-5xl truncate">
                {detail.display_name}
              </h1>
              <WatchlistButton entityType="company" entityId={detail.company_id || companyId || ""} entityName={detail.display_name} sector="agriculture" />
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              {detail.ticker && (
                <span className="rounded bg-lime-500/20 px-3 py-1 font-mono text-sm font-bold text-lime-400">
                  {detail.ticker}
                </span>
              )}
              <span className="rounded bg-white/10 px-3 py-1 font-mono text-xs uppercase tracking-wider text-white/60">
                {detail.sector_type.replace(/_/g, ' ')}
              </span>
              <SanctionsBadge status={detail.sanctions_status} />
              <AnomalyBadge entityType="company" entityId={companyId || ''} />
              <ShareButton url={window.location.href} title={`${detail.display_name} — WeThePeople`} />
              {detail.headquarters && (
                <span className="font-body text-sm text-white/50">
                  {detail.headquarters}
                </span>
              )}
            </div>
          </div>
          <div className="hidden flex-shrink-0 text-right md:flex flex-col gap-2">
            {stk?.market_cap && (
              <div>
                <p className="font-mono text-xs text-white/40">MARKET CAP</p>
                <p className="font-mono text-lg text-white">{fmtDollar(stk.market_cap)}</p>
              </div>
            )}
            {detail.sec_cik && (
              <div>
                <p className="font-mono text-xs text-white/40">SEC CIK</p>
                <p className="font-mono text-sm text-white/60">{detail.sec_cik}</p>
              </div>
            )}
          </div>
        </motion.div>

        {(detail as any).ai_profile_summary && (
          <div className="mb-6">
            <span className="text-zinc-500 text-xs uppercase tracking-wider">AI Analysis</span>
            <p className="text-zinc-400 text-sm mt-1">{(detail as any).ai_profile_summary}</p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-6 flex gap-1 border-b border-white/10 pb-0 overflow-x-auto shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap px-5 py-3 font-heading text-sm font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
                activeTab === tab.key
                  ? 'text-lime-500 border-lime-500'
                  : 'text-white/40 border-transparent hover:text-white/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="flex flex-col gap-8">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <MetricCard label="Gov Contracts" value={fmtNum(detail.contract_count)} icon={Landmark} color="#3B82F6" />
                <MetricCard label="Contract Value" value={fmtDollar(detail.total_contract_value)} icon={TrendingUp} color="#10B981" />
                <MetricCard label="Total Penalties" value={fmtDollar(detail.total_penalties)} icon={AlertTriangle} color="#EF4444" />
              </div>

              {stk && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                  <SectionHeader title="Market Data" icon={TrendingUp} />
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 lg:grid-cols-4">
                    {stk.market_cap != null && <div><p className="font-mono text-xs text-white/40 mb-1">Market Cap</p><p className="font-mono text-lg text-white">{fmtDollar(stk.market_cap)}</p></div>}
                    {stk.pe_ratio != null && <div><p className="font-mono text-xs text-white/40 mb-1">P/E Ratio</p><p className="font-mono text-lg text-white">{stk.pe_ratio.toFixed(2)}</p></div>}
                    {stk.eps != null && <div><p className="font-mono text-xs text-white/40 mb-1">EPS</p><p className="font-mono text-lg text-white">${stk.eps.toFixed(2)}</p></div>}
                    {stk.profit_margin != null && <div><p className="font-mono text-xs text-white/40 mb-1">Profit Margin</p><p className="font-mono text-lg text-white">{fmtPct(stk.profit_margin)}</p></div>}
                    {stk.dividend_yield != null && <div><p className="font-mono text-xs text-white/40 mb-1">Dividend Yield</p><p className="font-mono text-lg text-white">{fmtPct(stk.dividend_yield)}</p></div>}
                    {stk.week_52_high != null && <div><p className="font-mono text-xs text-white/40 mb-1">52W High</p><p className="font-mono text-lg text-white">${stk.week_52_high.toFixed(2)}</p></div>}
                    {stk.week_52_low != null && <div><p className="font-mono text-xs text-white/40 mb-1">52W Low</p><p className="font-mono text-lg text-white">${stk.week_52_low.toFixed(2)}</p></div>}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {detail.contract_count > 0 && (
                  <button onClick={() => setActiveTab('contracts')} className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors hover:bg-white/[0.06]">
                    <Landmark size={20} className="text-[#3B82F6] mb-2" />
                    <p className="font-heading text-sm font-bold uppercase text-white">{detail.contract_count} Contracts</p>
                    <p className="font-body text-xs text-white/40 mt-1">Government contracts via USASpending</p>
                  </button>
                )}
                {detail.filing_count > 0 && (
                  <button onClick={() => setActiveTab('filings')} className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors hover:bg-white/[0.06]">
                    <Scale size={20} className="text-[#EF4444] mb-2" />
                    <p className="font-heading text-sm font-bold uppercase text-white">{detail.filing_count} SEC Filings</p>
                    <p className="font-body text-xs text-white/40 mt-1">Regulatory filings via EDGAR</p>
                  </button>
                )}
                {detail.enforcement_count > 0 && (
                  <button onClick={() => setActiveTab('enforcement')} className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors hover:bg-white/[0.06]">
                    <AlertTriangle size={20} className="text-[#EF4444] mb-2" />
                    <p className="font-heading text-sm font-bold uppercase text-white">{detail.enforcement_count} Enforcement Actions</p>
                    <p className="font-body text-xs text-white/40 mt-1">EPA enforcement data</p>
                  </button>
                )}
              </div>

              {/* Activity Over Time */}
              {trends && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                  <SectionHeader title="Activity Over Time" icon={TrendingUp} />
                  <TrendChart data={trends} />
                </div>
              )}
            </motion.div>
          )}

          {/* CONTRACTS */}
          {activeTab === 'contracts' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
              {contractSummary && (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 mb-8">
                  <MetricCard label="Total Contracts" value={fmtNum(contractSummary.total_contracts)} icon={Landmark} color="#3B82F6" />
                  <MetricCard label="Total Value" value={fmtDollar(contractSummary.total_amount)} icon={TrendingUp} color="#10B981" />
                  <MetricCard label="Agencies" value={fmtNum(Object.keys(contractSummary.by_agency).length)} icon={Building2} color="#F59E0B" />
                </div>
              )}

              {contractSummary && Object.keys(contractSummary.by_agency).length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 mb-8">
                  <h2 className="font-heading text-sm font-bold uppercase text-white/60 mb-4">By Awarding Agency</h2>
                  <div className="flex flex-col gap-2">
                    {Object.entries(contractSummary.by_agency)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 8)
                      .map(([agency, count]) => (
                        <div key={agency} className="flex items-center justify-between gap-4">
                          <span className="font-body text-sm text-white/70 truncate flex-1">{agency}</span>
                          <span className="font-mono text-sm text-white/50 shrink-0">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <SectionHeader title="Contracts" icon={Landmark} count={contractTotal} />
              {!contractsLoaded ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
                </div>
              ) : contracts.length === 0 ? (
                <p className="text-center text-white/40 py-12">No contracts found.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {contracts.map((c) => (
                    <div key={c.id} className="group rounded-lg border border-transparent bg-white/[0.03] p-5 transition-all hover:bg-white/[0.06] hover:border-white/10">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-base font-medium text-white mb-1">
                            {c.description || 'Government Contract'}
                          </p>
                          <div className="flex items-center gap-4 flex-wrap">
                            {c.award_amount != null && (
                              <span className="font-mono text-sm font-bold text-[#10B981]">{fmtDollar(c.award_amount)}</span>
                            )}
                            {c.awarding_agency && (
                              <span className="font-mono text-xs text-white/40">{c.awarding_agency}</span>
                            )}
                            {c.start_date && (
                              <span className="flex items-center gap-1 font-mono text-xs text-white/40">
                                <Calendar size={12} />{fmtDate(c.start_date)}
                              </span>
                            )}
                            {c.contract_type && (
                              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/50">{c.contract_type}</span>
                            )}
                          </div>
                        </div>
                        {c.award_id && (
                          <a href={`https://www.usaspending.gov/award/${c.award_id}`} target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
                            <ExternalLink size={14} className="text-white" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* LOBBYING */}
          {activeTab === 'lobbying' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
              {lobbySummary && (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 mb-8">
                  <MetricCard label="Total Filings" value={fmtNum(lobbySummary.total_filings)} icon={Scale} color="#8B5CF6" />
                  <MetricCard label="Total Income" value={fmtDollar(lobbySummary.total_income)} icon={TrendingUp} color="#10B981" />
                  <MetricCard label="Lobbying Firms" value={fmtNum(Object.keys(lobbySummary.top_firms).length)} icon={Building2} color="#F59E0B" />
                </div>
              )}

              {lobbySummary && Object.keys(lobbySummary.top_firms).length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 mb-8">
                  <h2 className="font-heading text-sm font-bold uppercase text-white/60 mb-4">Top Lobbying Firms</h2>
                  <div className="flex flex-col gap-3">
                    {Object.entries(lobbySummary.top_firms)
                      .sort(([, a], [, b]) => b.income - a.income)
                      .slice(0, 8)
                      .map(([firm, data]) => (
                        <div key={firm} className="flex items-center justify-between gap-4">
                          <span className="font-body text-sm text-white/70 truncate flex-1">{firm}</span>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="font-mono text-sm text-[#10B981]">{fmtDollar(data.income)}</span>
                            <span className="font-mono text-xs text-white/40">{data.filings} filings</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <SectionHeader title="Lobbying Filings" icon={Scale} count={lobbyTotal} />
              {!lobbyingLoaded ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#8B5CF6] border-t-transparent" />
                </div>
              ) : lobbying.length === 0 ? (
                <p className="text-center text-white/40 py-12">No lobbying filings found.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {lobbying.map((l) => (
                    <div key={l.id} className="group rounded-lg border border-transparent bg-white/[0.03] p-5 transition-all hover:bg-white/[0.06] hover:border-white/10">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-base font-medium text-white mb-1">
                            {l.registrant_name || l.client_name || 'Lobbying Filing'}
                          </p>
                          <div className="flex items-center gap-4 flex-wrap">
                            {l.income != null && l.income > 0 && (
                              <span className="font-mono text-sm font-bold text-[#10B981]">{fmtDollar(l.income)}</span>
                            )}
                            {l.filing_year && (
                              <span className="font-mono text-xs text-white/40">{l.filing_year} {l.filing_period || ''}</span>
                            )}
                          </div>
                          {l.lobbying_issues && (
                            <p className="mt-2 font-body text-sm text-white/50 line-clamp-2">{l.lobbying_issues}</p>
                          )}
                          {l.government_entities && (
                            <p className="mt-1 font-mono text-xs text-white/30">{l.government_entities}</p>
                          )}
                        </div>
                        {l.filing_uuid && (
                          <a href={`https://lda.senate.gov/filings/filing/${l.filing_uuid}/`} target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
                            <ExternalLink size={14} className="text-white" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ENFORCEMENT */}
          {activeTab === 'enforcement' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
              {enforcementLoaded && (
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <MetricCard label="Enforcement Actions" value={fmtNum(enforcementTotal)} icon={AlertTriangle} color="#EF4444" />
                  <MetricCard label="Total Penalties" value={fmtDollar(totalPenalties)} icon={Shield} color="#F59E0B" />
                </div>
              )}

              <SectionHeader title="Enforcement Actions" icon={AlertTriangle} count={enforcementTotal} />
              {!enforcementLoaded ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#EF4444] border-t-transparent" />
                </div>
              ) : enforcement.length === 0 ? (
                <p className="text-center text-white/40 py-12">No enforcement actions found.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {enforcement.map((e) => (
                    <div key={e.id} className="group rounded-lg border border-transparent bg-white/[0.03] p-5 transition-all hover:bg-white/[0.06] hover:border-white/10">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-base font-medium text-white mb-1">
                            {e.case_title || 'Enforcement Action'}
                          </p>
                          <div className="flex items-center gap-4 flex-wrap">
                            {e.penalty_amount != null && e.penalty_amount > 0 && (
                              <span className="font-mono text-sm font-bold text-[#EF4444]">{fmtDollar(e.penalty_amount)}</span>
                            )}
                            {e.enforcement_type && (
                              <span className="rounded bg-red-500/10 px-2 py-0.5 font-mono text-[10px] text-red-400">{e.enforcement_type}</span>
                            )}
                            {e.case_date && (
                              <span className="flex items-center gap-1 font-mono text-xs text-white/40">
                                <Calendar size={12} />{fmtDate(e.case_date)}
                              </span>
                            )}
                            {e.source && (
                              <span className="font-mono text-xs text-white/30">{e.source}</span>
                            )}
                          </div>
                          {e.description && (
                            <p className="mt-2 font-body text-sm text-white/50 line-clamp-3">{e.description}</p>
                          )}
                        </div>
                        {e.case_url && (
                          <a href={e.case_url} target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
                            <ExternalLink size={14} className="text-white" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* SEC FILINGS */}
          {activeTab === 'filings' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
              <SectionHeader title="SEC Filings" icon={FileText} count={filingTotal} />
              {!filingsLoaded ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" />
                </div>
              ) : filings.length === 0 ? (
                <p className="text-center text-white/40 py-12">No SEC filings found.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {filings.map((f) => {
                    const url = f.filing_url || f.primary_doc_url;
                    return (
                      <div key={f.id} className="group flex items-center gap-4 rounded-lg border border-transparent bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06] hover:border-white/10">
                        <div className="flex h-auto w-16 flex-shrink-0 items-center justify-center rounded bg-[rgba(52,211,153,0.1)] px-2 py-2">
                          <span className="font-mono text-sm font-bold text-[#34D399]">{f.form_type || '?'}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-base font-medium text-white truncate mb-1">
                            {f.description || f.accession_number || 'SEC Filing'}
                          </p>
                          <div className="flex items-center gap-4">
                            {f.filing_date && (
                              <span className="flex items-center gap-1 font-mono text-xs text-white/40">
                                <Calendar size={12} />{fmtDate(f.filing_date)}
                              </span>
                            )}
                            {f.accession_number && (
                              <span className="flex items-center gap-1 font-mono text-xs text-white/40">
                                <Hash size={12} />{f.accession_number}
                              </span>
                            )}
                          </div>
                        </div>
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
                            <ExternalLink size={14} className="text-white" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
