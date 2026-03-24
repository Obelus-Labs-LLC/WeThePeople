import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Building2, FileText, Landmark, Shield, Scale, TrendingUp,
  Calendar, Hash, ExternalLink, Newspaper, DollarSign,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import SpotlightCard from '../components/SpotlightCard';
import CompanyLogo from '../components/CompanyLogo';
import BackButton from '../components/BackButton';
import TrendChart from '../components/TrendChart';
import { DefenseSectorHeader } from '../components/SectorHeader';
import { getApiBaseUrl } from '../api/client';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';
import SanctionsBadge from '../components/SanctionsBadge';
import AnomalyBadge from '../components/AnomalyBadge';
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

type TabKey = 'overview' | 'contracts' | 'lobbying' | 'enforcement' | 'donations' | 'filings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'lobbying', label: 'Lobbying' },
  { key: 'enforcement', label: 'Enforcement' },
  { key: 'donations', label: 'Donations' },
  { key: 'filings', label: 'SEC Filings' },
];

// -- Page --

export default function DefenseCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

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

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-10">
        <DefenseSectorHeader />

        {/* Back + header */}
        <div className="mt-6 mb-8">
          <BackButton to="/defense/companies" label="Back to Companies" />
          <div className="flex items-start gap-5 mt-4">
            <CompanyLogo id={detail.company_id} name={detail.display_name} logoUrl={detail.logo_url} size={64} iconFallback />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-heading text-3xl font-bold text-white">{detail.display_name}</h1>
                {detail.ticker && <span className="font-mono text-lg text-white/40">{detail.ticker}</span>}
                <SanctionsBadge status={detail.sanctions_status} />
                <AnomalyBadge entityType="company" entityId={detail.company_id} />
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-white/50">
                <span className="rounded bg-red-500/10 px-2 py-0.5 font-mono text-xs text-red-400 uppercase">{detail.sector_type.replace(/_/g, ' ')}</span>
                {detail.headquarters && <span>{detail.headquarters}</span>}
                {detail.sec_cik && <span className="font-mono text-xs">CIK: {detail.sec_cik}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* AI Summary */}
        {detail.ai_profile_summary && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8 rounded-xl border border-white/10 bg-white/[0.02] p-6">
            <p className="font-body text-sm text-white/70 leading-relaxed">{detail.ai_profile_summary}</p>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10 mb-8 overflow-x-auto">
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 font-body text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab.key ? 'text-red-400 border-b-2 border-red-400' : 'text-white/40 hover:text-white/60'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard label="Gov Contracts" value={fmtDollar(detail.total_contract_value)} icon={Landmark} color="#10B981" />
              <MetricCard label="Enforcement" value={fmtNum(detail.enforcement_count)} icon={Shield} color="#EF4444" />
              <MetricCard label="Lobbying Filings" value={fmtNum(detail.lobbying_count)} icon={DollarSign} />
              <MetricCard label="SEC Filings" value={fmtNum(detail.filing_count)} icon={FileText} color="#3B82F6" />
            </div>

            {/* Stock data */}
            {stock && (
              <div>
                <SectionHeader title="Market Data" icon={TrendingUp} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="font-mono text-xs text-white/40 mb-1">Market Cap</p>
                    <p className="font-mono text-lg text-white">{stock.market_cap ? fmtDollar(stock.market_cap) : '\u2014'}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="font-mono text-xs text-white/40 mb-1">P/E Ratio</p>
                    <p className="font-mono text-lg text-white">{stock.pe_ratio?.toFixed(1) ?? '\u2014'}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="font-mono text-xs text-white/40 mb-1">Profit Margin</p>
                    <p className="font-mono text-lg text-white">{fmtPct(stock.profit_margin)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="font-mono text-xs text-white/40 mb-1">Revenue TTM</p>
                    <p className="font-mono text-lg text-white">{stock.revenue_ttm ? fmtDollar(stock.revenue_ttm) : '\u2014'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* News */}
            {news.length > 0 && (
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
                </div>
              </div>
            )}

            {/* Activity Over Time */}
            {trends && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <SectionHeader title="Activity Over Time" icon={TrendingUp} />
                <TrendChart data={trends} />
              </div>
            )}
          </div>
        )}

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
      </div>
    </div>
  );
}
