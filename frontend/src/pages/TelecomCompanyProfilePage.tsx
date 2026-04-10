import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Building2, FileText, Landmark, Shield, Scale, TrendingUp,
  Calendar, Hash, ExternalLink, AlertTriangle, Heart,
  type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SpotlightCard from '../components/SpotlightCard';
import CompanyLogo from '../components/CompanyLogo';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import { TelecomSectorHeader } from '../components/SectorHeader';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';
import { getApiBaseUrl } from '../api/client';
import SanctionsBadge from '../components/SanctionsBadge';
import AnomalyBadge from '../components/AnomalyBadge';
import TrendChart from '../components/TrendChart';
import ShareButton from '../components/ShareButton';
import WatchlistButton from '../components/WatchlistButton';
import {
  getTelecomCompanyDetail,
  getTelecomCompanyContracts,
  getTelecomCompanyContractSummary,
  getTelecomCompanyLobbying,
  getTelecomCompanyLobbySummary,
  getTelecomCompanyEnforcement,
  getTelecomCompanyFilings,
  getTelecomCompanyDonations,
  getTelecomCompanyStock,
  type TelecomCompanyDetail,
  type TelecomContractItem,
  type TelecomContractSummary,
  type TelecomLobbyingItem,
  type TelecomLobbySummary,
  type TelecomEnforcementItem,
  type TelecomFilingItem,
  type TelecomDonationItem,
  type TelecomStockData,
} from '../api/telecom';

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return `${(n * 100).toFixed(2)}%`;
}

// ── Sub-components ──

function MetricCard({ label, value, icon: Icon, color = '#06B6D4' }: { label: string; value: string; icon: LucideIcon; color?: string }) {
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
        <Icon size={20} className="text-cyan-500" />
        <h2 className="font-heading text-xl font-bold uppercase text-white">{title}</h2>
      </div>
      {count !== undefined && (
        <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-white/60">{count}</span>
      )}
    </div>
  );
}

// ── Tab config ──

type TabKey = 'contracts' | 'lobbying' | 'enforcement' | 'donations' | 'filings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'contracts', label: 'Contracts' },
  { key: 'lobbying', label: 'Lobbying' },
  { key: 'enforcement', label: 'Enforcement' },
  { key: 'donations', label: 'Donations' },
  { key: 'filings', label: 'SEC Filings' },
];

// ── Page ──

export default function TelecomCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('contracts');

  const [detail, setDetail] = useState<TelecomCompanyDetail | null>(null);
  const [stock, setStock] = useState<TelecomStockData['latest_stock']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lazy-loaded tab data
  const [contracts, setContracts] = useState<TelecomContractItem[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [contractSummary, setContractSummary] = useState<TelecomContractSummary | null>(null);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  const [lobbying, setLobbying] = useState<TelecomLobbyingItem[]>([]);
  const [lobbyTotal, setLobbyTotal] = useState(0);
  const [lobbySummary, setLobbySummary] = useState<TelecomLobbySummary | null>(null);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);

  const [enforcement, setEnforcement] = useState<TelecomEnforcementItem[]>([]);
  const [enforcementTotal, setEnforcementTotal] = useState(0);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);

  const [donations, setDonations] = useState<TelecomDonationItem[]>([]);
  const [donationTotal, setDonationTotal] = useState(0);
  const [donationsLoaded, setDonationsLoaded] = useState(false);

  const [filings, setFilings] = useState<TelecomFilingItem[]>([]);
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
      getTelecomCompanyDetail(companyId),
      getTelecomCompanyStock(companyId).catch(() => ({ latest_stock: null })),
    ])
      .then(([d, s]) => {
        if (cancelled) return;
        setDetail(d);
        setStock(s.latest_stock || null);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    // Fetch trends
    fetch(`${getApiBaseUrl()}/telecom/companies/${encodeURIComponent(companyId)}/trends`)
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
        getTelecomCompanyContracts(companyId, { limit: 100 }),
        getTelecomCompanyContractSummary(companyId).catch(() => null),
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
        getTelecomCompanyLobbying(companyId, { limit: 100 }),
        getTelecomCompanyLobbySummary(companyId).catch(() => null),
      ])
        .then(([l, s]) => {
          setLobbying(l.filings || []); setLobbyTotal(l.total);
          if (s) setLobbySummary(s);
          setLobbyingLoaded(true);
        })
        .catch(() => {});
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getTelecomCompanyEnforcement(companyId, { limit: 100 })
        .then((r) => {
          setEnforcement(r.actions || []); setEnforcementTotal(r.total);
          setTotalPenalties(r.total_penalties || 0);
          setEnforcementLoaded(true);
        })
        .catch(() => {});
    }
    if (activeTab === 'donations' && !donationsLoaded) {
      getTelecomCompanyDonations(companyId, { limit: 100 })
        .then((r) => {
          setDonations(r.donations || []); setDonationTotal(r.total);
          setDonationsLoaded(true);
        })
        .catch(() => {});
    }
    if (activeTab === 'filings' && !filingsLoaded) {
      getTelecomCompanyFilings(companyId, { limit: 100 })
        .then((r) => { setFilings(r.filings || []); setFilingTotal(r.total); setFilingsLoaded(true); })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, companyId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="font-body text-lg text-red-400">{error || 'Company not found.'}</p>
        <Link to="/telecom/companies" className="font-body text-sm text-white/50 hover:text-white no-underline">
          &larr; Back to Companies
        </Link>
      </div>
    );
  }

  const stk = stock || detail.latest_stock;

  const ACCENT = '#06B6D4';

  return (
    <div className="flex flex-col w-full h-screen relative">
      <div className="relative z-10 px-6 pt-4 shrink-0">
        <TelecomSectorHeader />
        <div className="mb-2">
          <Breadcrumbs items={[
            { label: 'Telecommunications', to: '/telecom' },
            { label: 'Companies', to: '/telecom/companies' },
            { label: detail.display_name },
          ]} />
        </div>
      </div>

      {/* Top Bar */}
      <div className="w-full px-6 py-3 flex items-center justify-between shrink-0 z-10 shadow-md" style={{ background: ACCENT }}>
        <div className="flex items-center gap-6">
          {[
            ['ENTITY', detail.display_name],
            ['SECTOR', (detail.sector_type || '').replace(/_/g, ' ').toUpperCase()],
            ['CIK', detail.sec_cik || '\u2014'],
          ].map(([label, value]) => (
            <span key={label} className="text-sm tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span className="text-white/70">{label}: </span>
              <span className="text-white font-bold">{value}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <ShareButton url={window.location.href} title={`${detail.display_name} — WeThePeople`} />
        </div>
      </div>

      {/* Main Content: Sidebar + Data */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar */}
        <div className="hidden md:flex flex-col w-[30%] lg:w-[25%] border-r p-8 overflow-y-auto shrink-0" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
          <div className="mb-6 flex justify-center">
            <CompanyLogo id={detail.company_id} name={detail.display_name} logoUrl={detail.logo_url} size={128} iconFallback className="rounded-2xl" />
          </div>
          <div className="flex items-center justify-center gap-3 mb-1">
            <h1 className="text-3xl font-bold leading-tight text-center" style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0' }}>{detail.display_name}</h1>
            <WatchlistButton entityType="company" entityId={detail.company_id || companyId || ""} entityName={detail.display_name} sector="telecom" />
          </div>
          {detail.headquarters && (
            <p className="text-sm text-center mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>{detail.headquarters}</p>
          )}
          <div className="flex justify-center gap-2 mb-6">
            {detail.ticker && <span className="rounded bg-cyan-500/20 px-3 py-1 font-mono text-sm font-bold text-cyan-400">{detail.ticker}</span>}
            <SanctionsBadge status={detail.sanctions_status} />
            <AnomalyBadge entityType="company" entityId={companyId || ''} />
          </div>

          {(detail as any).ai_profile_summary && (
            <div className="mb-6">
              <span className="text-zinc-500 text-xs uppercase tracking-wider">AI Analysis</span>
              <p className="text-zinc-400 text-sm mt-1">{(detail as any).ai_profile_summary}</p>
            </div>
          )}

          <div className="space-y-6">
            {[['TICKER', detail.ticker], ['SECTOR', detail.sector_type?.replace(/_/g, ' ').toUpperCase()], ['SEC CIK', detail.sec_cik]].map(([label, value]) => value ? (
              <div key={label}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>{label}</p>
                <p className="text-sm font-medium" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E2E8F0' }}>{value}</p>
              </div>
            ) : null)}
          </div>

          {stk && (
            <div className="mt-6 space-y-3">
              <p className="text-xs uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>MARKET DATA</p>
              {stk.market_cap != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Market Cap</p><p className="font-mono text-lg text-white">{fmtDollar(stk.market_cap)}</p></div>}
              {stk.pe_ratio != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>P/E Ratio</p><p className="font-mono text-sm text-white">{stk.pe_ratio.toFixed(2)}</p></div>}
              {stk.eps != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>EPS</p><p className="font-mono text-sm text-white">${stk.eps.toFixed(2)}</p></div>}
              {stk.profit_margin != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Profit Margin</p><p className="font-mono text-sm text-white">{fmtPct(stk.profit_margin)}</p></div>}
            </div>
          )}

          <div className="mt-6 rounded-xl border p-4" style={{ background: `${ACCENT}10`, borderColor: `${ACCENT}30` }}>
            <div className="flex items-center gap-2 mb-3">
              <Heart size={16} style={{ color: ACCENT }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: ACCENT }}>OVERVIEW</span>
            </div>
            <div className="space-y-2 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <div className="flex justify-between"><span className="text-white/50">Contracts</span><span className="text-white font-bold">{fmtNum(detail.contract_count)}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Value</span><span className="text-white font-bold">{fmtDollar(detail.total_contract_value)}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Penalties</span><span className="text-white font-bold">{fmtDollar(detail.total_penalties)}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Enforcement</span><span className="text-white font-bold">{fmtNum(detail.enforcement_count)}</span></div>
              <div className="flex justify-between"><span className="text-white/50">SEC Filings</span><span className="text-white font-bold">{fmtNum(detail.filing_count)}</span></div>
            </div>
          </div>

          {trends && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-wider mb-3" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>Activity Over Time</p>
              <TrendChart data={trends} height={120} />
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative flex gap-8 border-b px-8 pt-4 shrink-0" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            {TABS.map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} className="relative pb-4 cursor-pointer bg-transparent border-0" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '14px', color: activeTab === tab.key ? ACCENT : 'rgba(255,255,255,0.4)', fontWeight: activeTab === tab.key ? 700 : 400 }}>
                {tab.label}
                {activeTab === tab.key && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 rounded-full" style={{ background: ACCENT }} />}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-8" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>

          {/* CONTRACTS */}
          {activeTab === 'contracts' && (
            <>
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
            </>
          )}

          {/* LOBBYING */}
          {activeTab === 'lobbying' && (
            <>
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
            </>
          )}

          {/* ENFORCEMENT */}
          {activeTab === 'enforcement' && (
            <>
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
            </>
          )}

          {/* DONATIONS */}
          {activeTab === 'donations' && (
            <>
              <SectionHeader title="Political Donations" icon={Heart} count={donationTotal} />
              {!donationsLoaded ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#EC4899] border-t-transparent" />
                </div>
              ) : donations.length === 0 ? (
                <p className="text-center text-white/40 py-12">No donation records found.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {donations.map((d) => (
                    <div key={d.id} className="group rounded-lg border border-transparent bg-white/[0.03] p-5 transition-all hover:bg-white/[0.06] hover:border-white/10">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-base font-medium text-white mb-1">
                            {d.recipient_name || 'Political Donation'}
                          </p>
                          <div className="flex items-center gap-4 flex-wrap">
                            {d.amount != null && (
                              <span className="font-mono text-sm font-bold text-[#EC4899]">{fmtDollar(d.amount)}</span>
                            )}
                            {d.party && (
                              <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${d.party === 'DEM' ? 'bg-blue-500/10 text-blue-400' : d.party === 'REP' ? 'bg-red-500/10 text-red-400' : 'bg-white/10 text-white/50'}`}>
                                {d.party}
                              </span>
                            )}
                            {d.contributor_name && (
                              <span className="font-mono text-xs text-white/40">{d.contributor_name}</span>
                            )}
                            {d.date && (
                              <span className="flex items-center gap-1 font-mono text-xs text-white/40">
                                <Calendar size={12} />{fmtDate(d.date)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* SEC FILINGS */}
          {activeTab === 'filings' && (
            <>
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
            </>
          )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
