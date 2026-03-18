import React, { useEffect, useState, useRef } from 'react';
import {
  ChevronDown,
  GitCompareArrows,
  Building2,
  Flame,
  BarChart3,
  Shield,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { EnergySectorHeader } from '../components/SectorHeader';
import SpotlightCard from '../components/SpotlightCard';
import {
  getEnergyCompanies,
  getEnergyComparison,
  type EnergyCompanyListItem,
  type EnergyComparisonItem,
} from '../api/energy';
import { fmtDollar, fmtNum } from '../utils/format';

// ── Helpers ──

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return `${(n * 100).toFixed(1)}%`;
}

function fmtEmissions(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

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
    title: 'Political Influence',
    icon: Shield,
    accent: 'text-[#F97316]',
    metrics: [
      { label: 'Lobbying Spend', key: 'lobbying_total', format: fmtDollar },
      { label: 'Gov Contracts', key: 'contract_count', format: fmtNum },
      { label: 'Contract Value', key: 'total_contract_value', format: fmtDollar },
      { label: 'Enforcement Actions', key: 'enforcement_count', format: fmtNum, lowerIsBetter: true },
      { label: 'Total Penalties', key: 'total_penalties', format: fmtDollar, lowerIsBetter: true },
    ],
  },
  {
    title: 'Emissions',
    icon: Flame,
    accent: 'text-red-400',
    metrics: [
      { label: 'Emission Records', key: 'emission_count', format: fmtNum },
      { label: 'Total Emissions (CO2e)', key: 'total_emissions', format: fmtEmissions, lowerIsBetter: true },
    ],
  },
  {
    title: 'Financials',
    icon: TrendingUp,
    accent: 'text-emerald-400',
    metrics: [
      { label: 'Market Cap', key: 'market_cap', format: fmtDollar },
      { label: 'P/E Ratio', key: 'pe_ratio', format: (v) => (v != null ? v.toFixed(1) : '\u2014') },
      { label: 'Profit Margin', key: 'profit_margin', format: fmtPct },
    ],
  },
];

// ── Dropdown ──

function CompanyDropdown({
  label,
  value,
  onChange,
  companies,
  excludeId,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  companies: EnergyCompanyListItem[];
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

  const filtered = companies.filter((co) => {
    if (co.company_id === excludeId) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return co.display_name.toLowerCase().includes(q) || (co.ticker?.toLowerCase().includes(q));
  });

  const selected = companies.find((c) => c.company_id === value);

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <span className="block font-heading text-[10px] font-semibold tracking-wider text-white/40 uppercase mb-1.5">
        {label}
      </span>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-left transition-all hover:border-white/20 focus:outline-none focus:border-[#F97316]/50"
      >
        <span className={`font-body text-sm truncate ${selected ? 'text-white' : 'text-white/40'}`}>
          {selected ? (
            <>
              {selected.display_name}
              {selected.ticker && <span className="ml-2 font-mono text-xs text-[#F97316]">{selected.ticker}</span>}
            </>
          ) : (
            'Select company\u2026'
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
              placeholder="Search by name or ticker\u2026"
              autoFocus
              className="w-full rounded-md bg-white/[0.05] px-3 py-2 font-body text-sm text-white placeholder:text-white/40 outline-none border border-white/5 focus:border-[#F97316]/30"
            />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 font-body text-sm text-white/40">No results</p>
            ) : (
              filtered.map((co) => (
                <button
                  key={co.company_id}
                  onClick={() => {
                    onChange(co.company_id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-white/[0.05] ${
                    co.company_id === value ? 'bg-[#F97316]/10' : ''
                  }`}
                >
                  <span className="font-body text-sm text-white truncate">{co.display_name}</span>
                  {co.ticker && (
                    <span className="font-mono text-[11px] text-[#F97316] shrink-0 ml-3">{co.ticker}</span>
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

function getWinner(metric: Metric, a: EnergyComparisonItem, b: EnergyComparisonItem): 'a' | 'b' | null {
  const va = (a as unknown as Record<string, number | null>)[metric.key];
  const vb = (b as unknown as Record<string, number | null>)[metric.key];
  if (va == null || vb == null) return null;
  if (va === vb) return null;
  const higher = va > vb ? 'a' : 'b';
  return metric.lowerIsBetter ? (higher === 'a' ? 'b' : 'a') : higher;
}

// ── Page ──

export default function EnergyComparePage() {
  const [allCompanies, setAllCompanies] = useState<EnergyCompanyListItem[]>([]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [compared, setCompared] = useState<EnergyComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    getEnergyCompanies({ limit: 200 })
      .then((res) => {
        const list = Array.isArray(res.companies) ? res.companies : [];
        setAllCompanies(list);
        if (list.length >= 2) {
          setIdA(list[0].company_id);
          setIdB(list[1].company_id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleCompare() {
    if (!idA || !idB || idA === idB) return;
    setComparing(true);
    getEnergyComparison([idA, idB])
      .then((res) => setCompared(res.companies || []))
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
      </div>
    );
  }

  const coA = compared.find((c) => c.company_id === idA);
  const coB = compared.find((c) => c.company_id === idB);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        <EnergySectorHeader />

        {/* Header */}
        <div className="flex items-end justify-between mb-6 animate-fade-up">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
              Compare
            </h1>
            <p className="mt-1 font-body text-lg text-white/50">
              Side-by-side comparison of emissions, contracts, lobbying, and enforcement
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="font-mono text-[11px] text-white/30">
              DATA: <span className="text-white/50">EPA + USASPENDING + SENATE LDA</span>
            </p>
          </div>
        </div>

        {/* Selector bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 mb-8">
          <CompanyDropdown
            label="Company A"
            value={idA}
            onChange={setIdA}
            companies={allCompanies}
            excludeId={idB}
          />

          <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/[0.03] mb-0.5 shrink-0">
            <span className="font-mono text-[10px] font-bold text-white/40">VS</span>
          </div>

          <CompanyDropdown
            label="Company B"
            value={idB}
            onChange={setIdB}
            companies={allCompanies}
            excludeId={idA}
          />

          <button
            onClick={handleCompare}
            disabled={!idA || !idB || idA === idB || comparing}
            className="shrink-0 flex items-center justify-center gap-2 rounded-lg bg-[#F97316] px-6 py-3 font-heading text-sm font-bold uppercase tracking-wider text-[#0a0a0f] transition-all hover:bg-[#F97316]/90 disabled:opacity-40 disabled:cursor-not-allowed"
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
        {compared.length >= 2 && coA && coB ? (
          <>
            {/* Company identity cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              {[coA, coB].map((co) => (
                <SpotlightCard
                  key={co.company_id}
                  className="rounded-xl border border-white/10 bg-white/[0.03]"
                  spotlightColor="rgba(249, 115, 22, 0.1)"
                >
                  <div className="flex items-center gap-4 p-5">
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/10 shrink-0">
                      <Building2 size={24} className="text-white/40" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-body text-lg font-semibold text-white truncate">
                          {co.display_name}
                        </h3>
                        {co.ticker && (
                          <span className="rounded-full bg-[#F97316]/10 px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#F97316] shrink-0">
                            {co.ticker}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-white/40">
                        {co.sector_type && (
                          <span className="font-body text-xs capitalize">{co.sector_type}</span>
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

                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_1fr_1fr] items-center py-2 border-b border-white/10 mb-1">
                      <span className="font-heading text-[10px] font-semibold tracking-wider text-white/30 uppercase">Metric</span>
                      <span className="text-center font-heading text-[10px] font-semibold tracking-wider text-white/30 uppercase">{coA.display_name}</span>
                      <span className="text-center font-heading text-[10px] font-semibold tracking-wider text-white/30 uppercase">{coB.display_name}</span>
                    </div>

                    {/* Metric rows */}
                    <div>
                      {group.metrics.map((metric, idx) => {
                        const winner = getWinner(metric, coA, coB);
                        const valA = (coA as unknown as Record<string, number | null>)[metric.key];
                        const valB = (coB as unknown as Record<string, number | null>)[metric.key];
                        return (
                          <div
                            key={metric.key}
                            className={`grid grid-cols-[1fr_1fr_1fr] items-center py-3 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${
                              idx % 2 === 0 ? 'bg-white/[0.01]' : ''
                            }`}
                          >
                            <span className="font-body text-sm text-white/50 pl-1">{metric.label}</span>
                            <span className={`text-center font-mono text-sm font-semibold ${
                              winner === 'a' ? 'text-[#F97316]' : 'text-white'
                            }`}>
                              {metric.format(valA)}
                            </span>
                            <span className={`text-center font-mono text-sm font-semibold ${
                              winner === 'b' ? 'text-[#F97316]' : 'text-white'
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
                Emissions via EPA ECHO. Contracts via USASpending. Lobbying via Senate LDA.
              </p>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/40">
                  <span className="h-2 w-2 rounded-full bg-[#F97316]" /> Winner
                </span>
              </div>
            </div>
          </>
        ) : !comparing ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <GitCompareArrows size={40} className="mx-auto mb-3 text-white/20" />
              <p className="font-body text-sm text-white/40">
                Pick two companies above and hit Compare
              </p>
            </div>
          </div>
        ) : null}

        {comparing && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}
