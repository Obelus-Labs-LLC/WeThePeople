import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  GitCompareArrows,
  TrendingUp,
  Shield,
  BarChart3,
  Activity,
  Building2,
  MapPin,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';
import SpotlightCard from '../components/SpotlightCard';
import { FinanceSectorHeader } from '../components/SectorHeader';
import { LOCAL_LOGOS } from '../data/financeLogos';
import {
  getInstitutions,
  getFinanceComparison,
  type InstitutionListItem,
  type ComparisonInstitution,
} from '../api/finance';
import { fmtDollar, fmtNum } from '../utils/format';

// ── Helpers ──

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function fmtPctRaw(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(2)}%`;
}

function fmtRatio(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(2);
}

function instLogoUrl(inst: { institution_id: string; logo_url?: string | null; display_name: string }): string {
  if (LOCAL_LOGOS.has(inst.institution_id)) return `/logos/${inst.institution_id}.png`;
  if (inst.logo_url) return inst.logo_url;
  return '';
}

const SECTOR_LABELS: Record<string, string> = {
  bank: 'Banking',
  investment: 'Investment',
  insurance: 'Insurance',
  fintech: 'Fintech',
  central_bank: 'Central Bank',
};

// ── Metric types ──

interface Metric {
  label: string;
  key: string;
  format: (v: number | null | undefined) => string;
  lowerIsBetter?: boolean;
}

interface MetricGroup {
  title: string;
  icon: LucideIcon;
  accent: string;
  metrics: Metric[];
}

const METRIC_GROUPS: MetricGroup[] = [
  {
    title: 'Valuation',
    icon: TrendingUp,
    accent: 'text-[#34D399]',
    metrics: [
      { label: 'Market Cap', key: 'market_cap', format: fmtDollar },
      { label: 'P/E Ratio', key: 'pe_ratio', format: fmtRatio },
      { label: 'Forward P/E', key: 'forward_pe', format: fmtRatio, lowerIsBetter: true },
      { label: 'PEG Ratio', key: 'peg_ratio', format: fmtRatio, lowerIsBetter: true },
      { label: 'Price / Book', key: 'price_to_book', format: fmtRatio },
      { label: 'EPS (TTM)', key: 'eps', format: (v) => v != null ? `$${v.toFixed(2)}` : '—' },
      { label: 'Revenue (TTM)', key: 'revenue_ttm', format: fmtDollar },
    ],
  },
  {
    title: 'Performance',
    icon: BarChart3,
    accent: 'text-emerald-400',
    metrics: [
      { label: 'Profit Margin', key: 'profit_margin', format: fmtPct },
      { label: 'Operating Margin', key: 'operating_margin', format: fmtPct },
      { label: 'ROA', key: 'roa', format: fmtPctRaw },
      { label: 'ROE', key: 'roe', format: fmtPctRaw },
      { label: 'Return on Equity', key: 'return_on_equity', format: fmtPct },
      { label: 'Efficiency Ratio', key: 'efficiency_ratio', format: fmtPctRaw, lowerIsBetter: true },
    ],
  },
  {
    title: 'Balance Sheet',
    icon: Building2,
    accent: 'text-blue-400',
    metrics: [
      { label: 'Total Assets', key: 'total_assets', format: fmtDollar },
      { label: 'Total Deposits', key: 'total_deposits', format: fmtDollar },
      { label: 'Net Loans', key: 'net_loans', format: fmtDollar },
      { label: 'Net Income', key: 'net_income', format: fmtDollar },
      { label: 'Dividend Yield', key: 'dividend_yield', format: fmtPct },
      { label: 'Dividend / Share', key: 'dividend_per_share', format: (v) => v != null ? `$${v.toFixed(2)}` : '—' },
    ],
  },
  {
    title: 'Risk & Capital',
    icon: Shield,
    accent: 'text-amber-400',
    metrics: [
      { label: 'Tier 1 Capital', key: 'tier1_capital_ratio', format: fmtPctRaw },
      { label: 'Noncurrent Loans', key: 'noncurrent_loan_ratio', format: fmtPctRaw, lowerIsBetter: true },
      { label: 'Net Charge-Offs', key: 'net_charge_off_ratio', format: fmtPctRaw, lowerIsBetter: true },
      { label: '52-Week High', key: 'week_52_high', format: (v) => v != null ? `$${v.toFixed(2)}` : '—' },
      { label: '52-Week Low', key: 'week_52_low', format: (v) => v != null ? `$${v.toFixed(2)}` : '—' },
    ],
  },
  {
    title: 'Regulatory Activity',
    icon: Activity,
    accent: 'text-pink',
    metrics: [
      { label: 'SEC Filings', key: 'filing_count', format: fmtNum },
      { label: 'CFPB Complaints', key: 'complaint_count', format: fmtNum, lowerIsBetter: true },
    ],
  },
];

// ── Dropdown ──

function InstitutionDropdown({
  label,
  value,
  onChange,
  institutions,
  excludeId,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  institutions: InstitutionListItem[];
  excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = institutions.filter((inst) => {
    if (inst.institution_id === excludeId) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return inst.display_name.toLowerCase().includes(q) || (inst.ticker?.toLowerCase().includes(q));
  });

  const selected = institutions.find((i) => i.institution_id === value);

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <span className="block font-heading text-[10px] font-semibold tracking-wider text-white/40 uppercase mb-1.5">
        {label}
      </span>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-left transition-all hover:border-white/20 focus:outline-none focus:border-[#34D399]/50"
      >
        <span className={`font-body text-sm truncate ${selected ? 'text-white' : 'text-white/40'}`}>
          {selected ? (
            <>
              {selected.display_name}
              {selected.ticker && <span className="ml-2 font-mono text-xs text-[#34D399]">{selected.ticker}</span>}
            </>
          ) : (
            'Select institution…'
          )}
        </span>
        <ChevronDown size={16} className={`text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-white/10 bg-[#111111] shadow-2xl max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-white/5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or ticker…"
              autoFocus
              className="w-full rounded-md bg-white/[0.05] px-3 py-2 font-body text-sm text-white placeholder:text-white/40 outline-none border border-white/5 focus:border-[#34D399]/30"
            />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 font-body text-sm text-white/40">No results</p>
            ) : (
              filtered.map((inst) => (
                <button
                  key={inst.institution_id}
                  onClick={() => {
                    onChange(inst.institution_id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-white/[0.05] ${
                    inst.institution_id === value ? 'bg-[#34D399]/10' : ''
                  }`}
                >
                  <span className="font-body text-sm text-white truncate">{inst.display_name}</span>
                  {inst.ticker && (
                    <span className="font-mono text-[11px] text-[#34D399] shrink-0 ml-3">{inst.ticker}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Winner logic ──

function getWinner(metric: Metric, a: ComparisonInstitution, b: ComparisonInstitution): 'a' | 'b' | null {
  const va = (a as unknown as Record<string, number | null>)[metric.key];
  const vb = (b as unknown as Record<string, number | null>)[metric.key];
  if (va == null || vb == null) return null;
  if (va === vb) return null;
  const higher = va > vb ? 'a' : 'b';
  return metric.lowerIsBetter ? (higher === 'a' ? 'b' : 'a') : higher;
}

// ── Page ──

export default function FinanceComparePage() {
  const [allInstitutions, setAllInstitutions] = useState<InstitutionListItem[]>([]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [compared, setCompared] = useState<ComparisonInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    getInstitutions({ limit: 50 })
      .then((res) => {
        const list = res.institutions || [];
        setAllInstitutions(list);
        if (list.length >= 2) {
          setIdA(list[0].institution_id);
          setIdB(list[1].institution_id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleCompare() {
    if (!idA || !idB || idA === idB) return;
    setComparing(true);
    getFinanceComparison([idA, idB])
      .then((res) => setCompared(res.institutions || []))
      .catch(console.error)
      .finally(() => setComparing(false));
  }

  // Auto-compare on first load
  useEffect(() => {
    if (idA && idB && idA !== idB && compared.length === 0 && !comparing) {
      handleCompare();
    }
  }, [idA, idB]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" />
      </div>
    );
  }

  const instA = compared.find((c) => c.institution_id === idA);
  const instB = compared.find((c) => c.institution_id === idB);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        <FinanceSectorHeader />

        {/* Header */}
        <div className="flex items-end justify-between mb-6 animate-fade-up">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
              Compare
            </h1>
            <p className="mt-1 font-body text-lg text-white/50">
              Side-by-side financial metrics across all tracked data points
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="font-mono text-[11px] text-white/30">
              DATA: <span className="text-white/50">FDIC + SEC + CFPB + ALPHA VANTAGE</span>
            </p>
          </div>
        </div>

        {/* Selector bar */}
        <div className="flex items-end gap-3 mb-8">
          <InstitutionDropdown
            label="Institution A"
            value={idA}
            onChange={setIdA}
            institutions={allInstitutions}
            excludeId={idB}
          />

          <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/[0.03] mb-0.5 shrink-0">
            <span className="font-mono text-[10px] font-bold text-white/40">VS</span>
          </div>

          <InstitutionDropdown
            label="Institution B"
            value={idB}
            onChange={setIdB}
            institutions={allInstitutions}
            excludeId={idA}
          />

          <button
            onClick={handleCompare}
            disabled={!idA || !idB || idA === idB || comparing}
            className="shrink-0 flex items-center gap-2 rounded-lg bg-[#34D399] px-6 py-3 font-heading text-sm font-bold uppercase tracking-wider text-[#0a0a0f] transition-all hover:bg-[#34D399]/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {comparing ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0a0a0f] border-t-transparent" />
            ) : (
              <GitCompareArrows size={16} />
            )}
            Compare
          </button>
        </div>

        {/* Results */}
        {compared.length >= 2 && instA && instB ? (
          <>
            {/* Institution identity cards */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {[instA, instB].map((inst) => (
                <SpotlightCard
                  key={inst.institution_id}
                  className="rounded-xl border border-white/10 bg-white/[0.03]"
                  spotlightColor="rgba(52, 211, 153, 0.1)"
                >
                  <div className="flex items-center gap-4 p-5">
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/10 shrink-0">
                      {instLogoUrl(inst) ? (
                        <img
                          src={instLogoUrl(inst)}
                          alt={inst.display_name}
                          className="h-10 w-10 rounded object-contain"
                        />
                      ) : (
                        <Building2 size={24} className="text-white/40" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-body text-lg font-semibold text-white truncate">
                          {inst.display_name}
                        </h3>
                        {inst.ticker && (
                          <span className="rounded-full bg-[#34D399]/10 px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#34D399] shrink-0">
                            {inst.ticker}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-white/40">
                        {inst.sector_type && (
                          <span className="flex items-center gap-1 font-body text-xs">
                            <Briefcase size={12} />
                            {SECTOR_LABELS[inst.sector_type] || inst.sector_type}
                          </span>
                        )}
                        {inst.headquarters && (
                          <span className="flex items-center gap-1 font-body text-xs">
                            <MapPin size={12} />
                            {inst.headquarters}
                          </span>
                        )}
                        {inst.industry && (
                          <span className="font-body text-xs">{inst.industry}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </SpotlightCard>
              ))}
            </div>

            {/* Metric group sections */}
            <div className="space-y-6">
              {METRIC_GROUPS.map((group) => {
                const GroupIcon = group.icon;
                return (
                  <div key={group.title}>
                    {/* Section header */}
                    <div className="flex items-center gap-2 mb-3">
                      <GroupIcon size={16} className={group.accent} />
                      <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-white/50">
                        {group.title}
                      </h2>
                      <div className="flex-1 h-px bg-white/5" />
                    </div>

                    {/* Metrics grid — 2 columns of metric rows */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-0">
                      {group.metrics.map((metric) => {
                        const winner = getWinner(metric, instA, instB);
                        const valA = (instA as unknown as Record<string, number | null>)[metric.key];
                        const valB = (instB as unknown as Record<string, number | null>)[metric.key];
                        return (
                          <div
                            key={metric.key}
                            className="grid grid-cols-[1fr_1fr_1fr] items-center py-2.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                          >
                            <span className="font-body text-sm text-white/50">{metric.label}</span>
                            <span className={`text-center font-mono text-sm font-semibold ${
                              winner === 'a' ? 'text-[#34D399]' : 'text-white'
                            }`}>
                              {metric.format(valA)}
                            </span>
                            <span className={`text-center font-mono text-sm font-semibold ${
                              winner === 'b' ? 'text-[#34D399]' : 'text-white'
                            }`}>
                              {metric.format(valB)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-white/5 flex items-center justify-between">
              <p className="font-mono text-[10px] text-white/40">
                FDIC data in thousands USD. Stock data via Alpha Vantage. Complaints via CFPB.
              </p>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/40">
                  <span className="h-2 w-2 rounded-full bg-[#34D399]" /> Winner
                </span>
              </div>
            </div>
          </>
        ) : !comparing ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <GitCompareArrows size={40} className="mx-auto mb-3 text-white/40/30" />
              <p className="font-body text-sm text-white/40">
                Pick two institutions above and hit Compare
              </p>
            </div>
          </div>
        ) : null}

        {comparing && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}
