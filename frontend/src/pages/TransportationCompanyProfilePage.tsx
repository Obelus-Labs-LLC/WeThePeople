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
import { TransportationSectorHeader } from '../components/SectorHeader';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';
import SanctionsBadge from '../components/SanctionsBadge';
import {
  getTransportationCompanyDetail,
  getTransportationCompanyContracts,
  getTransportationCompanyContractSummary,
  getTransportationCompanyLobbying,
  getTransportationCompanyLobbySummary,
  getTransportationCompanyEnforcement,
  getTransportationCompanyFilings,
  getTransportationCompanyStock,
  type TransportationCompanyDetail,
  type TransportationContractItem,
  type TransportationContractSummary,
  type TransportationLobbyingItem,
  type TransportationLobbySummary,
  type TransportationEnforcementItem,
  type TransportationFilingItem,
  type TransportationStockData,
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

type TabKey = 'overview' | 'contracts' | 'lobbying' | 'enforcement' | 'filings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'lobbying', label: 'Lobbying' },
  { key: 'enforcement', label: 'Enforcement' },
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
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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
        .catch(console.error);
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
        .catch(console.error);
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getTransportationCompanyEnforcement(companyId, { limit: 100 })
        .then((r) => {
          setEnforcement(r.actions || []); setEnforcementTotal(r.total);
          setTotalPenalties(r.total_penalties || 0);
          setEnforcementLoaded(true);
        })
        .catch(console.error);
    }
    if (activeTab === 'filings' && !filingsLoaded) {
      getTransportationCompanyFilings(companyId, { limit: 100 })
        .then((r) => { setFilings(r.filings || []); setFilingTotal(r.total); setFilingsLoaded(true); })
        .catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, companyId]);

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
        <div className="mb-4 shrink-0"><BackButton to="/transportation/companies" label="Companies" /></div>

        {/* Company Banner */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="mb-6 flex items-center gap-6 rounded-xl border border-white/10 bg-white/[0.03] p-6 shrink-0">
          <CompanyLogo id={detail.company_id} name={detail.display_name} logoUrl={detail.logo_url} size={64} iconFallback />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-3xl font-bold uppercase text-white lg:text-4xl xl:text-5xl truncate">{detail.display_name}</h1>
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
                  <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-white/50 mb-3">AI Profile Summary</h3>
                  <p className="font-body text-sm text-white/70 leading-relaxed whitespace-pre-line">{detail.ai_profile_summary}</p>
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
