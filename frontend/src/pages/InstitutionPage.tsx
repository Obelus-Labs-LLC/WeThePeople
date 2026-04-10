import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Landmark, TrendingUp, FileSearch, Calendar, Hash, Download,
  ExternalLink, CheckCircle, XCircle,
} from 'lucide-react';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import { FinanceSectorHeader } from '../components/SectorHeader';
import { LOCAL_LOGOS } from '../data/financeLogos';
import { getLogoUrl } from '../utils/logos';
import CompanyLogo from '../components/CompanyLogo';
import {
  getInstitutionDetail,
  getInstitutionFilings,
  getInstitutionFinancials,
  getInstitutionStock,
  getInstitutionComplaints,
  getInstitutionComplaintSummary,
  getInstitutionInsiderTrades,
  getInstitutionPressReleases,
  getInstitutionFRED,
  getInstitutionLobbying,
  getInstitutionContracts,
  getInstitutionEnforcement,
  getInstitutionDonations,
  type InstitutionDetail,
  type SECFiling,
  type FDICFinancial,
  type StockSnapshot,
  type CFPBComplaintItem,
  type ComplaintSummary,
  type PressRelease,
  type FREDObservation,
  type LobbyingFiling,
  type GovernmentContractItem,
  type EnforcementAction,
  type DonationItem,
} from '../api/finance';
import { fmtDollar } from '../utils/format';
import { getApiBaseUrl } from '../api/client';
import SanctionsBadge from '../components/SanctionsBadge';
import AnomalyBadge from '../components/AnomalyBadge';
import TrendChart from '../components/TrendChart';
import ShareButton from '../components/ShareButton';
import WatchlistButton from '../components/WatchlistButton';

// ── Helpers ──

function instLogoUrl(inst: { institution_id: string; logo_url?: string | null; display_name: string }): string {
  return getLogoUrl(inst.institution_id, inst.logo_url, LOCAL_LOGOS);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

function fmtRatio(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(2);
}

function fmtPctRaw(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(2)}%`;
}

// ── Shared Components ──

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-xs text-white/40 truncate mb-1">{label}</p>
      <p className="font-mono text-lg text-white">{value}</p>
    </div>
  );
}

function FilingRow({ filing }: { filing: SECFiling }) {
  const url = filing.filing_url || filing.primary_doc_url;
  return (
    <div className="group flex items-center gap-4 rounded-lg border border-transparent bg-white/5 p-4 transition-all duration-150 hover:bg-white/10 hover:border-white/10">
      <div className="flex h-auto w-16 flex-shrink-0 items-center justify-center rounded bg-[rgba(52,211,153,0.1)] px-2 py-2">
        <span className="font-mono text-sm font-bold text-[#34D399]">{filing.form_type || '?'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-body text-base font-medium text-white truncate mb-1">
          {filing.description || filing.accession_number || 'SEC Filing'}
        </p>
        <div className="flex items-center gap-4">
          {filing.filing_date && (
            <span className="flex items-center gap-1 font-mono text-xs text-white/40">
              <Calendar size={12} />{filing.filing_date}
            </span>
          )}
          {filing.accession_number && (
            <span className="flex items-center gap-1 font-mono text-xs text-white/40">
              <Hash size={12} />{filing.accession_number}
            </span>
          )}
        </div>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          onClick={(e) => e.stopPropagation()}>
          <ExternalLink size={14} className="text-white" />
        </a>
      )}
    </div>
  );
}

// ── Tab Types ──

type TabKey = 'overview' | 'lobbying' | 'contracts' | 'enforcement' | 'insider' | 'donations' | 'financials';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'lobbying', label: 'Lobbying' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'enforcement', label: 'Enforcement' },
  { key: 'insider', label: 'Insider Trades' },
  { key: 'donations', label: 'Donations' },
  // { key: 'complaints', label: 'Complaints' },  // Hidden from UI — summary shown in Overview
  { key: 'financials', label: 'Financials' },
];

// ── Page ──

export default function InstitutionPage() {
  const { institution_id } = useParams<{ institution_id: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Overview data
  const [detail, setDetail] = useState<InstitutionDetail | null>(null);
  const [filings, setFilings] = useState<SECFiling[]>([]);
  const [financials, setFinancials] = useState<FDICFinancial[]>([]);
  const [stock, setStock] = useState<StockSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  // Complaints data (lazy)
  const [complaints, setComplaints] = useState<CFPBComplaintItem[]>([]);
  const [complaintSummary, setComplaintSummary] = useState<ComplaintSummary | null>(null);
  const [complaintsLoaded, setComplaintsLoaded] = useState(false);
  const [complaintsTotal, setComplaintsTotal] = useState(0);
  const [complaintsLoadingMore, setComplaintsLoadingMore] = useState(false);

  // Insider trades (lazy)
  const [trades, setTrades] = useState<Array<{ id: number; filer_name: string; filer_title: string | null; transaction_date: string | null; transaction_type: string | null; shares: number | null; price_per_share: number | null; total_value: number | null; filing_url: string | null }>>([]);
  const [tradesLoaded, setTradesLoaded] = useState(false);
  const [tradeFilter, setTradeFilter] = useState<string | null>(null);

  // Press releases (lazy)
  const [pressReleases, setPressReleases] = useState<PressRelease[]>([]);
  const [pressLoaded, setPressLoaded] = useState(false);

  // FRED data (lazy)
  const [fredData, setFredData] = useState<FREDObservation[]>([]);
  const [fredLoaded, setFredLoaded] = useState(false);

  // Lobbying (lazy)
  const [lobbyingData, setLobbyingData] = useState<LobbyingFiling[]>([]);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);
  const [lobbyingTotal, setLobbyingTotal] = useState(0);

  // Contracts (lazy)
  const [contractsData, setContractsData] = useState<GovernmentContractItem[]>([]);
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [contractsTotal, setContractsTotal] = useState(0);

  // Enforcement (lazy)
  const [enforcementData, setEnforcementData] = useState<EnforcementAction[]>([]);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);
  const [enforcementTotal, setEnforcementTotal] = useState(0);
  const [enforcementPenalties, setEnforcementPenalties] = useState(0);

  // Donations (lazy)
  const [donationsData, setDonationsData] = useState<DonationItem[]>([]);
  const [donationsLoaded, setDonationsLoaded] = useState(false);
  const [donationsTotal, setDonationsTotal] = useState(0);

  // Narrative expansion
  const [expandedNarratives, setExpandedNarratives] = useState<Set<number>>(new Set());

  // Trends
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  // Load overview data on mount
  useEffect(() => {
    if (!institution_id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getInstitutionDetail(institution_id),
      getInstitutionFilings(institution_id, { limit: 50 }),
      getInstitutionFinancials(institution_id, { limit: 5 }),
      getInstitutionStock(institution_id).catch(() => ({ stock: null })),
    ])
      .then(([d, f, fin, s]) => {
        if (cancelled) return;
        setDetail(d);
        setFilings(f.filings || []);
        setFinancials(fin.financials || []);
        setStock(s.stock || null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    // Fetch trends separately (non-blocking)
    fetch(`${getApiBaseUrl()}/finance/institutions/${encodeURIComponent(institution_id)}/trends`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled && d) setTrends(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [institution_id]);

  // Lazy load tab data
  useEffect(() => {
    if (!institution_id) return;
    // Complaints tab hidden — lazy load removed
    if (activeTab === 'insider' && !tradesLoaded) {
      getInstitutionInsiderTrades(institution_id, { limit: 100, transaction_type: tradeFilter || undefined })
        .then((r) => { setTrades(r.trades || []); setTradesLoaded(true); })
        .catch(() => {});
    }
    if (activeTab === 'lobbying' && !lobbyingLoaded) {
      getInstitutionLobbying(institution_id, { limit: 100 })
        .then((r) => { setLobbyingData(r.filings || []); setLobbyingTotal(r.total || 0); setLobbyingLoaded(true); })
        .catch(() => {});
    }
    if (activeTab === 'contracts' && !contractsLoaded) {
      getInstitutionContracts(institution_id, { limit: 100 })
        .then((r) => { setContractsData(r.contracts || []); setContractsTotal(r.total || 0); setContractsLoaded(true); })
        .catch(() => {});
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getInstitutionEnforcement(institution_id, { limit: 100 })
        .then((r) => { setEnforcementData(r.actions || []); setEnforcementTotal(r.total || 0); setEnforcementPenalties(r.total_penalties || 0); setEnforcementLoaded(true); })
        .catch(() => {});
    }
    if (activeTab === 'donations' && !donationsLoaded) {
      getInstitutionDonations(institution_id, { limit: 100 })
        .then((r) => { setDonationsData(r.donations || []); setDonationsTotal(r.total || 0); setDonationsLoaded(true); })
        .catch(() => {});
    }
    if (activeTab === 'financials' && !pressLoaded) {
      // Load press + FRED + filings in the collapsed financials tab
      Promise.all([
        pressLoaded ? Promise.resolve(null) : getInstitutionPressReleases(institution_id, { limit: 50 }),
        fredLoaded ? Promise.resolve(null) : getInstitutionFRED(institution_id, { limit: 200 }),
      ]).then(([pr, fr]) => {
        if (pr) { setPressReleases(pr.press_releases || []); setPressLoaded(true); }
        if (fr) { setFredData(fr.observations || []); setFredLoaded(true); }
      }).catch(() => {});
    }
  }, [activeTab, institution_id, complaintsLoaded, tradesLoaded, pressLoaded, fredLoaded, lobbyingLoaded, contractsLoaded, enforcementLoaded, donationsLoaded, tradeFilter]);

  // Re-fetch trades on filter change
  useEffect(() => {
    if (!institution_id || activeTab !== 'insider') return;
    getInstitutionInsiderTrades(institution_id, { limit: 100, transaction_type: tradeFilter || undefined })
      .then((r) => setTrades(r.trades || []))
      .catch(() => {});
  }, [tradeFilter, institution_id, activeTab]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <p className="font-body text-white/60">Institution not found.</p>
      </div>
    );
  }

  const latestFin = financials[0] || null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-transparent">
      <div className="flex flex-1 flex-col overflow-hidden px-8 py-8 lg:px-12">
        <FinanceSectorHeader />
        <div className="mb-4 shrink-0">
          <Breadcrumbs items={[
            { label: 'Finance', to: '/finance' },
            { label: 'Institutions', to: '/finance/institutions' },
            { label: detail.display_name },
          ]} />
        </div>

        {/* ── Top Banner ── */}
        <div className="mb-6 flex items-center gap-6 rounded-xl border border-white/10 bg-white/[0.03] p-6 animate-fade-up shrink-0">
          <CompanyLogo
            id={detail.institution_id}
            name={detail.display_name}
            logoUrl={detail.logo_url}
            localLogos={LOCAL_LOGOS}
            size={64}
            iconFallback
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-3xl font-bold uppercase text-white lg:text-4xl xl:text-5xl truncate">{detail.display_name}</h1>
              <WatchlistButton entityType="company" entityId={detail.institution_id || institution_id || ""} entityName={detail.display_name} sector="finance" />
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              {detail.ticker && <span className="rounded bg-white/10 px-3 py-1 font-mono text-sm text-white">{detail.ticker}</span>}
              <span className="font-mono text-xs uppercase tracking-wider text-white/40">{detail.sector_type.replace(/_/g, ' ')}</span>
              <SanctionsBadge status={detail.sanctions_status} />
              <ShareButton url={window.location.href} title={`${detail.display_name} — WeThePeople`} />
              {detail.headquarters && (
                <span className="flex items-center gap-1 font-body text-sm text-white/50">
                  <span className="text-white/30">·</span> {detail.headquarters}
                </span>
              )}
            </div>
          </div>
          <div className="hidden flex-shrink-0 text-right md:block">
            {detail.sec_cik && (<div className="mb-2"><p className="font-mono text-xs text-white/40">CIK</p><p className="font-mono text-lg text-white">{detail.sec_cik}</p></div>)}
            {detail.fdic_cert && (<div><p className="font-mono text-xs text-white/40">FDIC CERT</p><p className="font-mono text-lg text-white">{detail.fdic_cert}</p></div>)}
          </div>
        </div>
        {(detail as any).ai_profile_summary && (
          <div className="mb-6">
            <span className="text-zinc-500 text-xs uppercase tracking-wider">AI Analysis</span>
            <p className="text-zinc-400 text-sm mt-1">{(detail as any).ai_profile_summary}</p>
          </div>
        )}

        {/* ── Tab Navigation ── */}
        <div className="mb-6 flex gap-1 border-b border-white/10 pb-0 overflow-x-auto shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap px-5 py-3 font-heading text-sm font-bold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'text-[#34D399] border-[#34D399]'
                  : 'text-white/40 border-transparent hover:text-white/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="flex-1 overflow-hidden min-h-0">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="grid h-full grid-cols-1 gap-8 xl:grid-cols-3 overflow-y-auto">
              {/* Left: Financials + Stock */}
              <div className="flex flex-col gap-8 xl:col-span-1 xl:overflow-y-auto xl:pr-4">
                {/* FDIC Financials */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
                  <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
                    <h2 className="font-heading text-xl font-bold uppercase text-white">FDIC Financials</h2>
                    <Landmark size={20} className="text-[#34D399]" />
                  </div>
                  {latestFin ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                      <MetricItem label="Total Assets" value={fmtDollar(latestFin.total_assets)} />
                      <MetricItem label="Total Deposits" value={fmtDollar(latestFin.total_deposits)} />
                      <MetricItem label="Net Income" value={fmtDollar(latestFin.net_income)} />
                      <MetricItem label="Net Loans" value={fmtDollar(latestFin.net_loans)} />
                      <MetricItem label="ROA" value={fmtPctRaw(latestFin.roa)} />
                      <MetricItem label="ROE" value={fmtPctRaw(latestFin.roe)} />
                      <MetricItem label="Tier 1 Capital" value={fmtPctRaw(latestFin.tier1_capital_ratio)} />
                      <MetricItem label="Efficiency Ratio" value={fmtPctRaw(latestFin.efficiency_ratio)} />
                      <MetricItem label="Noncurrent Loans" value={fmtPctRaw(latestFin.noncurrent_loan_ratio)} />
                      <MetricItem label="Net Charge-Off" value={fmtPctRaw(latestFin.net_charge_off_ratio)} />
                      {latestFin.report_date && <MetricItem label="Report Date" value={latestFin.report_date} />}
                    </div>
                  ) : (
                    <p className="font-body text-sm text-white/40">No FDIC data available.</p>
                  )}
                </div>

                {/* Market Fundamentals */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 animate-fade-up" style={{ animationDelay: '200ms' }}>
                  <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
                    <h2 className="font-heading text-xl font-bold uppercase text-white">Market Fundamentals</h2>
                    <TrendingUp size={20} className="text-[#34D399]" />
                  </div>
                  {stock ? (
                    <>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                        <MetricItem label="Market Cap" value={fmtDollar(stock.market_cap)} />
                        <MetricItem label="P/E Ratio" value={fmtRatio(stock.pe_ratio)} />
                        <MetricItem label="Forward P/E" value={fmtRatio(stock.forward_pe)} />
                        <MetricItem label="PEG Ratio" value={fmtRatio(stock.peg_ratio)} />
                        <MetricItem label="Price/Book" value={fmtRatio(stock.price_to_book)} />
                        <MetricItem label="EPS" value={stock.eps != null ? `$${stock.eps.toFixed(2)}` : '—'} />
                        <MetricItem label="Revenue (TTM)" value={fmtDollar(stock.revenue_ttm)} />
                        <MetricItem label="Profit Margin" value={fmtPct(stock.profit_margin)} />
                        <MetricItem label="Operating Margin" value={fmtPct(stock.operating_margin)} />
                        <MetricItem label="Return on Equity" value={fmtPct(stock.return_on_equity)} />
                        <MetricItem label="Dividend Yield" value={fmtPct(stock.dividend_yield)} />
                        <MetricItem label="52W High" value={stock.week_52_high != null ? `$${stock.week_52_high.toFixed(2)}` : '—'} />
                        <MetricItem label="52W Low" value={stock.week_52_low != null ? `$${stock.week_52_low.toFixed(2)}` : '—'} />
                        <MetricItem label="50-Day MA" value={stock.day_50_moving_avg != null ? `$${stock.day_50_moving_avg.toFixed(2)}` : '—'} />
                        <MetricItem label="200-Day MA" value={stock.day_200_moving_avg != null ? `$${stock.day_200_moving_avg.toFixed(2)}` : '—'} />
                      </div>
                      {(stock.sector || stock.industry) && (
                        <div className="mt-6 border-t border-white/10 pt-4">
                          {stock.sector && <p className="font-mono text-xs text-white/40 mb-1">SECTOR: <span className="text-white/80">{stock.sector}</span></p>}
                          {stock.industry && <p className="font-mono text-xs text-white/40">INDUSTRY: <span className="text-white/80">{stock.industry}</span></p>}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="font-body text-sm text-white/40">No stock data available.</p>
                  )}
                </div>
              </div>

              {/* Right: SEC Filings */}
              <div className="flex flex-col xl:col-span-2 animate-fade-up" style={{ animationDelay: '300ms' }}>
                <div className="flex flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-6">
                  <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
                    <h2 className="font-heading text-xl font-bold uppercase text-white">Recent SEC Filings</h2>
                    <FileSearch size={20} className="text-[#34D399]" />
                  </div>
                  {filings.length === 0 ? (
                    <p className="font-body text-sm text-white/40">No SEC filings on record.</p>
                  ) : (
                    <div className="flex-1 space-y-3 overflow-y-auto pr-4">
                      {filings.map((f) => <FilingRow key={f.id} filing={f} />)}
                    </div>
                  )}
                </div>
              </div>

              {/* CFPB Complaints summary */}
              {detail && detail.complaint_count > 0 && (
                <div className="xl:col-span-3 mt-2 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 animate-fade-up" style={{ animationDelay: '400ms' }}>
                  <p className="font-mono text-sm text-white/50">
                    <span className="font-bold text-white/70">{detail.complaint_count.toLocaleString()}</span> CFPB complaints on file
                  </p>
                </div>
              )}

              {/* Activity Over Time */}
              {trends && (
                <div className="xl:col-span-3 rounded-xl border border-white/10 bg-white/[0.03] p-6 animate-fade-up" style={{ animationDelay: '500ms' }}>
                  <h2 className="font-heading text-xl font-bold uppercase text-white mb-4">Activity Over Time</h2>
                  <TrendChart data={trends} />
                </div>
              )}
            </div>
          )}

          {/* INSIDER TRADES TAB */}
          {activeTab === 'insider' && (
            <div className="flex h-full flex-col overflow-hidden">
              {/* Filter */}
              <div className="mb-4 flex items-center gap-3 shrink-0">
                <span className="font-mono text-xs text-white/40">FILTER:</span>
                {[{ label: 'ALL', value: null }, { label: 'PURCHASE', value: 'P' }, { label: 'SALE', value: 'S' }, { label: 'AWARD', value: 'A' }].map((opt) => (
                  <button key={opt.label} onClick={() => { setTradeFilter(opt.value); }}
                    className={`rounded px-3 py-1 font-mono text-xs font-bold transition-colors ${tradeFilter === opt.value ? 'bg-[#34D399]/20 text-[#34D399] border border-[#34D399]/30' : 'bg-white/5 text-white/50 border border-transparent hover:text-white'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Table */}
              <div className="flex-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03]">
                {!tradesLoaded ? (
                  <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" /></div>
                ) : (
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-white/[0.05]">
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-4 text-left font-mono text-xs text-white/50">DATE</th>
                        <th className="px-4 py-4 text-left font-mono text-xs text-white/50">INSIDER</th>
                        <th className="px-4 py-4 text-left font-mono text-xs text-white/50">TYPE</th>
                        <th className="px-4 py-4 text-right font-mono text-xs text-white/50">SHARES</th>
                        <th className="px-4 py-4 text-right font-mono text-xs text-white/50">PRICE</th>
                        <th className="px-4 py-4 text-right font-mono text-xs text-white/50">VALUE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t) => (
                        <tr key={t.id}
                          className="border-b border-white/5 transition-colors hover:bg-white/5 cursor-pointer"
                          onClick={() => t.filing_url && window.open(t.filing_url, '_blank')}>
                          <td className="px-4 py-4 font-mono text-xs text-white/50">{t.transaction_date || '—'}</td>
                          <td className="px-4 py-4">
                            <p className="font-body text-sm font-bold text-white">{t.filer_name}</p>
                            {t.filer_title && <p className="font-mono text-[10px] text-white/40">{t.filer_title}</p>}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-block rounded px-2 py-1 font-mono text-xs font-bold uppercase ${
                              t.transaction_type === 'P' ? 'bg-[rgba(16,185,129,0.1)] text-[#10B981]' :
                              t.transaction_type === 'S' ? 'bg-[rgba(239,68,68,0.1)] text-[#EF4444]' :
                              'bg-[rgba(245,158,11,0.1)] text-[#FBBF24]'
                            }`}>
                              {t.transaction_type === 'P' ? 'PURCHASE' : t.transaction_type === 'S' ? 'SALE' : t.transaction_type === 'A' ? 'AWARD' : t.transaction_type || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-sm text-white">{t.shares != null ? t.shares.toLocaleString() : '—'}</td>
                          <td className="px-4 py-4 text-right font-mono text-sm text-white">{t.price_per_share != null ? `$${t.price_per_share.toFixed(2)}` : '—'}</td>
                          <td className="px-4 py-4 text-right font-mono text-sm font-bold text-white">{fmtDollar(t.total_value)}</td>
                        </tr>
                      ))}
                      {trades.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-8 text-center font-body text-sm text-white/40">No insider trades on record.</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* LOBBYING TAB */}
          {activeTab === 'lobbying' && (
            <div className="h-full overflow-y-auto pr-4">
              {!lobbyingLoaded ? (
                <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" /></div>
              ) : lobbyingData.length === 0 ? (
                <p className="font-body text-sm text-white/40">No lobbying disclosures found. Data will appear after sync jobs run.</p>
              ) : (
                <div className="space-y-3">
                  <p className="font-mono text-xs text-white/40 mb-4">{lobbyingTotal} total filings</p>
                  {lobbyingData.map((f) => (
                    <div key={f.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="font-mono text-sm font-bold text-white">{f.registrant_name || 'Unknown Firm'}</span>
                          {f.client_name && <span className="text-white/40 text-xs ml-2">for {f.client_name}</span>}
                        </div>
                        <div className="text-right">
                          {f.income != null && <span className="font-mono text-sm font-bold text-[#34D399]">{fmtDollar(f.income)}</span>}
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs text-white/40 font-mono">
                        <span>{f.filing_year} {f.filing_period || ''}</span>
                        {f.filing_uuid && (
                          <a href={`https://lda.senate.gov/filings/filing/${f.filing_uuid}/`} target="_blank" rel="noopener noreferrer" className="text-[#34D399]/60 hover:text-[#34D399]">
                            View Filing <ExternalLink size={10} className="inline" />
                          </a>
                        )}
                      </div>
                      {f.lobbying_issues && <p className="text-xs text-white/30 mt-2 line-clamp-1">{f.lobbying_issues}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CONTRACTS TAB */}
          {activeTab === 'contracts' && (
            <div className="h-full overflow-y-auto pr-4">
              {!contractsLoaded ? (
                <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" /></div>
              ) : contractsData.length === 0 ? (
                <p className="font-body text-sm text-white/40">No government contracts found. Data will appear after sync jobs run.</p>
              ) : (
                <div className="space-y-3">
                  <p className="font-mono text-xs text-white/40 mb-4">{contractsTotal} total contracts</p>
                  {contractsData.map((c) => (
                    <div key={c.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-body text-sm text-white flex-1 mr-4 line-clamp-2">{c.description || 'No description'}</p>
                        {c.award_amount != null && <span className="font-mono text-sm font-bold text-[#34D399] whitespace-nowrap">{fmtDollar(c.award_amount)}</span>}
                      </div>
                      <div className="flex gap-3 text-xs text-white/40 font-mono">
                        {c.awarding_agency && <span>{c.awarding_agency}</span>}
                        {c.start_date && <span>{c.start_date}</span>}
                        {c.award_id && (
                          <a href={`https://www.usaspending.gov/award/${c.award_id}`} target="_blank" rel="noopener noreferrer" className="text-[#34D399]/60 hover:text-[#34D399]">
                            USASpending <ExternalLink size={10} className="inline" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ENFORCEMENT TAB */}
          {activeTab === 'enforcement' && (
            <div className="h-full overflow-y-auto pr-4">
              {!enforcementLoaded ? (
                <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" /></div>
              ) : enforcementData.length === 0 ? (
                <p className="font-body text-sm text-white/40">No enforcement actions found. Data will appear after sync jobs run.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-6 mb-4">
                    <span className="font-mono text-xs text-white/40">{enforcementTotal} actions</span>
                    {enforcementPenalties > 0 && <span className="font-mono text-xs text-[#FF3366]">Total penalties: {fmtDollar(enforcementPenalties)}</span>}
                  </div>
                  {enforcementData.map((a) => (
                    <div key={a.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-body text-sm font-medium text-white flex-1 mr-4">{a.case_title}</p>
                        {a.penalty_amount != null && a.penalty_amount > 0 && (
                          <span className="font-mono text-sm font-bold text-[#FF3366] whitespace-nowrap">{fmtDollar(a.penalty_amount)}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs font-mono">
                        {a.case_date && <span className="text-white/40">{a.case_date}</span>}
                        {a.enforcement_type && <span className="rounded bg-[#FF3366]/10 px-2 py-0.5 text-[#FF3366]">{a.enforcement_type}</span>}
                        {a.source && <span className="text-white/30">{a.source}</span>}
                        {a.case_url && (
                          <a href={a.case_url} target="_blank" rel="noopener noreferrer" className="text-[#34D399]/60 hover:text-[#34D399]">
                            Source <ExternalLink size={10} className="inline" />
                          </a>
                        )}
                      </div>
                      {a.description && <p className="text-xs text-white/30 mt-2 line-clamp-2">{a.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DONATIONS TAB */}
          {activeTab === 'donations' && (
            <div className="h-full overflow-y-auto pr-4">
              {!donationsLoaded ? (
                <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" /></div>
              ) : donationsData.length === 0 ? (
                <p className="font-body text-sm text-white/40">No political donations found. Data will appear after sync jobs run.</p>
              ) : (
                <div className="space-y-3">
                  <p className="font-mono text-xs text-white/40 mb-4">{donationsTotal} total donations</p>
                  {donationsData.map((d) => (
                    <div key={d.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="font-body text-sm font-medium text-white">{d.candidate_name || d.committee_name || 'Unknown'}</span>
                          {d.committee_name && d.candidate_name && <span className="text-white/40 text-xs ml-2">via {d.committee_name}</span>}
                        </div>
                        {d.amount != null && <span className="font-mono text-sm font-bold text-[#34D399]">{fmtDollar(d.amount)}</span>}
                      </div>
                      <div className="flex gap-3 text-xs text-white/40 font-mono">
                        {d.cycle && <span>Cycle: {d.cycle}</span>}
                        {d.donation_date && <span>{d.donation_date}</span>}
                        {d.person_id && (
                          <Link to={`/politics/people/${d.person_id}`} className="text-blue-400 hover:text-blue-300 no-underline">
                            View Profile
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* COMPLAINTS TAB — Hidden from UI. Summary shown in Overview tab. */}

          {/* FINANCIALS TAB (SEC filings + FDIC + FRED) */}
          {activeTab === 'financials' && (
            <div className="h-full overflow-y-auto pr-4 space-y-6">
              {/* SEC Filings */}
              <div>
                <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-white/50 mb-3">SEC Filings ({filings.length})</h3>
                {filings.length === 0 ? (
                  <p className="font-body text-sm text-white/30">No SEC filings.</p>
                ) : (
                  <div className="space-y-2">
                    {filings.slice(0, 10).map((f) => (
                      <div key={f.id} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] p-3">
                        <div className="flex items-center gap-3">
                          <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-white/70">{f.form_type}</span>
                          <span className="text-sm text-white/50 line-clamp-1">{f.description || 'Filing'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-white/30">{f.filing_date}</span>
                          {f.filing_url && (
                            <a href={f.filing_url} target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-[#34D399]">
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stock data */}
              {stock && (
                <div>
                  <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-white/50 mb-3">Market Data</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Market Cap', value: stock.market_cap ? fmtDollar(stock.market_cap) : '—' },
                      { label: 'P/E Ratio', value: stock.pe_ratio?.toFixed(1) || '—' },
                      { label: 'Profit Margin', value: stock.profit_margin != null ? `${(stock.profit_margin * 100).toFixed(1)}%` : '—' },
                    ].map((s) => (
                      <div key={s.label} className="rounded border border-white/5 bg-white/[0.02] p-3">
                        <p className="text-xs text-white/40 mb-1">{s.label}</p>
                        <p className="font-mono text-lg text-white">{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
