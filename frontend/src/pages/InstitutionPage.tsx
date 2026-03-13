import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Landmark, TrendingUp, FileSearch, Calendar, Hash, Download, ArrowLeft,
  ExternalLink, CheckCircle, XCircle,
} from 'lucide-react';
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
  type InstitutionDetail,
  type SECFiling,
  type FDICFinancial,
  type StockSnapshot,
  type CFPBComplaintItem,
  type ComplaintSummary,
  type PressRelease,
  type FREDObservation,
} from '../api/finance';

// ── Helpers ──

function fmtDollar(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
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

type TabKey = 'overview' | 'complaints' | 'insider' | 'news' | 'macro';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'complaints', label: 'Complaints' },
  { key: 'insider', label: 'Insider Trades' },
  { key: 'news', label: 'Press Releases' },
  { key: 'macro', label: 'Economic Data' },
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

  // Narrative expansion
  const [expandedNarratives, setExpandedNarratives] = useState<Set<number>>(new Set());

  // Load overview data on mount
  useEffect(() => {
    if (!institution_id) return;
    setLoading(true);
    Promise.all([
      getInstitutionDetail(institution_id),
      getInstitutionFilings(institution_id, { limit: 50 }),
      getInstitutionFinancials(institution_id, { limit: 5 }),
      getInstitutionStock(institution_id).catch(() => ({ stock: null })),
    ])
      .then(([d, f, fin, s]) => {
        setDetail(d);
        setFilings(f.filings || []);
        setFinancials(fin.financials || []);
        setStock(s.stock || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [institution_id]);

  // Lazy load tab data
  useEffect(() => {
    if (!institution_id) return;
    if (activeTab === 'complaints' && !complaintsLoaded) {
      Promise.all([
        getInstitutionComplaints(institution_id, { limit: 50 }),
        getInstitutionComplaintSummary(institution_id),
      ])
        .then(([c, s]) => { setComplaints(c.complaints || []); setComplaintSummary(s); setComplaintsLoaded(true); })
        .catch(console.error);
    }
    if (activeTab === 'insider' && !tradesLoaded) {
      getInstitutionInsiderTrades(institution_id, { limit: 100, transaction_type: tradeFilter || undefined })
        .then((r) => { setTrades(r.trades || []); setTradesLoaded(true); })
        .catch(console.error);
    }
    if (activeTab === 'news' && !pressLoaded) {
      getInstitutionPressReleases(institution_id, { limit: 50 })
        .then((r) => { setPressReleases(r.press_releases || []); setPressLoaded(true); })
        .catch(console.error);
    }
    if (activeTab === 'macro' && !fredLoaded) {
      getInstitutionFRED(institution_id, { limit: 200 })
        .then((r) => { setFredData(r.observations || []); setFredLoaded(true); })
        .catch(console.error);
    }
  }, [activeTab, institution_id, complaintsLoaded, tradesLoaded, pressLoaded, fredLoaded, tradeFilter]);

  // Re-fetch trades on filter change
  useEffect(() => {
    if (!institution_id || activeTab !== 'insider') return;
    getInstitutionInsiderTrades(institution_id, { limit: 100, transaction_type: tradeFilter || undefined })
      .then((r) => setTrades(r.trades || []))
      .catch(console.error);
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
        {/* Back link */}
        <Link to="/finance/institutions" className="mb-4 inline-flex items-center gap-2 font-body text-sm text-white/50 transition-colors hover:text-white no-underline shrink-0">
          <ArrowLeft size={16} />
          Back to Institutions
        </Link>

        {/* ── Top Banner ── */}
        <div className="mb-6 flex items-center gap-6 rounded-xl border border-white/10 bg-white/[0.03] p-6 animate-fade-up shrink-0">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.05] border border-white/5">
            {detail.logo_url ? (
              <img src={detail.logo_url} alt={detail.display_name} className="h-12 w-12 object-contain" />
            ) : (
              <Landmark size={24} className="text-white/20" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-3xl font-bold uppercase text-white lg:text-4xl xl:text-5xl truncate">{detail.display_name}</h1>
            <div className="mt-2 flex items-center gap-3">
              {detail.ticker && <span className="rounded bg-white/10 px-3 py-1 font-mono text-sm text-white">{detail.ticker}</span>}
              <span className="font-mono text-xs uppercase tracking-wider text-white/40">{detail.sector_type.replace(/_/g, ' ')}</span>
              {detail.headquarters && (
                <span className="flex items-center gap-1 font-body text-sm text-white/50">
                  <span className="text-white/30">·</span> {detail.headquarters}
                </span>
              )}
            </div>
          </div>
          <div className="hidden flex-shrink-0 text-right md:block">
            {detail.sec_cik && (<div className="mb-2"><p className="font-mono text-xs text-white/40">CIK</p><p className="font-mono text-lg text-white">{detail.sec_cik}</p></div>)}
            {detail.fdic_cert_number && (<div><p className="font-mono text-xs text-white/40">FDIC CERT</p><p className="font-mono text-lg text-white">{detail.fdic_cert_number}</p></div>)}
          </div>
        </div>

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
                      <MetricItem label="NPL Ratio" value={fmtPctRaw(latestFin.npl_ratio)} />
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
            </div>
          )}

          {/* COMPLAINTS TAB */}
          {activeTab === 'complaints' && (
            <div className="h-full overflow-y-auto pr-4">
              {!complaintsLoaded ? (
                <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" /></div>
              ) : (
                <>
                  {/* Summary */}
                  {complaintSummary && (
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 mb-8">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                        <p className="font-mono text-xs text-white/40 uppercase mb-2">Total Complaints</p>
                        <p className="font-heading text-4xl font-bold text-[#34D399]">{complaintSummary.total_complaints.toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                        <p className="font-mono text-xs text-white/40 uppercase mb-2">Timely Response</p>
                        <p className="font-heading text-4xl font-bold text-[#34D399]">{complaintSummary.timely_response_pct != null ? `${complaintSummary.timely_response_pct}%` : '—'}</p>
                        {complaintSummary.timely_response_pct != null && (
                          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-[#34D399]" style={{ width: `${complaintSummary.timely_response_pct}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                        <p className="font-mono text-xs text-white/40 uppercase mb-4">Product Breakdown</p>
                        <div className="space-y-3">
                          {Object.entries(complaintSummary.by_product).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([product, count]) => {
                            const pct = complaintSummary.total_complaints > 0 ? Math.round((count / complaintSummary.total_complaints) * 100) : 0;
                            return (
                              <div key={product}>
                                <div className="flex justify-between mb-1">
                                  <span className="font-body text-xs text-white/60 truncate mr-2">{product}</span>
                                  <span className="font-mono text-xs text-[#34D399] flex-shrink-0">{count}</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                                  <div className="h-full rounded-full bg-[#34D399]" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Feed */}
                  <div className="space-y-4">
                    {complaints.length === 0 ? (
                      <p className="font-body text-sm text-white/40">No complaints on record.</p>
                    ) : complaints.map((c) => (
                      <a key={c.id} href={`https://www.consumerfinance.gov/data-research/consumer-complaints/search/detail/${c.complaint_id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="block rounded-lg border border-white/10 bg-white/[0.05] p-5 transition-all duration-150 hover:border-[#34D399]/50 no-underline">
                        {/* Meta row */}
                        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 pb-4 mb-4">
                          {c.product && <span className="rounded bg-[rgba(52,211,153,0.1)] px-2 py-1 font-mono text-xs font-bold text-[#34D399]">{c.product}</span>}
                          {c.date_received && <span className="rounded bg-white/10 px-2 py-1 font-mono text-xs text-white/60">{c.date_received}</span>}
                          {c.state && <span className="rounded bg-white/10 px-2 py-1 font-mono text-xs text-white/60">{c.state}</span>}
                          {c.consumer_disputed === 'Yes' && (
                            <span className="rounded bg-[rgba(245,158,11,0.2)] px-2 py-1 font-mono text-xs font-bold text-[#FBBF24] border border-[rgba(245,158,11,0.3)]">DISPUTED</span>
                          )}
                        </div>
                        {/* Issue */}
                        <p className="font-mono text-xs text-[#34D399] mb-1">ISSUE</p>
                        <p className="font-body text-base text-white/80 leading-relaxed mb-3">
                          {c.issue}{c.sub_issue ? ` — ${c.sub_issue}` : ''}
                        </p>
                        {/* Narrative */}
                        {c.complaint_narrative && (
                          <div className="rounded-lg border border-white/5 bg-white/5 p-4 mb-3">
                            <p className="font-mono text-xs text-white/50 mb-2">CONSUMER NARRATIVE</p>
                            <p className={`font-body text-sm italic text-white/60 leading-relaxed ${expandedNarratives.has(c.id) ? '' : 'line-clamp-3'}`}>
                              {c.complaint_narrative}
                            </p>
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpandedNarratives((prev) => { const next = new Set(prev); next.has(c.id) ? next.delete(c.id) : next.add(c.id); return next; }); }}
                              className="mt-2 font-mono text-xs text-[#34D399] hover:text-[#34D399]/80 transition-colors"
                            >
                              {expandedNarratives.has(c.id) ? 'Show less' : 'Show full narrative'}
                            </button>
                          </div>
                        )}
                        {/* Footer */}
                        <div className="flex items-center justify-between rounded bg-white/[0.05] border border-white/5 px-3 py-3">
                          <span className="font-mono text-xs text-white/50">{c.company_response || 'No response'}</span>
                          <span className="flex items-center gap-1.5 font-mono text-xs">
                            {c.timely_response === 'Yes' ? (
                              <><CheckCircle size={16} strokeWidth={1.5} className="text-[#34D399]" /><span className="text-[#34D399]">Timely</span></>
                            ) : (
                              <><XCircle size={16} strokeWidth={1.5} className="text-[#F87171]" /><span className="text-[#F87171]">Not Timely</span></>
                            )}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </>
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

          {/* PRESS RELEASES TAB */}
          {activeTab === 'news' && (
            <div className="h-full overflow-y-auto pr-4">
              {!pressLoaded ? (
                <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" /></div>
              ) : pressReleases.length === 0 ? (
                <p className="font-body text-sm text-white/40">No press releases on record.</p>
              ) : (
                <div className="space-y-4">
                  {pressReleases.map((pr) => (
                    <a key={pr.id} href={pr.url || '#'} target="_blank" rel="noopener noreferrer"
                      className="group block rounded-lg border border-white/10 bg-white/5 p-5 transition-all duration-150 hover:bg-white/10 hover:border-[#34D399]/50 no-underline">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-lg font-medium text-white group-hover:text-[#34D399] transition-colors mb-2">{pr.title}</p>
                          <div className="flex items-center gap-3 mb-2">
                            {pr.release_date && <span className="font-mono text-xs text-white/40">{pr.release_date}</span>}
                            {pr.category && <span className="rounded bg-[#34D399]/10 px-2 py-0.5 font-mono text-xs text-[#34D399]">{pr.category}</span>}
                          </div>
                          {pr.summary && <p className="font-body text-sm text-white/60 leading-relaxed line-clamp-2">{pr.summary}</p>}
                        </div>
                        <ExternalLink size={16} className="flex-shrink-0 text-white/30 group-hover:text-[#34D399] transition-colors mt-1" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ECONOMIC DATA TAB */}
          {activeTab === 'macro' && (
            <div className="h-full overflow-y-auto pr-4">
              {!fredLoaded ? (
                <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" /></div>
              ) : fredData.length === 0 ? (
                <p className="font-body text-sm text-white/40">No economic data available.</p>
              ) : (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  {/* Group by series_id */}
                  {(() => {
                    const grouped = new Map<string, FREDObservation[]>();
                    fredData.forEach((obs) => {
                      if (!grouped.has(obs.series_id)) grouped.set(obs.series_id, []);
                      grouped.get(obs.series_id)!.push(obs);
                    });
                    return Array.from(grouped.entries()).map(([seriesId, observations]) => {
                      const latest = observations[0];
                      return (
                        <div key={seriesId} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-heading text-lg font-bold uppercase text-white">{seriesId}</h3>
                            <Landmark size={16} className="text-[#34D399] opacity-30" />
                          </div>
                          <p className="font-mono text-4xl font-bold text-[#34D399] mb-2">
                            {latest?.value != null ? latest.value.toFixed(2) : '—'}
                          </p>
                          <p className="font-mono text-xs text-white/40 mb-4">
                            Latest: {latest?.observation_date || '—'}
                          </p>
                          {/* Recent history */}
                          <div className="space-y-2 border-t border-white/10 pt-3">
                            {observations.slice(0, 5).map((obs, i) => (
                              <div key={i} className="flex justify-between">
                                <span className="font-mono text-xs text-white/40">{obs.observation_date}</span>
                                <span className="font-mono text-sm text-white">{obs.value != null ? obs.value.toFixed(2) : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
