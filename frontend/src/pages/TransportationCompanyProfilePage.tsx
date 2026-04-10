import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Building2, FileText, Landmark, Shield, Scale, TrendingUp,
  Calendar, Hash, ExternalLink, AlertTriangle, Car, Newspaper,
  DollarSign, Fuel, Star,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import SpotlightCard from '../components/SpotlightCard';
import CompanyLogo from '../components/CompanyLogo';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import TrendChart from '../components/TrendChart';
import { TransportationSectorHeader } from '../components/SectorHeader';
import { getApiBaseUrl } from '../api/client';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';
import SanctionsBadge from '../components/SanctionsBadge';
import AnomalyBadge from '../components/AnomalyBadge';
import WatchlistButton from '../components/WatchlistButton';
import {
  getTransportationCompanyDetail,
  getTransportationCompanyContracts,
  getTransportationCompanyContractSummary,
  getTransportationCompanyLobbying,
  getTransportationCompanyLobbySummary,
  getTransportationCompanyEnforcement,
  getTransportationCompanyFilings,
  getTransportationCompanyStock,
  getTransportationCompanyRecalls,
  getTransportationCompanyComplaints,
  getTransportationCompanyFuelEconomy,
  getTransportationCompanySafetyRatings,
  getTransportationCompanyDonations,
  getTransportationCompanyNews,
  type TransportationCompanyDetail,
  type TransportationContractItem,
  type TransportationContractSummary,
  type TransportationLobbyingItem,
  type TransportationLobbySummary,
  type TransportationEnforcementItem,
  type TransportationFilingItem,
  type TransportationStockData,
  type TransportationRecallItem,
  type TransportationComplaintItem,
  type TransportationFuelEconomyItem,
  type TransportationSafetyRatingItem,
  type TransportationDonationItem,
  type TransportationNewsItem,
} from '../api/transportation';

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return `${(n * 100).toFixed(2)}%`;
}

// ── Sub-components ──

function MetricCard({ label, value, icon: Icon, color = '#3B82F6' }: { label: string; value: string; icon: LucideIcon; color?: string }) {
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
        <Icon size={20} className="text-blue-500" />
        <h2 className="font-heading text-xl font-bold uppercase text-white">{title}</h2>
      </div>
      {count !== undefined && (
        <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-white/60">{count}</span>
      )}
    </div>
  );
}

// ── Tab config ──

type TabKey = 'overview' | 'contracts' | 'lobbying' | 'enforcement' | 'donations' | 'recalls' | 'complaints' | 'safety_ratings' | 'filings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'lobbying', label: 'Lobbying' },
  { key: 'enforcement', label: 'Enforcement' },
  { key: 'donations', label: 'Donations' },
  { key: 'recalls', label: 'Recalls' },
  { key: 'complaints', label: 'Safety Complaints' },
  { key: 'safety_ratings', label: 'Safety Ratings' },
  // { key: 'fuel_economy', label: 'Fuel Economy' },  // Hidden from UI — data kept in backend
  { key: 'filings', label: 'SEC Filings' },
];

// ── Page ──

export default function TransportationCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const [detail, setDetail] = useState<TransportationCompanyDetail | null>(null);
  const [stock, setStock] = useState<TransportationStockData['latest_stock']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lazy-loaded tab data
  const [contracts, setContracts] = useState<TransportationContractItem[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [contractSummary, setContractSummary] = useState<TransportationContractSummary | null>(null);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  const [lobbying, setLobbying] = useState<TransportationLobbyingItem[]>([]);
  const [lobbyTotal, setLobbyTotal] = useState(0);
  const [lobbySummary, setLobbySummary] = useState<TransportationLobbySummary | null>(null);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);

  const [enforcement, setEnforcement] = useState<TransportationEnforcementItem[]>([]);
  const [enforcementTotal, setEnforcementTotal] = useState(0);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);

  const [filings, setFilings] = useState<TransportationFilingItem[]>([]);
  const [filingTotal, setFilingTotal] = useState(0);
  const [filingsLoaded, setFilingsLoaded] = useState(false);

  const [recalls, setRecalls] = useState<TransportationRecallItem[]>([]);
  const [recallTotal, setRecallTotal] = useState(0);
  const [recallsLoaded, setRecallsLoaded] = useState(false);
  const [recallOffset, setRecallOffset] = useState(0);

  const [complaints, setComplaints] = useState<TransportationComplaintItem[]>([]);
  const [complaintTotal, setComplaintTotal] = useState(0);
  const [complaintsLoaded, setComplaintsLoaded] = useState(false);
  const [complaintOffset, setComplaintOffset] = useState(0);

  const [fuelEconomy, setFuelEconomy] = useState<TransportationFuelEconomyItem[]>([]);
  const [fuelEconomyTotal, setFuelEconomyTotal] = useState(0);
  const [fuelEconomyLoaded, setFuelEconomyLoaded] = useState(false);
  const [fuelEconomyOffset, setFuelEconomyOffset] = useState(0);

  const [safetyRatings, setSafetyRatings] = useState<TransportationSafetyRatingItem[]>([]);
  const [safetyRatingsTotal, setSafetyRatingsTotal] = useState(0);
  const [safetyRatingsLoaded, setSafetyRatingsLoaded] = useState(false);
  const [avgOverallRating, setAvgOverallRating] = useState<number | null>(null);

  const [donations, setDonations] = useState<TransportationDonationItem[]>([]);
  const [donationTotal, setDonationTotal] = useState(0);
  const [donationTotalAmount, setDonationTotalAmount] = useState(0);
  const [donationsLoaded, setDonationsLoaded] = useState(false);

  const [news, setNews] = useState<TransportationNewsItem[]>([]);
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  // Load overview on mount
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getTransportationCompanyDetail(companyId),
      getTransportationCompanyStock(companyId).catch(() => ({ latest_stock: null })),
    ])
      .then(([d, s]) => {
        setDetail(d);
        setStock(s.latest_stock || null);
        // Load news in background
        getTransportationCompanyNews(d.display_name, 5)
          .then((r) => setNews(r.articles || []))
          .catch(() => {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // Fetch trends
    fetch(`${getApiBaseUrl()}/transportation/companies/${encodeURIComponent(companyId)}/trends`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setTrends(d); })
      .catch(() => {});
  }, [companyId]);

  // Lazy load tab data
  useEffect(() => {
    if (!companyId) return;

    if (activeTab === 'contracts' && !contractsLoaded) {
      Promise.all([
        getTransportationCompanyContracts(companyId, { limit: 100 }),
        getTransportationCompanyContractSummary(companyId).catch(() => null),
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
        getTransportationCompanyLobbying(companyId, { limit: 100 }),
        getTransportationCompanyLobbySummary(companyId).catch(() => null),
      ])
        .then(([l, s]) => {
          setLobbying(l.filings || []); setLobbyTotal(l.total);
          if (s) setLobbySummary(s);
          setLobbyingLoaded(true);
        })
        .catch(() => {});
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getTransportationCompanyEnforcement(companyId, { limit: 100 })
        .then((r) => {
          setEnforcement(r.actions || []); setEnforcementTotal(r.total);
          setTotalPenalties(r.total_penalties || 0);
          setEnforcementLoaded(true);
        })
        .catch(() => {});
    }
    if (activeTab === 'filings' && !filingsLoaded) {
      getTransportationCompanyFilings(companyId, { limit: 100 })
        .then((r) => { setFilings(r.filings || []); setFilingTotal(r.total); setFilingsLoaded(true); })
        .catch(() => {});
    }
    if (activeTab === 'recalls' && !recallsLoaded) {
      getTransportationCompanyRecalls(companyId, { limit: 50 })
        .then((r) => { setRecalls(r.recalls || []); setRecallTotal(r.total); setRecallsLoaded(true); setRecallOffset(50); })
        .catch(() => {});
    }
    if (activeTab === 'complaints' && !complaintsLoaded) {
      getTransportationCompanyComplaints(companyId, { limit: 50 })
        .then((r) => { setComplaints(r.complaints || []); setComplaintTotal(r.total); setComplaintsLoaded(true); setComplaintOffset(50); })
        .catch(() => {});
    }
    if (activeTab === 'safety_ratings' && !safetyRatingsLoaded) {
      getTransportationCompanySafetyRatings(companyId, { limit: 100 })
        .then((r) => {
          setSafetyRatings(r.ratings || []);
          setSafetyRatingsTotal(r.total);
          setAvgOverallRating(r.avg_overall_rating);
          setSafetyRatingsLoaded(true);
        })
        .catch(() => {});
    }
    // Fuel economy tab hidden from UI — lazy load removed
    if (activeTab === 'donations' && !donationsLoaded) {
      getTransportationCompanyDonations(companyId, { limit: 100 })
        .then((r) => { setDonations(r.donations || []); setDonationTotal(r.total); setDonationTotalAmount(r.total_amount || 0); setDonationsLoaded(true); })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, companyId]);

  // Load more helpers
  const loadMoreRecalls = () => {
    if (!companyId) return;
    getTransportationCompanyRecalls(companyId, { limit: 50, offset: recallOffset })
      .then((r) => { setRecalls((prev) => [...prev, ...(r.recalls || [])]); setRecallOffset((o) => o + 50); })
      .catch(() => {});
  };
  const loadMoreComplaints = () => {
    if (!companyId) return;
    getTransportationCompanyComplaints(companyId, { limit: 50, offset: complaintOffset })
      .then((r) => { setComplaints((prev) => [...prev, ...(r.complaints || [])]); setComplaintOffset((o) => o + 50); })
      .catch(() => {});
  };
  const loadMoreFuelEconomy = () => {
    if (!companyId) return;
    getTransportationCompanyFuelEconomy(companyId, { limit: 50, offset: fuelEconomyOffset })
      .then((r) => { setFuelEconomy((prev) => [...prev, ...(r.vehicles || [])]); setFuelEconomyOffset((o) => o + 50); })
      .catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="font-body text-lg text-red-400">{error || 'Company not found.'}</p>
        <Link to="/transportation/companies" className="font-body text-sm text-white/50 hover:text-white no-underline">&larr; Back to Companies</Link>
      </div>
    );
  }

  const stk = stock || detail.latest_stock;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden px-8 py-6 lg:px-12">
        <div className="shrink-0"><TransportationSectorHeader /></div>
        <div className="mb-4 shrink-0"><Breadcrumbs items={[
          { label: 'Transportation', to: '/transportation' },
          { label: 'Companies', to: '/transportation/companies' },
          { label: detail.display_name },
        ]} /></div>

        {/* Company Banner */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="mb-6 flex items-center gap-6 rounded-xl border border-white/10 bg-white/[0.03] p-6 shrink-0">
          <CompanyLogo id={detail.company_id} name={detail.display_name} logoUrl={detail.logo_url} size={64} iconFallback />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-3xl font-bold uppercase text-white lg:text-4xl xl:text-5xl truncate">{detail.display_name}</h1>
              <WatchlistButton entityType="company" entityId={detail.company_id || companyId || ""} entityName={detail.display_name} sector="transportation" />
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              {detail.ticker && <span className="rounded bg-blue-500/20 px-3 py-1 font-mono text-sm font-bold text-blue-400">{detail.ticker}</span>}
              <span className="rounded bg-white/10 px-3 py-1 font-mono text-xs uppercase tracking-wider text-white/60">{detail.sector_type.replace(/_/g, ' ')}</span>
              <SanctionsBadge status={detail.sanctions_status} />
              {detail.headquarters && <span className="font-body text-sm text-white/40">{detail.headquarters}</span>}
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto shrink-0">
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-4 py-2 font-body text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-blue-500/20 text-blue-400' : 'text-white/40 hover:text-white/70'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Metric cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Gov Contracts" value={fmtNum(detail.contract_count)} icon={Landmark} color="#10B981" />
                <MetricCard label="Contract Value" value={fmtDollar(detail.total_contract_value)} icon={Landmark} color="#10B981" />
                <MetricCard label="Lobbying Filings" value={fmtNum(detail.lobbying_count)} icon={Scale} color="#3B82F6" />
                <MetricCard label="Enforcement" value={fmtNum(detail.enforcement_count)} icon={Shield} color="#EF4444" />
              </div>

              {detail.ai_profile_summary && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                  <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white/50 mb-3">AI Profile Summary</h2>
                  <p className="font-body text-sm text-white/70 leading-relaxed whitespace-pre-line">{detail.ai_profile_summary}</p>
                </div>
              )}

              {/* Recent News */}
              {news.length > 0 && (
                <div>
                  <SectionHeader title="Recent News" icon={Newspaper} />
                  <div className="space-y-3">
                    {news.map((n, idx) => (
                      <a key={idx} href={n.link} target="_blank" rel="noopener noreferrer"
                        className="block rounded-lg border border-white/5 bg-white/[0.02] p-4 no-underline transition-colors hover:bg-white/[0.04]">
                        <p className="font-body text-sm text-white/80 mb-1">{n.title}</p>
                        <p className="font-mono text-[10px] text-white/30">{n.source} &middot; {n.published}</p>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock data */}
              {stk && (
                <div>
                  <SectionHeader title="Market Data" icon={TrendingUp} />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <MetricCard label="Market Cap" value={fmtDollar(stk.market_cap)} icon={TrendingUp} color="#3B82F6" />
                    <MetricCard label="P/E Ratio" value={stk.pe_ratio != null ? stk.pe_ratio.toFixed(1) : '\u2014'} icon={Hash} color="#3B82F6" />
                    <MetricCard label="Revenue TTM" value={fmtDollar(stk.revenue_ttm)} icon={TrendingUp} color="#3B82F6" />
                    <MetricCard label="Profit Margin" value={fmtPct(stk.profit_margin)} icon={TrendingUp} color="#3B82F6" />
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

              {/* SEC CIK link */}
              {detail.sec_cik && (
                <div className="flex items-center gap-2">
                  <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${detail.sec_cik}&type=&dateb=&owner=include&count=40`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-mono text-xs text-blue-400 hover:text-blue-300 no-underline flex items-center gap-1">
                    SEC EDGAR (CIK: {detail.sec_cik}) <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          )}

          {activeTab === 'contracts' && (
            <div>
              <SectionHeader title="Government Contracts" icon={Landmark} count={contractTotal} />
              {contractSummary && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <MetricCard label="Total Contracts" value={fmtNum(contractSummary.total_contracts)} icon={Landmark} color="#10B981" />
                  <MetricCard label="Total Value" value={fmtDollar(contractSummary.total_amount)} icon={Landmark} color="#10B981" />
                </div>
              )}
              <div className="space-y-3">
                {contracts.map((ct) => (
                  <div key={ct.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <p className="font-body text-sm text-white/80 mb-2">{ct.description || 'No description'}</p>
                    {ct.ai_summary && <p className="font-body text-xs text-white/50 mb-2 italic">{ct.ai_summary}</p>}
                    <div className="flex flex-wrap gap-4 font-mono text-xs text-white/40">
                      {ct.award_amount != null && <span>Award: {fmtDollar(ct.award_amount)}</span>}
                      {ct.awarding_agency && <span>Agency: {ct.awarding_agency}</span>}
                      {ct.start_date && <span>Start: {fmtDate(ct.start_date)}</span>}
                    </div>
                  </div>
                ))}
                {contracts.length === 0 && <p className="font-body text-sm text-white/30 text-center py-8">No contracts found</p>}
              </div>
            </div>
          )}

          {activeTab === 'lobbying' && (
            <div>
              <SectionHeader title="Lobbying Disclosures" icon={Scale} count={lobbyTotal} />
              {lobbySummary && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <MetricCard label="Total Filings" value={fmtNum(lobbySummary.total_filings)} icon={Scale} color="#3B82F6" />
                  <MetricCard label="Total Income" value={fmtDollar(lobbySummary.total_income)} icon={Scale} color="#3B82F6" />
                </div>
              )}
              <div className="space-y-3">
                {lobbying.map((r) => (
                  <div key={r.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-body text-sm font-medium text-white/80">{r.client_name || r.registrant_name || 'Unknown'}</p>
                      <span className="font-mono text-xs text-white/40">{r.filing_year} {r.filing_period || ''}</span>
                    </div>
                    {r.ai_summary && <p className="font-body text-xs text-white/50 mb-1 italic">{r.ai_summary}</p>}
                    {r.lobbying_issues && <p className="font-body text-xs text-white/50 mb-1">Issues: {r.lobbying_issues}</p>}
                    <div className="flex gap-4 font-mono text-xs text-white/40">
                      {r.income != null && <span>Income: {fmtDollar(r.income)}</span>}
                      {r.registrant_name && <span>Firm: {r.registrant_name}</span>}
                    </div>
                    {r.filing_uuid && (
                      <a href={`https://lda.senate.gov/filings/public/filing/${r.filing_uuid}/`} target="_blank" rel="noopener noreferrer"
                        className="inline-block mt-2 font-mono text-[10px] text-blue-400 hover:text-blue-300 no-underline">View filing &rarr;</a>
                    )}
                  </div>
                ))}
                {lobbying.length === 0 && <p className="font-body text-sm text-white/30 text-center py-8">No lobbying records found</p>}
              </div>
            </div>
          )}

          {activeTab === 'enforcement' && (
            <div>
              <SectionHeader title="Enforcement Actions" icon={Shield} count={enforcementTotal} />
              {totalPenalties > 0 && (
                <div className="mb-6">
                  <MetricCard label="Total Penalties" value={fmtDollar(totalPenalties)} icon={AlertTriangle} color="#EF4444" />
                </div>
              )}
              <div className="space-y-3">
                {enforcement.map((a) => (
                  <div key={a.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <p className="font-body text-sm font-medium text-white/80 mb-2">{a.case_title}</p>
                    {a.ai_summary && <p className="font-body text-xs text-blue-400/70 mb-2 italic">{a.ai_summary}</p>}
                    {a.description && <p className="font-body text-xs text-white/50 mb-2">{a.description}</p>}
                    <div className="flex flex-wrap gap-4 font-mono text-xs text-white/40">
                      {a.case_date && <span>{fmtDate(a.case_date)}</span>}
                      {a.enforcement_type && <span>{a.enforcement_type}</span>}
                      {a.penalty_amount != null && a.penalty_amount > 0 && <span className="text-red-400">Penalty: {fmtDollar(a.penalty_amount)}</span>}
                      {a.source && <span>Source: {a.source}</span>}
                    </div>
                    {a.case_url && (
                      <a href={a.case_url} target="_blank" rel="noopener noreferrer"
                        className="inline-block mt-2 font-mono text-[10px] text-blue-400 hover:text-blue-300 no-underline">View document &rarr;</a>
                    )}
                  </div>
                ))}
                {enforcement.length === 0 && <p className="font-body text-sm text-white/30 text-center py-8">No enforcement actions found</p>}
              </div>
            </div>
          )}

          {activeTab === 'donations' && (
            <div>
              <SectionHeader title="PAC Donations" icon={DollarSign} count={donationTotal} />
              {donationTotalAmount > 0 && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <MetricCard label="Total Donations" value={fmtNum(donationTotal)} icon={DollarSign} color="#F59E0B" />
                  <MetricCard label="Total Amount" value={fmtDollar(donationTotalAmount)} icon={DollarSign} color="#F59E0B" />
                </div>
              )}
              <div className="space-y-3">
                {donations.map((d) => (
                  <div key={d.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-body text-sm font-medium text-white/80">{d.candidate_name || d.committee_name || 'Unknown'}</p>
                      {d.amount != null && <span className="font-mono text-sm font-bold text-amber-400">{fmtDollar(d.amount)}</span>}
                    </div>
                    <div className="flex flex-wrap gap-4 font-mono text-xs text-white/40">
                      {d.committee_name && <span>Committee: {d.committee_name}</span>}
                      {d.cycle && <span>Cycle: {d.cycle}</span>}
                      {d.donation_date && <span>{fmtDate(d.donation_date)}</span>}
                    </div>
                    {d.person_id && (
                      <Link to={`/politics/person/${d.person_id}`}
                        className="inline-block mt-2 font-mono text-[10px] text-blue-400 hover:text-blue-300 no-underline">View politician &rarr;</Link>
                    )}
                  </div>
                ))}
                {donations.length === 0 && <p className="font-body text-sm text-white/30 text-center py-8">No donation records found</p>}
              </div>
            </div>
          )}

          {activeTab === 'recalls' && (
            <div>
              <SectionHeader title="NHTSA Recalls" icon={Car} count={recallTotal} />
              <div className="space-y-3">
                {recalls.map((r) => (
                  <div key={r.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="rounded bg-red-500/20 px-2 py-0.5 font-mono text-xs font-bold text-red-400">{r.recall_number}</span>
                      <span className="font-mono text-xs text-white/40">{r.make} {r.model} ({r.model_year})</span>
                    </div>
                    {r.component && <p className="font-mono text-xs text-white/50 mb-1">Component: {r.component}</p>}
                    {r.summary && <p className="font-body text-xs text-white/60 mb-2">{r.summary}</p>}
                    {r.consequence && <p className="font-body text-xs text-red-400/70 mb-1">Consequence: {r.consequence}</p>}
                    {r.remedy && <p className="font-body text-xs text-green-400/70">Remedy: {r.remedy}</p>}
                    <div className="flex gap-4 font-mono text-[10px] text-white/30 mt-2">
                      {r.recall_date && <span>Date: {r.recall_date}</span>}
                      {r.manufacturer && <span>Mfr: {r.manufacturer}</span>}
                    </div>
                  </div>
                ))}
                {recalls.length === 0 && <p className="font-body text-sm text-white/30 text-center py-8">No recall campaigns found</p>}
                {recalls.length < recallTotal && (
                  <button onClick={loadMoreRecalls} className="w-full rounded-lg border border-white/10 py-3 font-body text-sm text-white/50 hover:text-white hover:border-white/20 transition-colors">
                    Load more ({recalls.length} of {recallTotal})
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'complaints' && (
            <div>
              <SectionHeader title="Safety Complaints" icon={AlertTriangle} count={complaintTotal} />
              <div className="space-y-3">
                {complaints.map((c) => (
                  <div key={c.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-xs text-white/40">{c.make} {c.model} ({c.model_year})</span>
                      <span className="font-mono text-xs text-white/30">ODI#{c.odi_number}</span>
                      {c.crash && <span className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-[10px] text-red-400">CRASH</span>}
                      {c.fire && <span className="rounded bg-orange-500/20 px-1.5 py-0.5 font-mono text-[10px] text-orange-400">FIRE</span>}
                    </div>
                    {c.component && <p className="font-mono text-xs text-white/50 mb-1">Component: {c.component}</p>}
                    {c.summary && <p className="font-body text-xs text-white/60 mb-2">{c.summary}</p>}
                    <div className="flex gap-4 font-mono text-[10px] text-white/30">
                      {c.date_of_complaint && <span>Date: {c.date_of_complaint}</span>}
                      {c.injuries > 0 && <span className="text-red-400">{c.injuries} injuries</span>}
                      {c.deaths > 0 && <span className="text-red-500 font-bold">{c.deaths} deaths</span>}
                    </div>
                  </div>
                ))}
                {complaints.length === 0 && <p className="font-body text-sm text-white/30 text-center py-8">No safety complaints found</p>}
                {complaints.length < complaintTotal && (
                  <button onClick={loadMoreComplaints} className="w-full rounded-lg border border-white/10 py-3 font-body text-sm text-white/50 hover:text-white hover:border-white/20 transition-colors">
                    Load more ({complaints.length} of {complaintTotal})
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'safety_ratings' && (
            <div>
              <SectionHeader title="Safety Ratings" icon={Star} count={safetyRatingsTotal} />
              {avgOverallRating != null && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <MetricCard label="Total Rated Vehicles" value={fmtNum(safetyRatingsTotal)} icon={Car} color="#F59E0B" />
                  <MetricCard label="Avg Overall Rating" value={`${avgOverallRating.toFixed(1)} / 5`} icon={Star} color="#F59E0B" />
                </div>
              )}
              <div className="space-y-3">
                {safetyRatings.map((r) => (
                  <div key={r.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-xs text-white/80">{r.make} {r.model} ({r.model_year})</span>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {r.overall_rating != null && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-white/40">Overall:</span>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={14}
                                className={i < (r.overall_rating ?? 0) ? 'text-amber-400 fill-amber-400' : 'text-white/10'}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {r.frontal_crash_rating != null && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-white/40">Frontal:</span>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={12}
                                className={i < (r.frontal_crash_rating ?? 0) ? 'text-blue-400 fill-blue-400' : 'text-white/10'}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {r.side_crash_rating != null && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-white/40">Side:</span>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={12}
                                className={i < (r.side_crash_rating ?? 0) ? 'text-blue-400 fill-blue-400' : 'text-white/10'}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {r.rollover_rating != null && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-white/40">Rollover:</span>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={12}
                                className={i < (r.rollover_rating ?? 0) ? 'text-blue-400 fill-blue-400' : 'text-white/10'}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {safetyRatings.length === 0 && <p className="font-body text-sm text-white/30 text-center py-8">No safety ratings found</p>}
              </div>
            </div>
          )}

          {/* Fuel Economy tab hidden from UI — data kept in backend */}

          {activeTab === 'filings' && (
            <div>
              <SectionHeader title="SEC Filings" icon={FileText} count={filingTotal} />
              <div className="space-y-3">
                {filings.map((f) => (
                  <div key={f.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="rounded bg-blue-500/20 px-2 py-0.5 font-mono text-xs font-bold text-blue-400">{f.form_type}</span>
                        <span className="font-mono text-xs text-white/40">{fmtDate(f.filing_date)}</span>
                      </div>
                      {f.description && <p className="font-body text-xs text-white/50">{f.description}</p>}
                    </div>
                    {f.primary_doc_url && (
                      <a href={f.primary_doc_url} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-400 hover:text-blue-300 no-underline flex items-center gap-1 shrink-0 ml-4">
                        View <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                ))}
                {filings.length === 0 && <p className="font-body text-sm text-white/30 text-center py-8">No SEC filings found</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
