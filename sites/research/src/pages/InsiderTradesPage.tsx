import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, TrendingUp, ExternalLink } from 'lucide-react';
import { apiFetch, mainSiteUrl } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface InsiderTradeItem {
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

// ── Helpers ──

function fmtDollar(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtShares(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return n.toLocaleString();
}

const TYPE_LABELS: Record<string, string> = { P: 'PURCHASE', S: 'SALE', A: 'AWARD' };

function typeBadgeClasses(t: string | null): string {
  if (t === 'P') return 'bg-emerald-500/10 text-emerald-400';
  if (t === 'S') return 'bg-red-500/10 text-red-400';
  return 'bg-blue-500/10 text-blue-400';
}

// ── Page ──

export default function InsiderTradesPage() {
  const [trades, setTrades] = useState<InsiderTradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const filteredTrades = useMemo(() => {
    if (!search.trim()) return trades;
    const q = search.toLowerCase();
    return trades.filter(
      (t) =>
        t.company_name?.toLowerCase().includes(q) ||
        t.filer_name?.toLowerCase().includes(q) ||
        t.ticker?.toLowerCase().includes(q),
    );
  }, [trades, search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params: Record<string, string | number> = { limit: 100 };
    if (filter) params.transaction_type = filter;

    apiFetch<{ trades: InsiderTradeItem[] }>('/finance/insider-trades', {
      params,
      signal: controller.signal,
    })
      .then((res) => setTrades(res.trades || []))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        console.error('[InsiderTrades] failed to load:', err);
        setError(err?.message || 'Failed to load insider trades');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filter]);

  if (loading && trades.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Insider Trades"
        title="Insider Trade Tracker"
        description="Executive stock transactions from SEC Form 4 filings across tracked financial institutions."
        accent="var(--color-green)"
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          Could not load insider trades: {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search company, ticker, or insider..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-emerald-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-zinc-500" />
          <select
            className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white outline-none cursor-pointer"
            style={{ colorScheme: 'dark' }}
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

      {/* Stats */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm text-zinc-500">
          {filteredTrades.length} trades{search.trim() ? ` matching "${search}"` : ''}
        </span>
        {loading && <div className="h-4 w-4 animate-spin rounded-full border border-emerald-400 border-t-transparent" />}
      </div>

      {/* Table */}
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
                <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                  <td className="hidden sm:table-cell px-4 py-3 text-xs text-zinc-500 font-mono">
                    {t.transaction_date || '\u2014'}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-white">{t.filer_name || '\u2014'}</p>
                    {t.filer_title && <p className="text-xs text-zinc-500 font-mono">{t.filer_title}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-sm text-white">{t.company_name || '\u2014'}</p>
                        {t.ticker && <p className="text-xs text-emerald-400 font-mono">{t.ticker}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-1 text-xs font-bold font-mono ${typeBadgeClasses(t.transaction_type)}`}>
                      {TYPE_LABELS[t.transaction_type || ''] || t.transaction_type || '\u2014'}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-right text-sm text-white font-mono">
                    {fmtShares(t.shares)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-white font-mono">
                    {fmtDollar(t.total_value)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {t.institution_id && (
                        <a
                          href={mainSiteUrl(`/finance/${t.institution_id}`)}
                          className="text-zinc-600 hover:text-emerald-400 transition-colors"
                          title="View on WeThePeople"
                        >
                          <TrendingUp size={14} />
                        </a>
                      )}
                      {t.filing_url && (
                        <a
                          href={t.filing_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-600 hover:text-blue-400 transition-colors"
                          title="SEC Filing"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTrades.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-500">
                    {search.trim() ? 'No trades match your search.' : 'No insider trades on record.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
