import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Landmark, TrendingUp, FileSearch, Calendar, Hash, Download,
  ExternalLink, CheckCircle, XCircle,
} from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';
import { FinanceSectorHeader } from '../components/SectorHeader';
import { LOCAL_LOGOS } from '../data/financeLogos';
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
      <div
        className="flex h-auto w-16 flex-shrink-0 items-center justify-center rounded px-2 py-2"
        style={{ background: 'rgba(61,184,122,0.12)' }}
      >
        <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-green)' }}>{filing.form_type || '?'}</span>
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

type TabKey = 'lobbying' | 'contracts' | 'enforcement' | 'insider' | 'donations' | 'financials';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'lobbying', label: 'Lobbying' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'enforcement', label: 'Enforcement' },
  { key: 'insider', label: 'Insider Trades' },
  { key: 'donations', label: 'Donations' },
  { key: 'financials', label: 'Financials' },
];

// ── Page ──

export default function InstitutionPage() {
  const { institution_id } = useParams<{ institution_id: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('lobbying');

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
    let stale = false;
    getInstitutionInsiderTrades(institution_id, { limit: 100, transaction_type: tradeFilter || undefined })
      .then((r) => { if (!stale) setTrades(r.trades || []); })
      .catch(() => {});
    return () => { stale = true; };
  }, [tradeFilter, institution_id, activeTab]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{ borderColor: 'var(--color-green)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p className="font-body" style={{ color: 'var(--color-text-3)' }}>Institution not found.</p>
      </div>
    );
  }

  const latestFin = financials[0] || null;
  const ACCENT = 'var(--color-green)';

  return (
    <div className="flex flex-col w-full h-screen relative">
      <div className="relative z-10 px-6 pt-4 shrink-0">
        <FinanceSectorHeader />
        <div className="mb-2">
          <Breadcrumbs items={[
            { label: 'Finance', to: '/finance' },
            { label: 'Institutions', to: '/finance/institutions' },
            { label: detail.display_name },
          ]} />
        </div>
      </div>

      {/* Top Bar */}
      <div
        className="w-full px-6 py-3 flex items-center justify-between shrink-0 z-10 shadow-md"
        style={{ background: ACCENT }}
      >
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
        <div
          className="hidden md:flex flex-col w-[30%] lg:w-[25%] border-r p-8 overflow-y-auto shrink-0"
          style={{ background: 'rgba(235,229,213,0.02)', borderColor: 'rgba(235,229,213,0.08)', scrollbarWidth: 'thin', scrollbarColor: 'rgba(235,229,213,0.1) transparent' }}
        >
          {/* Logo */}
          <div className="mb-6 flex justify-center">
            <CompanyLogo
              id={detail.institution_id}
              name={detail.display_name}
              logoUrl={detail.logo_url}
              localLogos={LOCAL_LOGOS}
              size={128}
              iconFallback
              className="rounded-2xl"
            />
          </div>

          {/* Name */}
          <div className="flex items-center justify-center gap-3 mb-1">
            <h1
              className="text-3xl font-bold leading-tight text-center"
              style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 900, color: 'var(--color-text-1)', letterSpacing: '-0.02em' }}
            >
              {detail.display_name}
            </h1>
            <WatchlistButton entityType="company" entityId={detail.institution_id || institution_id || ""} entityName={detail.display_name} sector="finance" />
          </div>
          {detail.headquarters && (
            <p className="text-sm text-center mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-3)' }}>
              {detail.headquarters}
            </p>
          )}
          <div className="flex justify-center gap-2 mb-6 flex-wrap">
            {detail.ticker && (
              <span
                className="rounded px-3 py-1 font-mono text-sm font-bold"
                style={{ background: 'rgba(61,184,122,0.14)', color: 'var(--color-green)' }}
              >
                {detail.ticker}
              </span>
            )}
            <SanctionsBadge status={detail.sanctions_status} />
            <AnomalyBadge entityType="company" entityId={institution_id || ''} />
          </div>

          {detail.ai_profile_summary && (
            <div className="mb-6">
              <span className="text-zinc-500 text-xs uppercase tracking-wider">AI Analysis</span>
              <p className="text-zinc-400 text-sm mt-1">{detail.ai_profile_summary}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-6">
            {[
              ['TICKER', detail.ticker],
              ['SECTOR', detail.sector_type?.replace(/_/g, ' ').toUpperCase()],
              ['SEC CIK', detail.sec_cik],
              ['FDIC CERT', detail.fdic_cert],
            ].map(([label, value]) => value ? (
              <div key={label}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-3)' }}>{label}</p>
                <p className="text-sm font-medium" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-1)' }}>{value}</p>
              </div>
            ) : null)}
          </div>

          {/* Market Data in sidebar */}
          {stock && (
            <div className="mt-6 space-y-3">
              <p className="text-xs uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-3)' }}>MARKET DATA</p>
              {stock.market_cap != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Market Cap</p><p className="font-mono text-lg text-white">{fmtDollar(stock.market_cap)}</p></div>}
              {stock.pe_ratio != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>P/E Ratio</p><p className="font-mono text-sm text-white">{stock.pe_ratio.toFixed(2)}</p></div>}
              {stock.eps != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>EPS</p><p className="font-mono text-sm text-white">${stock.eps.toFixed(2)}</p></div>}
              {stock.profit_margin != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Profit Margin</p><p className="font-mono text-sm text-white">{fmtPct(stock.profit_margin)}</p></div>}
              {stock.dividend_yield != null && <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Dividend Yield</p><p className="font-mono text-sm text-white">{fmtPct(stock.dividend_yield)}</p></div>}
            </div>
          )}

          {/* FDIC Snapshot in sidebar */}
          {latestFin && (
            <div className="mt-6 space-y-3">
              <p className="text-xs uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-3)' }}>FDIC SNAPSHOT</p>
              <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Total Assets</p><p className="font-mono text-lg text-white">{fmtDollar(latestFin.total_assets)}</p></div>
              <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Total Deposits</p><p className="font-mono text-sm text-white">{fmtDollar(latestFin.total_deposits)}</p></div>
              <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Net Income</p><p className="font-mono text-sm text-white">{fmtDollar(latestFin.net_income)}</p></div>
              <div><p className="text-xs text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Tier 1 Capital</p><p className="font-mono text-sm text-white">{fmtPctRaw(latestFin.tier1_capital_ratio)}</p></div>
            </div>
          )}

          {/* Stats summary */}
          <div className="mt-6 rounded-xl border p-4" style={{ background: `${ACCENT}10`, borderColor: `${ACCENT}30` }}>
            <div className="flex items-center gap-2 mb-3">
              <Landmark size={16} style={{ color: ACCENT }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: ACCENT }}>
                OVERVIEW
              </span>
            </div>
            <div className="space-y-2 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <div className="flex justify-between"><span className="text-white/50">SEC Filings</span><span className="text-white font-bold">{filings.length}</span></div>
              {detail.complaint_count > 0 && (
                <div className="flex justify-between"><span className="text-white/50">CFPB Complaints</span><span className="text-white font-bold">{detail.complaint_count.toLocaleString()}</span></div>
              )}
              {latestFin && (
                <>
                  <div className="flex justify-between"><span className="text-white/50">ROA</span><span className="text-white font-bold">{fmtPctRaw(latestFin.roa)}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">ROE</span><span className="text-white font-bold">{fmtPctRaw(latestFin.roe)}</span></div>
                </>
              )}
            </div>
          </div>

          {/* Activity Over Time */}
          {trends && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-wider mb-3" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-3)' }}>
                Activity Over Time
              </p>
              <TrendChart data={trends} height={120} />
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col min-h-0" style={{ background: 'transparent' }}>
          {/* Tabs */}
          <div className="relative flex gap-8 border-b px-8 pt-4 shrink-0" style={{ borderColor: 'rgba(235,229,213,0.08)' }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="relative pb-4 cursor-pointer bg-transparent border-0"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '14px',
                  color: activeTab === tab.key ? ACCENT : 'rgba(255,255,255,0.4)',
                  fontWeight: activeTab === tab.key ? 700 : 400,
                }}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-1 rounded-full"
                    style={{ background: ACCENT }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-8" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(235,229,213,0.1) transparent' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >

          {/* INSIDER TRADES TAB */}
          {activeTab === 'insider' && (
            <div className="flex flex-col">
              {/* Filter */}
              <div className="mb-4 flex items-center gap-3 shrink-0">
                <span className="font-mono text-xs text-white/40">FILTER:</span>
                {[{ label: 'ALL', value: null }, { label: 'PURCHASE', value: 'P' }, { label: 'SALE', value: 'S' }, { label: 'AWARD', value: 'A' }].map((opt) => {
                  const active = tradeFilter === opt.value;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => { setTradeFilter(opt.value); }}
                      className="rounded px-3 py-1 font-mono text-xs font-bold transition-colors"
                      style={{
                        background: active ? 'rgba(61,184,122,0.14)' : 'rgba(235,229,213,0.04)',
                        color: active ? 'var(--color-green)' : 'var(--color-text-3)',
                        border: `1px solid ${active ? 'rgba(61,184,122,0.3)' : 'transparent'}`,
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {/* Table */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03]">
                {!tradesLoaded ? (
                  <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: 'var(--color-green)', borderTopColor: 'transparent' }} /></div>
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
                          <td className="px-4 py-4 font-mono text-xs text-white/50">{t.transaction_date || '\u2014'}</td>
                          <td className="px-4 py-4">
                            <p className="font-body text-sm font-bold text-white">{t.filer_name}</p>
                            {t.filer_title && <p className="font-mono text-[10px] text-white/40">{t.filer_title}</p>}
                          </td>
                          <td className="px-4 py-4">
                            {(() => {
                              const isP = t.transaction_type === 'P';
                              const isS = t.transaction_type === 'S';
                              const bg = isP ? 'rgba(61,184,122,0.12)' : isS ? 'rgba(230,57,70,0.12)' : 'rgba(197,160,40,0.14)';
                              const color = isP ? 'var(--color-green)' : isS ? 'var(--color-red)' : 'var(--color-accent)';
                              return (
                                <span
                                  className="inline-block rounded px-2 py-1 font-mono text-xs font-bold uppercase"
                                  style={{ background: bg, color }}
                                >
                                  {isP ? 'PURCHASE' : isS ? 'SALE' : t.transaction_type === 'A' ? 'AWARD' : t.transaction_type || '\u2014'}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-sm text-white">{t.shares != null ? t.shares.toLocaleString() : '\u2014'}</td>
                          <td className="px-4 py-4 text-right font-mono text-sm text-white">{t.price_per_share != null ? `$${t.price_per_share.toFixed(2)}` : '\u2014'}</td>
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
            <div>
              {!lobbyingLoaded ? (
                <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: 'var(--color-green)', borderTopColor: 'transparent' }} /></div>
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
                          {f.income != null && <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-green)' }}>{fmtDollar(f.income)}</span>}
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs text-white/40 font-mono">
                        <span>{f.filing_year} {f.filing_period || ''}</span>
                        {f.filing_uuid && (
                          <a
                            href={`https://lda.senate.gov/filings/filing/${f.filing_uuid}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--color-green)', opacity: 0.75 }}
                          >
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
            <div>
              {!contractsLoaded ? (
                <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: 'var(--color-green)', borderTopColor: 'transparent' }} /></div>
              ) : contractsData.length === 0 ? (
                <p className="font-body text-sm text-white/40">No government contracts found. Data will appear after sync jobs run.</p>
              ) : (
                <div className="space-y-3">
                  <p className="font-mono text-xs text-white/40 mb-4">{contractsTotal} total contracts</p>
                  {contractsData.map((c) => (
                    <div key={c.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-body text-sm text-white flex-1 mr-4 line-clamp-2">{c.description || 'No description'}</p>
                        {c.award_amount != null && <span className="font-mono text-sm font-bold whitespace-nowrap" style={{ color: 'var(--color-green)' }}>{fmtDollar(c.award_amount)}</span>}
                      </div>
                      <div className="flex gap-3 text-xs text-white/40 font-mono">
                        {c.awarding_agency && <span>{c.awarding_agency}</span>}
                        {c.start_date && <span>{c.start_date}</span>}
                        {c.award_id && (
                          <a
                            href={`https://www.usaspending.gov/award/${c.award_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--color-green)', opacity: 0.75 }}
                          >
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
            <div>
              {!enforcementLoaded ? (
                <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: 'var(--color-green)', borderTopColor: 'transparent' }} /></div>
              ) : enforcementData.length === 0 ? (
                <p className="font-body text-sm text-white/40">No enforcement actions found. Data will appear after sync jobs run.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-6 mb-4">
                    <span className="font-mono text-xs text-white/40">{enforcementTotal} actions</span>
                    {enforcementPenalties > 0 && <span className="font-mono text-xs" style={{ color: 'var(--color-red)' }}>Total penalties: {fmtDollar(enforcementPenalties)}</span>}
                  </div>
                  {enforcementData.map((a) => (
                    <div key={a.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-body text-sm font-medium text-white flex-1 mr-4">{a.case_title}</p>
                        {a.penalty_amount != null && a.penalty_amount > 0 && (
                          <span className="font-mono text-sm font-bold whitespace-nowrap" style={{ color: 'var(--color-red)' }}>{fmtDollar(a.penalty_amount)}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs font-mono">
                        {a.case_date && <span className="text-white/40">{a.case_date}</span>}
                        {a.enforcement_type && (
                          <span
                            className="rounded px-2 py-0.5"
                            style={{ background: 'rgba(230,57,70,0.12)', color: 'var(--color-red)' }}
                          >
                            {a.enforcement_type}
                          </span>
                        )}
                        {a.source && <span className="text-white/30">{a.source}</span>}
                        {a.case_url && (
                          <a
                            href={a.case_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--color-green)', opacity: 0.75 }}
                          >
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
            <div>
              {!donationsLoaded ? (
                <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: 'var(--color-green)', borderTopColor: 'transparent' }} /></div>
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
                        {d.amount != null && <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-green)' }}>{fmtDollar(d.amount)}</span>}
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

          {/* FINANCIALS TAB (SEC filings + FDIC + FRED) */}
          {activeTab === 'financials' && (
            <div className="space-y-6">
              {/* FDIC Financials */}
              <div>
                <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-white/50 mb-3">FDIC Financials</h3>
                {latestFin ? (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { label: 'Total Assets', value: fmtDollar(latestFin.total_assets) },
                      { label: 'Total Deposits', value: fmtDollar(latestFin.total_deposits) },
                      { label: 'Net Income', value: fmtDollar(latestFin.net_income) },
                      { label: 'Net Loans', value: fmtDollar(latestFin.net_loans) },
                      { label: 'ROA', value: fmtPctRaw(latestFin.roa) },
                      { label: 'ROE', value: fmtPctRaw(latestFin.roe) },
                      { label: 'Tier 1 Capital', value: fmtPctRaw(latestFin.tier1_capital_ratio) },
                      { label: 'Efficiency Ratio', value: fmtPctRaw(latestFin.efficiency_ratio) },
                      { label: 'Noncurrent Loans', value: fmtPctRaw(latestFin.noncurrent_loan_ratio) },
                      { label: 'Net Charge-Off', value: fmtPctRaw(latestFin.net_charge_off_ratio) },
                    ].map((m) => (
                      <div key={m.label} className="rounded border border-white/5 bg-white/[0.02] p-3">
                        <p className="text-xs text-white/40 mb-1">{m.label}</p>
                        <p className="font-mono text-lg text-white">{m.value}</p>
                      </div>
                    ))}
                    {latestFin.report_date && (
                      <div className="rounded border border-white/5 bg-white/[0.02] p-3">
                        <p className="text-xs text-white/40 mb-1">Report Date</p>
                        <p className="font-mono text-lg text-white">{latestFin.report_date}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="font-body text-sm text-white/30">No FDIC data available.</p>
                )}
              </div>

              {/* Market Fundamentals */}
              {stock && (
                <div>
                  <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-white/50 mb-3">Market Fundamentals</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { label: 'Market Cap', value: fmtDollar(stock.market_cap) },
                      { label: 'P/E Ratio', value: fmtRatio(stock.pe_ratio) },
                      { label: 'Forward P/E', value: fmtRatio(stock.forward_pe) },
                      { label: 'PEG Ratio', value: fmtRatio(stock.peg_ratio) },
                      { label: 'Price/Book', value: fmtRatio(stock.price_to_book) },
                      { label: 'EPS', value: stock.eps != null ? `$${stock.eps.toFixed(2)}` : '\u2014' },
                      { label: 'Revenue (TTM)', value: fmtDollar(stock.revenue_ttm) },
                      { label: 'Profit Margin', value: fmtPct(stock.profit_margin) },
                      { label: 'Operating Margin', value: fmtPct(stock.operating_margin) },
                      { label: 'Return on Equity', value: fmtPct(stock.return_on_equity) },
                      { label: 'Dividend Yield', value: fmtPct(stock.dividend_yield) },
                      { label: '52W High', value: stock.week_52_high != null ? `$${stock.week_52_high.toFixed(2)}` : '\u2014' },
                      { label: '52W Low', value: stock.week_52_low != null ? `$${stock.week_52_low.toFixed(2)}` : '\u2014' },
                      { label: '50-Day MA', value: stock.day_50_moving_avg != null ? `$${stock.day_50_moving_avg.toFixed(2)}` : '\u2014' },
                      { label: '200-Day MA', value: stock.day_200_moving_avg != null ? `$${stock.day_200_moving_avg.toFixed(2)}` : '\u2014' },
                    ].map((m) => (
                      <div key={m.label} className="rounded border border-white/5 bg-white/[0.02] p-3">
                        <p className="text-xs text-white/40 mb-1">{m.label}</p>
                        <p className="font-mono text-lg text-white">{m.value}</p>
                      </div>
                    ))}
                  </div>
                  {(stock.sector || stock.industry) && (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      {stock.sector && <p className="font-mono text-xs text-white/40 mb-1">SECTOR: <span className="text-white/80">{stock.sector}</span></p>}
                      {stock.industry && <p className="font-mono text-xs text-white/40">INDUSTRY: <span className="text-white/80">{stock.industry}</span></p>}
                    </div>
                  )}
                </div>
              )}

              {/* SEC Filings */}
              <div>
                <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-white/50 mb-3">SEC Filings ({filings.length})</h3>
                {filings.length === 0 ? (
                  <p className="font-body text-sm text-white/30">No SEC filings.</p>
                ) : (
                  <div className="space-y-2">
                    {filings.map((f) => <FilingRow key={f.id} filing={f} />)}
                  </div>
                )}
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
