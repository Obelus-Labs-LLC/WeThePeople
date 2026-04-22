import { useState, useEffect, useMemo } from 'react';
import { Search, TrendingUp, AlertTriangle, Newspaper, ExternalLink } from 'lucide-react';
import { apiFetch } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface InsiderTrade {
  id: number;
  institution_id: string | null;
  company_name: string | null;
  ticker: string | null;
  filer_name: string | null;
  filer_title: string | null;
  transaction_type: string | null;
  transaction_date: string | null;
  shares: number | null;
  price_per_share: number | null;
  total_value: number | null;
  filing_url: string | null;
}

interface Complaint {
  id: number;
  complaint_id: string | null;
  institution_id: string | null;
  company_name: string | null;
  date_received: string | null;
  product: string | null;
  issue: string | null;
  company_response: string | null;
  state: string | null;
}

interface ComplaintSummary {
  total_complaints: number;
  by_product: Record<string, number>;
  by_response: Record<string, number>;
  timely_response_pct: number;
}

interface NewsItem {
  id: number;
  title: string;
  release_date: string | null;
  url: string | null;
  category: string | null;
  summary: string | null;
}

interface Indicator {
  series_id: string;
  series_title: string;
  value: number | null;
  units: string | null;
  observation_date: string | null;
}

// ── Helpers ──

function fmtDollar(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtShares(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return n.toLocaleString();
}

function typeBadgeClasses(t: string | null): string {
  if (t === 'P') return 'bg-emerald-500/10 text-emerald-400';
  if (t === 'S') return 'bg-red-500/10 text-red-400';
  return 'bg-blue-500/10 text-blue-400';
}

const TYPE_LABELS: Record<string, string> = { P: 'PURCHASE', S: 'SALE', A: 'AWARD', G: 'GRANT' };

// ── Page ──

export default function MarketMoversPage() {
  const [trades, setTrades] = useState<InsiderTrade[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [summary, setSummary] = useState<ComplaintSummary | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'trades' | 'complaints' | 'fed'>('trades');
  const [search, setSearch] = useState('');
  const [tradeFilter, setTradeFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ trades: InsiderTrade[] }>('/finance/insider-trades', { params: { limit: 100 } }).catch(() => ({ trades: [] })),
      apiFetch<{ complaints: Complaint[] }>('/finance/complaints', { params: { limit: 100 } }).catch(() => ({ complaints: [] })),
      apiFetch<ComplaintSummary>('/finance/complaints/summary').catch(() => null),
      apiFetch<{ news: NewsItem[] }>('/finance/sector-news', { params: { limit: 20 } }).catch(() => ({ news: [] })),
      apiFetch<{ indicators: Indicator[] }>('/finance/macro-indicators').catch(() => ({ indicators: [] })),
    ]).then(([tradeRes, compRes, sumRes, newsRes, indRes]) => {
      const sorted = (tradeRes.trades || []).sort((a, b) => Math.abs(b.total_value || 0) - Math.abs(a.total_value || 0));
      setTrades(sorted);
      setComplaints(compRes.complaints || []);
      setSummary(sumRes);
      setNews(newsRes.news || []);
      setIndicators(indRes.indicators || []);
    }).finally(() => setLoading(false));
  }, []);

  const filteredTrades = useMemo(() => {
    let list = trades;
    if (tradeFilter) list = list.filter((t) => t.transaction_type === tradeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        t.company_name?.toLowerCase().includes(q) ||
        t.filer_name?.toLowerCase().includes(q) ||
        t.ticker?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [trades, tradeFilter, search]);

  const filteredComplaints = useMemo(() => {
    let list = complaints;
    if (productFilter) list = list.filter((c) => c.product === productFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.company_name?.toLowerCase().includes(q) ||
        c.issue?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [complaints, productFilter, search]);

  const productOptions = useMemo(() => {
    if (!summary?.by_product) return [];
    return Object.entries(summary.by_product).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [summary]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Market Intelligence"
        title="Market Movers"
        description="Biggest insider trades, consumer complaints, and Federal Reserve activity across the finance sector."
        accent="var(--color-green)"
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setTab('trades')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'trades' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <TrendingUp size={14} /> Big Moves ({trades.length})
        </button>
        <button
          onClick={() => setTab('complaints')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'complaints' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <AlertTriangle size={14} /> Consumer Alert ({complaints.length})
        </button>
        <button
          onClick={() => setTab('fed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'fed' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Newspaper size={14} /> Fed Watch ({news.length})
        </button>
      </div>

      {/* Search */}
      {tab !== 'fed' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder={tab === 'trades' ? 'Search company, ticker, or insider...' : 'Search company or issue...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-emerald-500/50"
            />
          </div>
          {tab === 'trades' && (
            <div className="flex items-center gap-2">
              {[null, 'P', 'S'].map((f) => (
                <button
                  key={f || 'all'}
                  onClick={() => setTradeFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    tradeFilter === f
                      ? f === 'P' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : f === 'S' ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                        : 'bg-zinc-700/50 text-white border border-zinc-600'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {f === 'P' ? 'Purchases' : f === 'S' ? 'Sales' : 'All'}
                </button>
              ))}
            </div>
          )}
          {tab === 'complaints' && productOptions.length > 0 && (
            <select
              className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white outline-none cursor-pointer"
              style={{ colorScheme: 'dark' }}
              value={productFilter || ''}
              onChange={(e) => setProductFilter(e.target.value || null)}
            >
              <option value="">All Products</option>
              {productOptions.map(([p]) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Big Moves tab */}
      {tab === 'trades' && (
        <>
          <p className="text-sm text-zinc-500 mb-4">{filteredTrades.length} trades sorted by value</p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">DATE</th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">INSIDER</th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">COMPANY</th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">TYPE</th>
                    <th className="hidden sm:table-cell px-4 py-3 text-right text-xs text-zinc-500 font-mono">SHARES</th>
                    <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono">VALUE</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.slice(0, 50).map((t) => (
                    <tr key={t.id} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                      <td className="hidden sm:table-cell px-4 py-3 text-xs text-zinc-500 font-mono">{t.transaction_date || '\u2014'}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-white">{t.filer_name || '\u2014'}</p>
                        {t.filer_title && <p className="text-xs text-zinc-500 font-mono">{t.filer_title}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-white">{t.company_name || '\u2014'}</p>
                        {t.ticker && <p className="text-xs text-emerald-400 font-mono">{t.ticker}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded px-2 py-1 text-xs font-bold font-mono ${typeBadgeClasses(t.transaction_type)}`}>
                          {TYPE_LABELS[t.transaction_type || ''] || t.transaction_type || '\u2014'}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-right text-sm text-white font-mono">{fmtShares(t.shares)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-white font-mono">{fmtDollar(t.total_value)}</td>
                      <td className="px-4 py-3 text-right">
                        {t.filing_url && (
                          <a href={t.filing_url} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-blue-400 transition-colors">
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredTrades.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-500">No trades match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Consumer Alert tab */}
      {tab === 'complaints' && (
        <>
          {summary && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs text-zinc-500 font-mono mb-1">TOTAL COMPLAINTS</p>
                <p className="text-2xl font-bold text-white">{summary.total_complaints.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs text-zinc-500 font-mono mb-1">TIMELY RESPONSE</p>
                <p className="text-2xl font-bold text-emerald-400">{summary.timely_response_pct?.toFixed(1) || 0}%</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs text-zinc-500 font-mono mb-1">TOP PRODUCT</p>
                <p className="text-lg font-bold text-white truncate">{productOptions[0]?.[0] || 'N/A'}</p>
              </div>
            </div>
          )}
          <p className="text-sm text-zinc-500 mb-4">{filteredComplaints.length} complaints</p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">DATE</th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">COMPANY</th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">PRODUCT</th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">ISSUE</th>
                    <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">RESPONSE</th>
                    <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">STATE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComplaints.slice(0, 100).map((c) => (
                    <tr key={c.id} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                      <td className="px-4 py-3 text-xs text-zinc-500 font-mono">{c.date_received || '\u2014'}</td>
                      <td className="px-4 py-3 text-sm text-white">{c.company_name || '\u2014'}</td>
                      <td className="px-4 py-3 text-xs text-zinc-400">{c.product || '\u2014'}</td>
                      <td className="px-4 py-3 text-sm text-zinc-300 max-w-xs"><span className="line-clamp-1">{c.issue || '\u2014'}</span></td>
                      <td className="hidden sm:table-cell px-4 py-3 text-xs text-zinc-500">{c.company_response || '\u2014'}</td>
                      <td className="hidden sm:table-cell px-4 py-3 text-xs text-zinc-500 font-mono">{c.state || '\u2014'}</td>
                    </tr>
                  ))}
                  {filteredComplaints.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">No complaints match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Fed Watch tab */}
      {tab === 'fed' && (
        <div className="space-y-8">
          {/* Press Releases */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4">Federal Reserve Press Releases</h2>
            {news.length === 0 ? (
              <p className="text-sm text-zinc-500 py-8 text-center">No press releases available.</p>
            ) : (
              <div className="space-y-3">
                {news.map((n) => (
                  <div key={n.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-800/30">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <a
                          href={n.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-bold text-white hover:text-blue-400 transition-colors leading-snug"
                        >
                          {n.title}
                        </a>
                        {n.summary && <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{n.summary}</p>}
                      </div>
                      {n.category && (
                        <span className="shrink-0 rounded px-2 py-0.5 text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                          {n.category}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 mt-2 font-mono">{n.release_date || ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Economic Indicators */}
          {indicators.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-white mb-4">Economic Indicators</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {indicators.map((ind) => (
                  <div key={ind.series_id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                    <p className="text-xs text-zinc-500 mb-1 line-clamp-1">{ind.series_title}</p>
                    <p className="text-xl font-bold text-white">
                      {ind.value != null ? ind.value.toLocaleString() : '\u2014'}
                      {ind.units && <span className="text-xs text-zinc-500 ml-1">{ind.units}</span>}
                    </p>
                    <p className="text-xs text-zinc-600 font-mono mt-1">{ind.observation_date || ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
