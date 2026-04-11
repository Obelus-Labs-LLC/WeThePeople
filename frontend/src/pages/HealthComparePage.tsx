import React, { useEffect, useState, useRef } from 'react';
import {
  ChevronDown,
  GitCompareArrows,
  Building2,
  Shield,
  AlertTriangle,
  FlaskConical,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { HealthSectorHeader } from '../components/SectorHeader';
import SpotlightCard from '../components/SpotlightCard';
import {
  getHealthCompanies,
  type CompanyListItem,
} from '../api/health';
import { fmtDollar, fmtNum } from '../utils/format';
import { getApiBaseUrl } from '../api/client';

// ── Types ──

interface HealthComparisonItem {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  adverse_event_count: number;
  recall_count: number;
  trial_count: number;
  contract_count: number;
  total_contract_value: number;
  lobbying_total: number;
  enforcement_count: number;
  total_penalties: number;
  market_cap: number | null;
  pe_ratio: number | null;
  profit_margin: number | null;
}

interface HealthComparisonResponse {
  companies: HealthComparisonItem[];
}

async function getHealthComparison(ids: string[]): Promise<HealthComparisonResponse> {
  const API_BASE = getApiBaseUrl();
  const url = `${API_BASE}/health/compare?ids=${ids.map(id => encodeURIComponent(id)).join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── Helpers ──

const ACCENT = '#F43F5E';

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return `${(n * 100).toFixed(1)}%`;
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
    accent: `text-[${ACCENT}]`,
    metrics: [
      { label: 'Lobbying Spend', key: 'lobbying_total', format: fmtDollar },
      { label: 'Gov Contracts', key: 'contract_count', format: fmtNum },
      { label: 'Contract Value', key: 'total_contract_value', format: fmtDollar },
      { label: 'Enforcement Actions', key: 'enforcement_count', format: fmtNum, lowerIsBetter: true },
      { label: 'Total Penalties', key: 'total_penalties', format: fmtDollar, lowerIsBetter: true },
    ],
  },
  {
    title: 'Safety & Compliance',
    icon: AlertTriangle,
    accent: 'text-amber-400',
    metrics: [
      { label: 'Adverse Events', key: 'adverse_event_count', format: fmtNum, lowerIsBetter: true },
      { label: 'Active Recalls', key: 'recall_count', format: fmtNum, lowerIsBetter: true },
    ],
  },
  {
    title: 'Clinical Pipeline',
    icon: FlaskConical,
    accent: 'text-violet-400',
    metrics: [
      { label: 'Clinical Trials', key: 'trial_count', format: fmtNum },
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
  companies: CompanyListItem[];
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
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if ((e.key === 'Enter' || e.key === ' ') && !open) { e.preventDefault(); setOpen(true); }
          if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-left transition-all hover:border-white/20 focus:outline-none focus:border-[${ACCENT}]/50`}
      >
        <span className={`font-body text-sm truncate ${selected ? 'text-white' : 'text-white/40'}`}>
          {selected ? (
            <>
              {selected.display_name}
              {selected.ticker && <span className="ml-2 font-mono text-xs" style={{ color: ACCENT }}>{selected.ticker}</span>}
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
              className={`w-full rounded-md bg-white/[0.05] px-3 py-2 font-body text-sm text-white placeholder:text-white/40 outline-none border border-white/5 focus:border-[${ACCENT}]/30`}
            />
          </div>
          <div className="overflow-y-auto" role="listbox">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 font-body text-sm text-white/40">No results</p>
            ) : (
              filtered.map((co) => (
                <button
                  key={co.company_id}
                  role="option"
                  aria-selected={co.company_id === value}
                  onClick={() => {
                    onChange(co.company_id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
                  style={co.company_id === value ? { backgroundColor: `${ACCENT}15` } : {}}
                >
                  <span className="font-body text-sm text-white truncate">{co.display_name}</span>
                  {co.ticker && (
                    <span className="font-mono text-[11px] shrink-0 ml-3" style={{ color: ACCENT }}>{co.ticker}</span>
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

function getWinner(metric: Metric, a: HealthComparisonItem, b: HealthComparisonItem): 'a' | 'b' | null {
  const va = (a as unknown as Record<string, number | null>)[metric.key];
  const vb = (b as unknown as Record<string, number | null>)[metric.key];
  if (va == null || vb == null) return null;
  if (va === vb) return null;
  const higher = va > vb ? 'a' : 'b';
  return metric.lowerIsBetter ? (higher === 'a' ? 'b' : 'a') : higher;
}

// ── Page ──

export default function HealthComparePage() {
  const [allCompanies, setAllCompanies] = useState<CompanyListItem[]>([]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [compared, setCompared] = useState<HealthComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    let stale = false;
    getHealthCompanies({ limit: 200 })
      .then((res) => {
        if (stale) return;
        const list = Array.isArray(res.companies) ? res.companies : [];
        setAllCompanies(list);
        if (list.length >= 2) {
          setIdA(list[0].company_id);
          setIdB(list[1].company_id);
        }
      })
      .catch(() => {})
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, []);

  function handleCompare() {
    if (!idA || !idB || idA === idB) return;
    setComparing(true);
    getHealthComparison([idA, idB])
      .then((res) => setCompared(res.companies || []))
      .catch(() => {})
      .finally(() => setComparing(false));
  }

  // Auto-compare on first load
  useEffect(() => {
    if (!idA || !idB || idA === idB || compared.length !== 0 || comparing) return;
    let stale = false;
    setComparing(true);
    getHealthComparison([idA, idB])
      .then((res) => { if (!stale) setCompared(res.companies || []); })
      .catch(() => {})
      .finally(() => { if (!stale) setComparing(false); });
    return () => { stale = true; };
  }, [idA, idB]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const coA = compared.find((c) => c.company_id === idA);
  const coB = compared.find((c) => c.company_id === idB);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        <HealthSectorHeader />

        {/* Header */}
        <div className="flex items-end justify-between mb-6 animate-fade-up">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
              Compare
            </h1>
            <p className="mt-1 font-body text-lg text-white/50">
              Side-by-side comparison of safety, clinical pipeline, lobbying, and enforcement
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="font-mono text-[11px] text-white/30">
              DATA: <span className="text-white/50">FDA + CLINICALTRIALS + SENATE LDA + USASPENDING</span>
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
            className="shrink-0 flex items-center justify-center gap-2 rounded-lg px-6 py-3 font-heading text-sm font-bold uppercase tracking-wider text-[#0a0a0f] transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: ACCENT }}
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
                  spotlightColor="rgba(244, 63, 94, 0.1)"
                >
                  <div className="flex items-center gap-4 p-5">
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/10 shrink-0">
                      <Building2 size={24} className="text-white/40" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h2 className="font-body text-lg font-semibold text-white truncate">
                          {co.display_name}
                        </h2>
                        {co.ticker && (
                          <span className="rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold shrink-0" style={{ backgroundColor: `${ACCENT}15`, color: ACCENT }}>
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
                              winner === 'a' ? '' : 'text-white'
                            }`} style={winner === 'a' ? { color: ACCENT } : {}}>
                              {metric.format(valA)}
                            </span>
                            <span className={`text-center font-mono text-sm font-semibold ${
                              winner === 'b' ? '' : 'text-white'
                            }`} style={winner === 'b' ? { color: ACCENT } : {}}>
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
                Safety data via FDA. Clinical trials via ClinicalTrials.gov. Lobbying via Senate LDA. Contracts via USASpending.
              </p>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/40">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ACCENT }} /> Winner
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
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
          </div>
        )}
      </div>
    </div>
  );
}
