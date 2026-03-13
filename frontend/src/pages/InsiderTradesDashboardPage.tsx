import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter, Landmark, ArrowLeft } from 'lucide-react';
import FinanceNav from '../components/FinanceNav';
import {
  getAllInsiderTrades,
  getMacroIndicators,
  getSectorNews,
  type InsiderTradeItem,
  type MacroIndicator,
  type SectorNewsItem,
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

function fmtShares(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

const TYPE_LABELS: Record<string, string> = { P: 'PURCHASE', S: 'SALE', A: 'AWARD' };

function typeBadgeClasses(t: string | null): string {
  if (t === 'P') return 'bg-[rgba(16,185,129,0.1)] text-[#10B981]';
  if (t === 'S') return 'bg-[rgba(239,68,68,0.1)] text-[#EF4444]';
  return 'bg-[rgba(59,130,246,0.1)] text-[#34D399]';
}

// ── Page ──

export default function InsiderTradesDashboardPage() {
  const [trades, setTrades] = useState<InsiderTradeItem[]>([]);
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [news, setNews] = useState<SectorNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getAllInsiderTrades({ limit: 100, transaction_type: filter || undefined }),
      getMacroIndicators(),
      getSectorNews(15),
    ])
      .then(([tradesRes, macroRes, newsRes]) => {
        setTrades(tradesRes.trades || []);
        setIndicators(macroRes.indicators || []);
        setNews(newsRes.news || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  if (loading && trades.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Back to Sectors */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-body text-sm text-white/50 hover:text-white transition-colors no-underline mb-4 animate-fade-up"
        >
          <ArrowLeft size={16} />
          Back to Sectors
        </Link>

        {/* Header */}
        <div className="flex items-end justify-between mb-6 animate-fade-up">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
              Insider Trades
            </h1>
            <p className="mt-1 font-body text-lg text-white/50">
              Executive transactions, macro indicators, and sector news
            </p>
          </div>
          <div className="hidden md:flex flex-col items-end gap-1">
            <p className="font-mono text-[11px] text-white/30">
              DATA SOURCE: <span className="text-white/50">SEC FORM 4</span>
            </p>
            <p className="font-mono text-[11px] text-white/30">
              STATUS: <span className="text-[#34D399]">ONLINE</span>
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <FinanceNav />

        {/* Main Grid */}
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3" style={{ minHeight: 'calc(100vh - 300px)' }}>
          {/* Left Column: Insider Trades Table */}
          <div
            className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] shadow-2xl xl:col-span-2 animate-fade-up"
            style={{ animationDelay: '200ms', animationFillMode: 'both' }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.05] px-4 py-4">
              <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-white">
                Recent Insider Trades
              </h2>
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-white/50" />
                <select
                  className="rounded bg-white/[0.03] border border-white/10 px-2 py-1 font-mono text-xs text-white/50 outline-none"
                  value={filter || ''}
                  onChange={(e) => setFilter(e.target.value || null)}
                >
                  <option value="">ALL TYPES</option>
                  <option value="P">PURCHASE</option>
                  <option value="S">SALE</option>
                  <option value="A">AWARD</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-[#0a0a0f]">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left font-mono text-xs text-white/40">DATE</th>
                    <th className="px-4 py-3 text-left font-mono text-xs text-white/40">INSIDER</th>
                    <th className="px-4 py-3 text-left font-mono text-xs text-white/40">COMPANY</th>
                    <th className="px-4 py-3 text-left font-mono text-xs text-white/40">TYPE</th>
                    <th className="px-4 py-3 text-right font-mono text-xs text-white/40">SHARES</th>
                    <th className="px-4 py-3 text-right font-mono text-xs text-white/40">VALUE</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, idx) => (
                    <tr
                      key={t.id}
                      className="border-b border-white/10 transition-colors hover:bg-white/[0.05] animate-fade-up cursor-pointer"
                      style={{ animationDelay: `${300 + idx * 50}ms`, animationFillMode: 'both' }}
                      onClick={() => t.filing_url && window.open(t.filing_url, '_blank')}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-white/40">
                        {t.transaction_date || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-body text-sm font-bold text-white">{t.filer_name}</p>
                        {t.filer_title && (
                          <p className="font-mono text-xs text-white/40">{t.filer_title}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-body text-sm text-white">{t.company_name}</p>
                        {t.ticker && (
                          <p className="font-mono text-xs text-[#34D399]">{t.ticker}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded px-2 py-1 font-mono text-xs font-bold uppercase ${typeBadgeClasses(t.transaction_type)}`}>
                          {TYPE_LABELS[t.transaction_type || ''] || t.transaction_type || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-white">
                        {fmtShares(t.shares)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-bold text-white">
                        {fmtDollar(t.total_value)}
                      </td>
                    </tr>
                  ))}
                  {trades.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center font-body text-sm text-white/40">
                        No insider trades on record.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column */}
          <div
            className="flex flex-col gap-6 overflow-y-auto animate-fade-up"
            style={{ animationDelay: '400ms', animationFillMode: 'both' }}
          >
            {/* Macro Indicators */}
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <Landmark size={100} className="pointer-events-none absolute right-4 top-4 text-white/10 opacity-10" />
              <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-white mb-5">
                Macro Indicators
              </h2>
              <div className="space-y-4">
                {indicators.length === 0 ? (
                  <p className="font-body text-sm text-white/40">No macro data available.</p>
                ) : (
                  indicators.map((ind) => (
                    <div key={ind.series_id} className="flex items-center justify-between border-b border-white/10 pb-2">
                      <div>
                        <p className="font-body text-sm text-white">
                          {ind.series_title || ind.series_id}
                        </p>
                        <p className="font-mono text-xs text-white/40">{ind.observation_date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xl font-bold text-white">
                          {ind.value != null ? ind.value.toFixed(2) : '—'}
                        </p>
                        {ind.units && (
                          <p className="font-mono text-xs text-white/40">{ind.units}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Sector News */}
            <div className="flex flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-white mb-5">
                Sector News
              </h2>
              <div className="flex-1 space-y-4 overflow-y-auto">
                {news.length === 0 ? (
                  <p className="font-body text-sm text-white/40">No sector news available.</p>
                ) : (
                  news.map((item) => (
                    <a
                      key={item.id}
                      href={item.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="-mx-2 block rounded p-2 transition-colors hover:bg-white/[0.03] no-underline group border-b border-white/10 pb-4 mb-0"
                    >
                      <p className="font-body text-sm font-medium text-white transition-colors group-hover:text-[#34D399] mb-1">
                        {item.title || 'Untitled'}
                      </p>
                      <div className="flex items-center gap-3">
                        {item.release_date && (
                          <span className="font-mono text-xs text-white/40">{item.release_date}</span>
                        )}
                        {item.release_type && (
                          <span className="font-mono text-xs text-[#34D399]">{item.release_type}</span>
                        )}
                      </div>
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
