import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Filter, Landmark, ArrowLeft } from 'lucide-react';
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
  return 'bg-[rgba(59,130,246,0.1)] text-[#3B82F6]';
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
      <div className="flex h-screen items-center justify-center bg-[#0A0D14]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0D14]">
      <div className="flex flex-1 flex-col overflow-hidden px-8 py-8 lg:px-12">
        {/* Header */}
        <div className="flex items-end justify-between border-b border-[rgba(59,130,246,0.3)] pb-6 mb-8 animate-fade-up">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.1)]">
              <Briefcase size={32} className="text-[#3B82F6]" />
            </div>
            <div>
              <Link
                to="/finance"
                className="mb-1 inline-flex items-center gap-2 font-mono text-xs text-[#64748B] transition-colors hover:text-[#3B82F6] no-underline"
              >
                <ArrowLeft size={14} />
                BACK TO OVERVIEW
              </Link>
              <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-[#F8FAFC] lg:text-5xl">
                Executive & Macro Activity
              </h1>
              <p className="mt-1 font-body text-lg text-[#94A3B8]">
                Insider trades, macro indicators, and sector news
              </p>
            </div>
          </div>
          <div className="hidden md:flex flex-col items-end gap-1">
            <p className="font-mono text-xs text-[#64748B]">
              DATA SOURCE: <span className="text-[#94A3B8]">SEC FORM 4</span>
            </p>
            <p className="font-mono text-xs text-[#64748B]">
              STATUS: <span className="text-[#3B82F6]">ONLINE</span>
            </p>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid flex-1 grid-cols-1 gap-8 overflow-hidden xl:grid-cols-3">
          {/* Left Column: Insider Trades Table */}
          <div
            className="flex flex-col overflow-hidden rounded-xl border border-[#1E293B] bg-[#0F172A] shadow-2xl xl:col-span-2 animate-fade-up"
            style={{ animationDelay: '200ms', animationFillMode: 'both' }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-[#334155] bg-[#1E293B] px-4 py-4">
              <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-[#E2E8F0]">
                Recent Insider Trades
              </h2>
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-[#94A3B8]" />
                <select
                  className="rounded bg-[#0F172A] border border-[#334155] px-2 py-1 font-mono text-xs text-[#94A3B8] outline-none"
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
                <thead className="sticky top-0 z-10 bg-[#0F172A]">
                  <tr className="border-b border-[#1E293B]">
                    <th className="px-4 py-3 text-left font-mono text-xs text-[#64748B]">DATE</th>
                    <th className="px-4 py-3 text-left font-mono text-xs text-[#64748B]">INSIDER</th>
                    <th className="px-4 py-3 text-left font-mono text-xs text-[#64748B]">COMPANY</th>
                    <th className="px-4 py-3 text-left font-mono text-xs text-[#64748B]">TYPE</th>
                    <th className="px-4 py-3 text-right font-mono text-xs text-[#64748B]">SHARES</th>
                    <th className="px-4 py-3 text-right font-mono text-xs text-[#64748B]">VALUE</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, idx) => (
                    <tr
                      key={t.id}
                      className="border-b border-[#1E293B] transition-colors hover:bg-[rgba(30,41,59,0.5)] animate-fade-up cursor-pointer"
                      style={{ animationDelay: `${300 + idx * 50}ms`, animationFillMode: 'both' }}
                      onClick={() => t.filing_url && window.open(t.filing_url, '_blank')}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-[#64748B]">
                        {t.transaction_date || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-body text-sm font-bold text-[#E2E8F0]">{t.filer_name}</p>
                        {t.filer_title && (
                          <p className="font-mono text-xs text-[#64748B]">{t.filer_title}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-body text-sm text-[#E2E8F0]">{t.company_name}</p>
                        {t.ticker && (
                          <p className="font-mono text-xs text-[#3B82F6]">{t.ticker}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded px-2 py-1 font-mono text-xs font-bold uppercase ${typeBadgeClasses(t.transaction_type)}`}>
                          {TYPE_LABELS[t.transaction_type || ''] || t.transaction_type || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-[#E2E8F0]">
                        {fmtShares(t.shares)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-bold text-[#F8FAFC]">
                        {fmtDollar(t.total_value)}
                      </td>
                    </tr>
                  ))}
                  {trades.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center font-body text-sm text-[#64748B]">
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
            <div className="relative overflow-hidden rounded-xl border border-[#1E293B] bg-[#0F172A] p-6">
              <Landmark size={100} className="pointer-events-none absolute right-4 top-4 text-[#1E293B] opacity-10" />
              <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-[#E2E8F0] mb-5">
                Macro Indicators
              </h2>
              <div className="space-y-4">
                {indicators.length === 0 ? (
                  <p className="font-body text-sm text-[#64748B]">No macro data available.</p>
                ) : (
                  indicators.map((ind) => (
                    <div key={ind.series_id} className="flex items-center justify-between border-b border-[#1E293B] pb-2">
                      <div>
                        <p className="font-body text-sm text-[#E2E8F0]">
                          {ind.series_title || ind.series_id}
                        </p>
                        <p className="font-mono text-xs text-[#64748B]">{ind.observation_date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xl font-bold text-[#F8FAFC]">
                          {ind.value != null ? ind.value.toFixed(2) : '—'}
                        </p>
                        {ind.units && (
                          <p className="font-mono text-xs text-[#64748B]">{ind.units}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Sector News */}
            <div className="flex flex-1 flex-col rounded-xl border border-[#1E293B] bg-[#0F172A] p-6">
              <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-[#E2E8F0] mb-5">
                Sector News
              </h2>
              <div className="flex-1 space-y-4 overflow-y-auto">
                {news.length === 0 ? (
                  <p className="font-body text-sm text-[#64748B]">No sector news available.</p>
                ) : (
                  news.map((item) => (
                    <a
                      key={item.id}
                      href={item.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="-mx-2 block rounded p-2 transition-colors hover:bg-[rgba(30,41,59,0.3)] no-underline group border-b border-[#1E293B] pb-4 mb-0"
                    >
                      <p className="font-body text-sm font-medium text-[#E2E8F0] transition-colors group-hover:text-[#3B82F6] mb-1">
                        {item.title || 'Untitled'}
                      </p>
                      <div className="flex items-center gap-3">
                        {item.release_date && (
                          <span className="font-mono text-xs text-[#64748B]">{item.release_date}</span>
                        )}
                        {item.release_type && (
                          <span className="font-mono text-xs text-[#3B82F6]">{item.release_type}</span>
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
