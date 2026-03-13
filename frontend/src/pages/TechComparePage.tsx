import React, { useEffect, useState } from 'react';
import { Search, Building2 } from 'lucide-react';
import BackButton from '../components/BackButton';
import TechNav from '../components/TechNav';
import {
  getTechCompanies,
  getTechComparison,
  type TechCompanyListItem,
  type TechComparisonItem,
} from '../api/tech';

// ── Helpers ──

function fmtDollar(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return `${(n * 100).toFixed(1)}%`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return n.toLocaleString();
}

interface Metric {
  label: string;
  key: string;
  format: (v: number | null | undefined) => string;
}

const METRICS: Metric[] = [
  { label: 'Market Cap', key: 'market_cap', format: fmtDollar },
  { label: 'Patents Filed', key: 'patent_count', format: fmtNum },
  { label: 'Gov Contracts', key: 'contract_count', format: fmtNum },
  { label: 'Contract Value', key: 'total_contract_value', format: fmtDollar },
  { label: 'SEC Filings', key: 'filing_count', format: fmtNum },
  { label: 'Lobbying Spend', key: 'lobbying_total', format: fmtDollar },
  { label: 'Enforcement Actions', key: 'enforcement_count', format: fmtNum },
  { label: 'Total Penalties', key: 'total_penalties', format: fmtDollar },
  { label: 'P/E Ratio', key: 'pe_ratio', format: (v) => (v != null ? v.toFixed(1) : '\u2014') },
  { label: 'Profit Margin', key: 'profit_margin', format: fmtPct },
];

// ── Helpers for best/worst highlighting ──

function bestIdx(items: TechComparisonItem[], key: string, higher: boolean): number {
  let best = -1;
  let bestVal: number | null = null;
  items.forEach((item, i) => {
    const v = (item as unknown as Record<string, number | null>)[key];
    if (v == null) return;
    if (bestVal == null || (higher ? v > bestVal : v < bestVal)) {
      bestVal = v;
      best = i;
    }
  });
  return best;
}

// Keys where higher is better
const HIGHER_IS_BETTER = new Set([
  'market_cap', 'patent_count', 'contract_count', 'total_contract_value',
  'filing_count', 'profit_margin',
]);

// ── Page ──

export default function TechComparePage() {
  const [allCompanies, setAllCompanies] = useState<TechCompanyListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compared, setCompared] = useState<TechComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getTechCompanies({ limit: 200 })
      .then((res) => {
        const list = res.companies || [];
        setAllCompanies(list);
        // Auto-select first 3
        setSelectedIds(list.slice(0, 3).map((c) => c.company_id));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedIds.length < 2) {
      setCompared([]);
      return;
    }
    setComparing(true);
    getTechComparison(selectedIds)
      .then((res) => setCompared(res.companies || []))
      .catch(console.error)
      .finally(() => setComparing(false));
  }, [selectedIds]);

  function toggleCompany(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      if (prev.length >= 4) return prev; // max 4
      return [...prev, id];
    });
  }

  const filteredCompanies = search.trim()
    ? allCompanies.filter(
        (c) =>
          c.display_name.toLowerCase().includes(search.toLowerCase()) ||
          (c.ticker && c.ticker.toLowerCase().includes(search.toLowerCase())),
      )
    : allCompanies;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden px-8 py-6 lg:px-12">
        {/* Header */}
        <div className="mb-6 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <BackButton to="/technology" label="Tech Dashboard" />
            <TechNav />
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <h1 className="font-heading text-3xl font-bold tracking-tight uppercase text-zinc-50">
                Compare Entities
              </h1>
              <p className="mt-1 font-body text-sm text-zinc-500">
                Side-by-side comparison of patents, contracts, lobbying, and enforcement
              </p>
            </div>
            <span className="hidden md:block font-mono text-[10px] tracking-widest uppercase text-zinc-600 border border-zinc-800 rounded px-2 py-1">
              {selectedIds.length}/4 Selected
            </span>
          </div>
        </div>

        {/* Company selector */}
        <div className="mb-5 shrink-0">
          <div className="relative max-w-sm w-full mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search companies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-[#18181B] py-2 pl-9 pr-4 font-body text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-500 transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:rounded-full">
            {filteredCompanies.map((co) => {
              const selected = selectedIds.includes(co.company_id);
              return (
                <button
                  key={co.company_id}
                  onClick={() => toggleCompany(co.company_id)}
                  className={`rounded-full px-3 py-1 font-body text-xs font-medium transition-all cursor-pointer border ${
                    selected
                      ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                      : 'border-zinc-800 bg-[#18181B] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                  }`}
                >
                  {co.display_name}
                  {co.ticker && (
                    <span className={`ml-1.5 font-mono text-[10px] ${selected ? 'text-blue-400' : 'text-zinc-600'}`}>
                      {co.ticker}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Comparison table */}
        <div className="flex-1 overflow-auto rounded-xl border border-zinc-800 bg-[#18181B]/60 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:rounded-full">
          {compared.length < 2 ? (
            <div className="flex h-64 items-center justify-center">
              <p className="font-body text-sm text-zinc-500">
                Select 2–4 companies to compare
              </p>
            </div>
          ) : (
            <div style={{ minWidth: 800 }}>
              {/* Entity headers */}
              <div
                className="sticky top-0 z-20 grid gap-px bg-zinc-900"
                style={{ gridTemplateColumns: `200px repeat(${compared.length}, minmax(0, 1fr))` }}
              >
                <div className="bg-[#18181B] p-4 flex items-center">
                  <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-600">Metric</span>
                </div>
                {compared.map((co) => (
                  <div
                    key={co.company_id}
                    className="bg-[#18181B] p-4 text-center border-b border-blue-500/30"
                  >
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Building2 size={16} className="text-zinc-500" />
                      <span className="font-heading text-base font-bold text-white truncate">
                        {co.display_name}
                      </span>
                    </div>
                    {co.ticker && (
                      <span className="font-mono text-xs text-blue-400">{co.ticker}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Metric rows */}
              {METRICS.map((metric, idx) => {
                const best = bestIdx(compared, metric.key, HIGHER_IS_BETTER.has(metric.key));
                return (
                  <div
                    key={metric.key}
                    className="grid gap-px group"
                    style={{ gridTemplateColumns: `200px repeat(${compared.length}, minmax(0, 1fr))` }}
                  >
                    <div className={`p-4 font-body text-sm font-semibold text-zinc-300 ${idx % 2 === 0 ? 'bg-zinc-900/50' : 'bg-transparent'}`}>
                      {metric.label}
                    </div>
                    {compared.map((co, i) => (
                      <div
                        key={co.company_id}
                        className={`p-4 text-center font-mono text-sm font-semibold transition-colors ${
                          idx % 2 === 0 ? 'bg-zinc-900/50' : 'bg-transparent'
                        } ${i === best ? 'text-emerald-400' : 'text-zinc-200'}`}
                      >
                        {metric.format((co as unknown as Record<string, number | null>)[metric.key])}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {comparing && (
            <div className="flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
