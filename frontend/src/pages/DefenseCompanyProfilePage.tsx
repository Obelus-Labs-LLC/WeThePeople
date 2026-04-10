import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Building2, FileText, Landmark, Shield, Scale, TrendingUp,
  Calendar, Hash, ExternalLink, Newspaper, DollarSign,
  type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SpotlightCard from '../components/SpotlightCard';
import CompanyLogo from '../components/CompanyLogo';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import TrendChart from '../components/TrendChart';
import SpendingChart from '../components/SpendingChart';
import { DefenseSectorHeader } from '../components/SectorHeader';
import { getApiBaseUrl } from '../api/client';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';
import SanctionsBadge from '../components/SanctionsBadge';
import AnomalyBadge from '../components/AnomalyBadge';
import ShareButton from '../components/ShareButton';
import WatchlistButton from '../components/WatchlistButton';
import {
  getDefenseCompanyDetail,
  getDefenseCompanyContracts,
  getDefenseCompanyContractSummary,
  getDefenseCompanyLobbying,
  getDefenseCompanyLobbySummary,
  getDefenseCompanyEnforcement,
  getDefenseCompanyFilings,
  getDefenseCompanyStock,
  getDefenseCompanyDonations,
  getDefenseCompanyNews,
  type DefenseCompanyDetail,
  type DefenseContractItem,
  type DefenseContractSummary,
  type DefenseLobbyingItem,
  type DefenseLobbySummary,
  type DefenseEnforcementItem,
  type DefenseFilingItem,
  type DefenseStockData,
  type DefenseDonationItem,
  type DefenseNewsItem,
} from '../api/defense';

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return `${(n * 100).toFixed(2)}%`;
}

// -- Sub-components --

function MetricCard({ label, value, icon: Icon, color = '#DC2626' }: { label: string; value: string; icon: LucideIcon; color?: string }) {
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
        <Icon size={20} className="text-red-500" />
        <h2 className="font-heading text-xl font-bold uppercase text-white">{title}</h2>
      </div>
      {count !== undefined && (
        <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-white/60">{count}</span>
      )}
    </div>
  );
}

// -- Tab config --

type TabKey = 'contracts' | 'lobbying' | 'enforcement' | 'donations' | 'filings' | 'news';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'contracts', label: 'Contracts' },
  { key: 'lobbying', label: 'Lobbying' },
  { key: 'enforcement', label: 'Enforcement' },
  { key: 'donations', label: 'Donations' },
  { key: 'filings', label: 'SEC Filings' },
  { key: 'news', label: 'News' },
];

// -- Page --

export default function DefenseCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('contracts');

  const [detail, setDetail] = useState<DefenseCompanyDetail | null>(null);
  const [stock, setStock] = useState<DefenseStockData['latest_stock']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lazy-loaded tab data
  const [contracts, setContracts] = useState<DefenseContractItem[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [contractSummary, setContractSummary] = useState<DefenseContractSummary | null>(null);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  const [lobbying, setLobbying] = useState<DefenseLobbyingItem[]>([]);
  const [lobbyTotal, setLobbyTotal] = useState(0);
  const [lobbySummary, setLobbySummary] = useState<DefenseLobbySummary | null>(null);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);

  const [enforcement, setEnforcement] = useState<DefenseEnforcementItem[]>([]);
  const [enforcementTotal, setEnforcementTotal] = useState(0);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);

  const [filings, setFilings] = useState<DefenseFilingItem[]>([]);
  const [filingTotal, setFilingTotal] = useState(0);
  const [filingsLoaded, setFilingsLoaded] = useState(false);

  const [donations, setDonations] = useState<DefenseDonationItem[]>([]);
  const [donationTotal, setDonationTotal] = useState(0);
  const [donationTotalAmount, setDonationTotalAmount] = useState(0);
  const [donationsLoaded, setDonationsLoaded] = useState(false);

  const [news, setNews] = useState<DefenseNewsItem[]>([]);
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  // Load overview on mount
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getDefenseCompanyDetail(companyId),
      getDefenseCompanyStock(companyId).catch(() => ({ latest_stock: null })),
    ])
      .then(([d, s]) => {
        setDetail(d);
        setStock(s.latest_stock || null);
        getDefenseCompanyNews(d.display_name, 5)
          .then((r) => setNews(r.articles || []))
          .catch(() => {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // Fetch trends
    fetch(`${getApiBaseUrl()}/defense/companies/${encodeURIComponent(companyId)}/trends`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setTrends(d); })
      .catch(() => {});
  }, [companyId]);

  // Lazy load tab data
  useEffect(() => {
    if (!companyId) return;

    if (activeTab === 'contracts' && !contractsLoaded) {
      Promise.all([
        getDefenseCompanyContracts(companyId, { limit: 100 }),
        getDefenseCompanyContractSummary(companyId).catch(() => null),
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
        getDefenseCompanyLobbying(companyId, { limit: 100 }),
        getDefenseCompanyLobbySummary(companyId).catch(() => null),
      ])
        .then(([l, s]) => {
          setLobbying(l.filings || []); setLobbyTotal(l.total);
          if (s) setLobbySummary(s);
          setLobbyingLoaded(true);
        })
        .catch(() => {});
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getDefenseCompanyEnforcement(companyId, { limit: 100 })
        .then((r) => {
          setEnforcement(r.actions || []); setEnforcementTotal(r.total);
          setTotalPenalties(r.total_penalties || 0);
          setEnforcementLoaded(true);
        })
        .catch(() => {});
    }
    if (activeTab === 'filings' && !filingsLoaded) {
      getDefenseCompanyFilings(companyId, { limit: 100 })
        .then((r) => { setFilings(r.filings || []); setFilingTotal(r.total); setFilingsLoaded(true); })
        .catch(() => {});
    }
    if (activeTab === 'donations' && !donationsLoaded) {
      getDefenseCompanyDonations(companyId, { limit: 100 })
        .then((r) => { setDonations(r.donations || []); setDonationTotal(r.total); setDonationTotalAmount(r.total_amount || 0); setDonationsLoaded(true); })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, companyId]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" /></div>
  );
  if (error || !detail) return (
    <div className="flex h-screen items-center justify-center"><div className="text-center">
      <p className="text-lg text-red-400">Failed to load company</p>
      <p className="text-sm text-white/40 mt-1">{error}</p>
      <Link to="/defense/companies" className="mt-4 inline-block text-sm text-red-400 underline">Back to directory</Link>
    </div></div>
  );

  const ACCENT = '#DC2626';

  return (
    <div className="flex flex-col w-full h-screen relative">
      <div className="relative z-10 px-6 pt-4 shrink-0">
        <DefenseSectorHeader />
        <div className="mb-2">
          <Breadcrumbs items={[
            { label: 'Defense', to: '/defense' },
            { label: 'Companies', to: '/defense/companies' },
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
            <WatchlistButton entityType="company" entityId={detail.company_id || companyId || ""} entityName={detail.display_name} sector="defense" />
          </div>
          {detail.headquarters && (
            <p className="text-sm text-center mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>{detail.headquarters}</p>
          )}
          <div className="flex justify-center gap-2 mb-6">
            {detail.ticker && <span className="rounded bg-red-500/20 px-3 py-1 font-mono text-sm font-bold text-red-400">{detail.ticker}</span>}
            <SanctionsBadge status={detail.sanctions_status} />
            <AnomalyBadge entityType="company" entityId={detail.company_id} />
          </div>

          {detail.ai_profile_summary && (
            <div className="mb-6">
              <span className="text-zinc-500 text-xs uppercase tracking-wider">AI Analysis</span>
              <p className="text-zinc-400 text-sm mt-1">{detail.ai_profile_summary}</p>
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

          {stock && (
            <div className="mt-6 space-y-3">
              <p className="text-xs uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>MARKET DATA</p>
              {stock.market_cap != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Market Cap</p><p className="font-mono text-lg text-white">{fmtDollar(stock.market_cap)}</p></div>}
              {stock.pe_ratio != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>P/E Ratio</p><p className="font-mono text-sm text-white">{stock.pe_ratio.toFixed(2)}</p></div>}
              {stock.profit_margin != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Profit Margin</p><p className="font-mono text-sm text-white">{fmtPct(stock.profit_margin)}</p></div>}
              {stock.revenue_ttm != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Revenue TTM</p><p className="font-mono text-sm text-white">{fmtDollar(stock.revenue_ttm)}</p></div>}
            </div>
          )}

          <div className="mt-6 rounded-xl border p-4" style={{ background: `${ACCENT}10`, borderColor: `${ACCENT}30` }}>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={16} style={{ color: ACCENT }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: ACCENT }}>OVERVIEW</span>
            </div>
            <div className="space-y-2 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <div className="flex justify-between"><span className="text-white/50">Contracts</span><span className="text-white font-bold">{fmtDollar(detail.total_contract_value)}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Enforcement</span><span className="text-white font-bold">{fmtNum(detail.enforcement_count)}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Lobbying</span><span className="text-white font-bold">{fmtNum(detail.lobbying_count)}</span></div>
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

        {/* Contracts Tab */}
        {activeTab === 'contracts' && (
          <div>
            <SectionHeader title="Government Contracts" icon={Landmark} count={contractTotal} />
            {contractSummary && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-mono text-xs text-white/40 mb-1">Total Value</p>
                  <p className="font-mono text-2xl text-white">{fmtDollar(contractSummary.total_amount)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-mono text-xs text-white/40 mb-1">Total Contracts</p>
                  <p className="font-mono text-2xl text-white">{fmtNum(contractSummary.total_contracts)}</p>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {contracts.map((ct) => (
                <div key={ct.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-body text-sm text-white/90 mb-2">{ct.description || 'Contract Award'}</p>
                  <div className="flex flex-wrap gap-4 text-xs text-white/40 font-mono">
                    {ct.award_amount != null && <span className="text-green-400">{fmtDollar(ct.award_amount)}</span>}
                    {ct.awarding_agency && <span>{ct.awarding_agency}</span>}
                    {ct.start_date && <span>{ct.start_date}</span>}
                  </div>
                </div>
              ))}
              {contracts.length === 0 && <p className="text-center text-white/30 py-8">No contracts found</p>}
            </div>
          </div>
        )}

        {/* Lobbying Tab */}
        {activeTab === 'lobbying' && (
          <div>
            <SectionHeader title="Lobbying Disclosures" icon={DollarSign} count={lobbyTotal} />
            {lobbySummary && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-mono text-xs text-white/40 mb-1">Total Income</p>
                  <p className="font-mono text-2xl text-white">{fmtDollar(lobbySummary.total_income)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-mono text-xs text-white/40 mb-1">Total Filings</p>
                  <p className="font-mono text-2xl text-white">{fmtNum(lobbySummary.total_filings)}</p>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {lobbying.map((r) => (
                <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-body text-sm text-white/90">{r.client_name || r.registrant_name || 'Filing'}</span>
                    <span className="font-mono text-xs text-white/40">{r.filing_year} {r.filing_period}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-white/40 font-mono">
                    {r.income != null && <span className="text-green-400">{fmtDollar(r.income)}</span>}
                    {r.registrant_name && <span>{r.registrant_name}</span>}
                  </div>
                  {r.lobbying_issues && <p className="font-body text-xs text-white/30 mt-2">{r.lobbying_issues}</p>}
                </div>
              ))}
              {lobbying.length === 0 && <p className="text-center text-white/30 py-8">No lobbying filings found</p>}
            </div>
          </div>
        )}

        {/* Enforcement Tab */}
        {activeTab === 'enforcement' && (
          <div>
            <SectionHeader title="Enforcement Actions" icon={Shield} count={enforcementTotal} />
            {totalPenalties > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-6">
                <p className="font-mono text-xs text-white/40 mb-1">Total Penalties</p>
                <p className="font-mono text-2xl text-red-400">{fmtDollar(totalPenalties)}</p>
              </div>
            )}
            <div className="space-y-3">
              {enforcement.map((a) => (
                <div key={a.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-body text-sm text-white/90 mb-2">{a.case_title}</p>
                  <div className="flex flex-wrap gap-4 text-xs text-white/40 font-mono">
                    {a.enforcement_type && <span className="text-red-400">{a.enforcement_type}</span>}
                    {a.penalty_amount != null && a.penalty_amount > 0 && <span className="text-red-400">{fmtDollar(a.penalty_amount)}</span>}
                    {a.source && <span>{a.source}</span>}
                    {a.case_date && <span>{a.case_date}</span>}
                  </div>
                  {a.case_url && <a href={a.case_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-red-400 hover:text-red-300 no-underline"><ExternalLink size={12} /> Source</a>}
                </div>
              ))}
              {enforcement.length === 0 && <p className="text-center text-white/30 py-8">No enforcement actions found</p>}
            </div>
          </div>
        )}

        {/* Donations Tab */}
        {activeTab === 'donations' && (
          <div>
            <SectionHeader title="PAC Donations" icon={DollarSign} count={donationTotal} />
            {donationTotalAmount > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-6">
                <p className="font-mono text-xs text-white/40 mb-1">Total Donated</p>
                <p className="font-mono text-2xl text-white">{fmtDollar(donationTotalAmount)}</p>
              </div>
            )}
            <div className="space-y-3">
              {donations.map((d) => (
                <div key={d.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-body text-sm text-white/90">{d.candidate_name || d.committee_name || 'Donation'}</span>
                    {d.amount != null && <span className="font-mono text-sm text-green-400">{fmtDollar(d.amount)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-white/40 font-mono">
                    {d.committee_name && <span>{d.committee_name}</span>}
                    {d.cycle && <span>Cycle: {d.cycle}</span>}
                    {d.donation_date && <span>{d.donation_date}</span>}
                  </div>
                </div>
              ))}
              {donations.length === 0 && <p className="text-center text-white/30 py-8">No donation records found</p>}
            </div>
          </div>
        )}

        {/* SEC Filings Tab */}
        {activeTab === 'filings' && (
          <div>
            <SectionHeader title="SEC Filings" icon={FileText} count={filingTotal} />
            <div className="space-y-3">
              {filings.map((f) => (
                <div key={f.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="rounded bg-red-500/10 px-2 py-0.5 font-mono text-xs text-red-400">{f.form_type}</span>
                      <span className="font-mono text-xs text-white/40">{f.filing_date}</span>
                    </div>
                    <p className="font-body text-sm text-white/70">{f.description || f.accession_number}</p>
                  </div>
                  {f.primary_doc_url && (
                    <a href={f.primary_doc_url} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:text-red-300">
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              ))}
              {filings.length === 0 && <p className="text-center text-white/30 py-8">No SEC filings found</p>}
            </div>
          </div>
        )}

        {/* News Tab */}
        {activeTab === 'news' && (
          <div>
            <SectionHeader title="Recent News" icon={Newspaper} count={news.length} />
            <div className="space-y-3">
              {news.map((n, i) => (
                <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.05] transition-colors no-underline">
                  <p className="font-body text-sm text-white/90">{n.title}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="font-mono text-xs text-white/40">{n.source}</span>
                    <span className="font-mono text-xs text-white/20">{n.published}</span>
                  </div>
                </a>
              ))}
              {news.length === 0 && <p className="text-center text-white/30 py-8">No news articles found</p>}
            </div>
          </div>
        )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
