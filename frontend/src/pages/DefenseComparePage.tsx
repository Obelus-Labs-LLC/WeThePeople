import React, { useEffect, useState, useRef } from 'react';
import {
  ChevronDown,
  GitCompareArrows,
  Building2,
  BarChart3,
  Shield,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { DefenseSectorHeader } from '../components/SectorHeader';
import SpotlightCard from '../components/SpotlightCard';
import {
  getDefenseCompanies,
  getDefenseComparison,
  type DefenseCompanyListItem,
  type DefenseComparisonItem,
} from '../api/defense';
import { fmtDollar, fmtNum } from '../utils/format';

// -- Helpers --

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return `${(n * 100).toFixed(1)}%`;
}

// -- Metric types --

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
    accent: 'text-[#DC2626]',
    metrics: [
      { label: 'Lobbying Spend', key: 'lobbying_total', format: fmtDollar },
      { label: 'Contract Value', key: 'total_contract_value', format: fmtDollar },
      { label: 'Contract Count', key: 'contract_count', format: fmtNum },
      { label: 'Enforcement Actions', key: 'enforcement_count', format: fmtNum, lowerIsBetter: true },
      { label: 'Total Penalties', key: 'total_penalties', format: fmtDollar, lowerIsBetter: true },
    ],
  },
  {
    title: 'Market Data',
    icon: TrendingUp,
    accent: 'text-[#10B981]',
    metrics: [
      { label: 'Market Cap', key: 'market_cap', format: fmtDollar },
      { label: 'P/E Ratio', key: 'pe_ratio', format: (v) => (v != null ? v.toFixed(1) : '\u2014') },
      { label: 'Profit Margin', key: 'profit_margin', format: fmtPct },
    ],
  },
];

// -- Dropdown --

function CompanyDropdown({ companies, selected, onChange, placeholder }: {
  companies: DefenseCompanyListItem[];
  selected: string | null;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = search
    ? companies.filter((c) => c.display_name.toLowerCase().includes(search.toLowerCase()) || (c.ticker && c.ticker.toLowerCase().includes(search.toLowerCase())))
    : companies;
  const selectedCompany = companies.find((c) => c.company_id === selected);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left font-body text-sm text-white transition-colors hover:border-white/20">
        <span className={selectedCompany ? 'text-white' : 'text-white/40'}>
          {selectedCompany ? `${selectedCompany.display_name}${selectedCompany.ticker ? ` (${selectedCompany.ticker})` : ''}` : placeholder}
        </span>
        <ChevronDown size={16} className="text-white/40" />
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-zinc-900 shadow-2xl max-h-64 overflow-y-auto">
          <div className="sticky top-0 bg-zinc-900 p-2 border-b border-white/5">
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none" />
          </div>
          {filtered.map((c) => (
            <button key={c.company_id} onClick={() => { onChange(c.company_id); setOpen(false); setSearch(''); }}
              className="w-full px-4 py-2.5 text-left font-body text-sm text-white/80 hover:bg-white/[0.05] transition-colors flex items-center justify-between">
              <span>{c.display_name}</span>
              {c.ticker && <span className="font-mono text-xs text-white/30">{c.ticker}</span>}
            </button>
          ))}
          {filtered.length === 0 && <p className="px-4 py-3 text-sm text-white/30">No results</p>}
        </div>
      )}
    </div>
  );
}

// -- Page --

export default function DefenseComparePage() {
  const [allCompanies, setAllCompanies] = useState<DefenseCompanyListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<(string | null)[]>([null, null]);
  const [comparison, setComparison] = useState<DefenseComparisonItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getDefenseCompanies({ limit: 200 })
      .then((res) => setAllCompanies(res.companies || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const ids = selectedIds.filter(Boolean) as string[];
    if (ids.length < 2) { setComparison([]); return; }
    setLoading(true);
    getDefenseComparison(ids)
      .then((res) => setComparison(res.companies || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedIds]);

  const updateSelection = (index: number, id: string) => {
    const next = [...selectedIds];
    next[index] = id;
    setSelectedIds(next);
  };

  const addSlot = () => {
    if (selectedIds.length < 5) setSelectedIds([...selectedIds, null]);
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        <DefenseSectorHeader />

        <div className="mt-8 mb-10">
          <div className="flex items-center gap-3 mb-2">
            <GitCompareArrows size={28} className="text-red-500" />
            <h1 className="font-heading text-3xl font-bold tracking-tight uppercase text-white">Compare Companies</h1>
          </div>
          <p className="font-body text-sm text-white/40">Select 2-5 defense companies to compare side by side</p>
        </div>

        {/* Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {selectedIds.map((id, idx) => (
            <CompanyDropdown key={idx} companies={allCompanies} selected={id} onChange={(newId) => updateSelection(idx, newId)} placeholder={`Company ${idx + 1}`} />
          ))}
          {selectedIds.length < 5 && (
            <button onClick={addSlot} className="rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-white/30 hover:text-white/50 hover:border-white/20 transition-colors">
              + Add company
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 border-2 border-white/20 border-t-red-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Results */}
        {!loading && comparison.length >= 2 && (
          <div className="space-y-10">
            {METRIC_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="flex items-center gap-3 mb-6">
                  <group.icon size={20} className={group.accent} />
                  <h2 className="font-heading text-xl font-bold uppercase text-white">{group.title}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 font-mono text-xs text-white/40 uppercase w-48">Metric</th>
                        {comparison.map((co) => (
                          <th key={co.company_id} className="text-right py-3 px-4 font-body text-sm text-white/80">{co.display_name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.metrics.map((metric) => {
                        const values = comparison.map((co) => (co as any)[metric.key] as number | null);
                        const numericValues = values.filter((v): v is number => v != null && !isNaN(v));
                        const best = numericValues.length > 0 ? (metric.lowerIsBetter ? Math.min(...numericValues) : Math.max(...numericValues)) : null;
                        return (
                          <tr key={metric.key} className="border-b border-white/5 hover:bg-white/[0.02]">
                            <td className="py-3 px-4 font-mono text-xs text-white/50">{metric.label}</td>
                            {values.map((v, i) => (
                              <td key={i} className={`text-right py-3 px-4 font-mono text-sm ${v != null && v === best ? 'text-red-400 font-bold' : 'text-white/70'}`}>
                                {metric.format(v)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && comparison.length === 0 && selectedIds.filter(Boolean).length >= 2 && (
          <p className="text-center text-white/30 py-16">No comparison data available for selected companies</p>
        )}
      </div>
    </div>
  );
}
