import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building, ArrowLeft } from 'lucide-react';
import {
  getInstitutions,
  getFinanceComparison,
  type InstitutionListItem,
  type ComparisonInstitution,
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
  return `${(n * 100).toFixed(1)}%`;
}

function fmtPctRaw(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(1)}%`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

interface Metric {
  label: string;
  key: string;
  format: (v: number | null | undefined) => string;
}

const METRICS: Metric[] = [
  { label: 'Market Cap', key: 'market_cap', format: fmtDollar },
  { label: 'Total Assets', key: 'total_assets', format: fmtDollar },
  { label: 'Total Deposits', key: 'total_deposits', format: fmtDollar },
  { label: 'Net Income', key: 'net_income', format: fmtDollar },
  { label: 'P/E Ratio', key: 'pe_ratio', format: (v) => v != null ? v.toFixed(1) : '—' },
  { label: 'Profit Margin', key: 'profit_margin', format: fmtPct },
  { label: 'ROA', key: 'roa', format: fmtPctRaw },
  { label: 'ROE', key: 'roe', format: fmtPctRaw },
  { label: 'Tier 1 Capital', key: 'tier1_capital_ratio', format: fmtPctRaw },
  { label: 'SEC Filings', key: 'filing_count', format: fmtNum },
  { label: 'CFPB Complaints', key: 'complaint_count', format: fmtNum },
];

// ── Page ──

export default function FinanceComparePage() {
  const [allInstitutions, setAllInstitutions] = useState<InstitutionListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compared, setCompared] = useState<ComparisonInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  // Load institution list on mount
  useEffect(() => {
    getInstitutions({ limit: 50 })
      .then((res) => {
        setAllInstitutions(res.institutions || []);
        // Auto-select first 3
        const first3 = (res.institutions || []).slice(0, 3).map((i) => i.institution_id);
        setSelectedIds(first3);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Fetch comparison when selectedIds change
  useEffect(() => {
    if (selectedIds.length < 2) {
      setCompared([]);
      return;
    }
    setComparing(true);
    getFinanceComparison(selectedIds)
      .then((res) => setCompared(res.institutions || []))
      .catch(console.error)
      .finally(() => setComparing(false));
  }, [selectedIds]);

  function toggleInstitution(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#E5E5E5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#111111] border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden"
      style={{ backgroundColor: '#E5E5E5' }}
    >
      {/* Brutalist grid background */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.02]"
        style={{
          backgroundImage:
            'linear-gradient(#000000 1px, transparent 1px), linear-gradient(90deg, #000000 1px, transparent 1px)',
          backgroundSize: '100px 100px',
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col overflow-hidden px-8 py-8 lg:px-12">
        {/* Header */}
        <div className="flex items-end justify-between border-b-4 border-[#111111] pb-4 mb-8 animate-fade-up">
          <div>
            <Link
              to="/finance"
              className="mb-2 inline-flex items-center gap-2 font-mono text-xs text-[rgba(17,17,17,0.5)] transition-colors hover:text-[#111111] no-underline"
            >
              <ArrowLeft size={14} />
              BACK TO OVERVIEW
            </Link>
            <h1 className="font-heading text-5xl font-black uppercase tracking-tighter text-[#111111]">
              Cross-Institution Comparison
            </h1>
            <p className="mt-1 font-body text-xl font-medium text-[rgba(17,17,17,0.5)]">
              Side-by-side financial metrics
            </p>
          </div>
          <div className="hidden md:block rounded border-2 border-[#111111] bg-[#00FF9D] px-2 py-2">
            <p className="font-mono text-xs font-bold text-[#111111]">BENCHMARK</p>
          </div>
        </div>

        {/* Institution selector pills */}
        <div className="mb-6 flex flex-wrap gap-2">
          {allInstitutions.map((inst) => {
            const selected = selectedIds.includes(inst.institution_id);
            return (
              <button
                key={inst.institution_id}
                onClick={() => toggleInstitution(inst.institution_id)}
                className={`rounded border-2 px-3 py-1.5 font-body text-sm font-medium transition-all ${
                  selected
                    ? 'border-[#111111] bg-[#111111] text-white'
                    : 'border-[rgba(17,17,17,0.2)] bg-white text-[#111111] hover:border-[#111111]'
                }`}
              >
                {inst.display_name}
                {inst.ticker && (
                  <span className={`ml-2 font-mono text-xs ${selected ? 'text-[#00FF9D]' : 'text-[rgba(17,17,17,0.4)]'}`}>
                    {inst.ticker}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Comparison Table */}
        <div className="flex-1 overflow-auto">
          {compared.length < 2 ? (
            <div className="flex h-64 items-center justify-center">
              <p className="font-body text-lg text-[rgba(17,17,17,0.4)]">
                Select 2–3 institutions to compare
              </p>
            </div>
          ) : (
            <div style={{ minWidth: 1000 }}>
              {/* Entity headers (sticky) */}
              <div
                className="sticky top-0 z-20 grid gap-4 pb-4"
                style={{ gridTemplateColumns: `repeat(${compared.length + 1}, minmax(0, 1fr))`, backgroundColor: '#E5E5E5' }}
              >
                {/* Empty first column */}
                <div />
                {compared.map((inst, idx) => (
                  <div
                    key={inst.institution_id}
                    className="flex flex-col items-center border-b-4 border-[#00FF9D] bg-[#111111] p-6 text-center shadow-[4px_4px_0px_#000000] animate-fade-up"
                    style={{ animationDelay: `${100 + idx * 100}ms`, animationFillMode: 'both' }}
                  >
                    <div className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded bg-white">
                      <Building size={24} className="text-[#111111]" />
                    </div>
                    {inst.ticker && (
                      <p className="font-mono text-sm font-bold text-[#00FF9D] mb-1">{inst.ticker}</p>
                    )}
                    <p className="font-body text-lg text-white">{inst.display_name}</p>
                  </div>
                ))}
              </div>

              {/* Metric rows */}
              <div className="mt-2 space-y-2">
                {METRICS.map((metric, idx) => (
                  <div
                    key={metric.key}
                    className="group grid gap-4 items-center animate-fade-up"
                    style={{
                      gridTemplateColumns: `repeat(${compared.length + 1}, minmax(0, 1fr))`,
                      animationDelay: `${300 + idx * 50}ms`,
                      animationFillMode: 'both',
                    }}
                  >
                    {/* Label */}
                    <div className="border-2 border-transparent bg-[rgba(255,255,255,0.5)] p-4 font-body text-lg font-bold text-[#111111] transition-colors group-hover:border-[#111111]">
                      {metric.label}
                    </div>
                    {/* Values */}
                    {compared.map((inst) => (
                      <div
                        key={inst.institution_id}
                        className="border-2 border-[rgba(17,17,17,0.1)] bg-white p-4 text-center font-mono text-xl font-bold text-[#111111] shadow-sm transition-colors group-hover:border-[#111111]"
                      >
                        {metric.format((inst as unknown as Record<string, number | null>)[metric.key])}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {comparing && (
            <div className="mt-4 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#111111] border-t-transparent" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
