import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  GitCompare, Plus, Building2, ArrowLeft, Search, X,
} from 'lucide-react';
import { HealthSectorHeader } from '../components/SectorHeader';
import LightRays from '../components/LightRays';
import {
  getHealthCompanies,
  getHealthCompanyDetail,
  type CompanyListItem,
  type CompanyDetail,
} from '../api/health';
import { fmtDollar, fmtNum } from '../utils/format';
import { LOCAL_LOGOS } from '../data/healthLogos';

function companyLogoUrl(c: { company_id: string; logo_url?: string | null; display_name: string }): string {
  if (LOCAL_LOGOS.has(c.company_id)) return `/logos/${c.company_id}.png`;
  if (c.logo_url) return c.logo_url;
  return '';
}

// -- Helpers --

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return `${(n * 100).toFixed(2)}%`;
}

// -- Metric definitions --

interface MetricDef {
  label: string;
  category: string;
  getValue: (c: CompanyDetail) => string;
  color?: string;
}

const METRICS: MetricDef[] = [
  // Safety & Compliance
  { category: 'SAFETY & COMPLIANCE', label: 'Adverse Events', getValue: (c) => fmtNum(c.adverse_event_count), color: '#DC2626' },
  { category: 'SAFETY & COMPLIANCE', label: 'Serious Events', getValue: (c) => fmtNum(c.serious_event_count), color: '#DC2626' },
  { category: 'SAFETY & COMPLIANCE', label: 'Serious %', getValue: (c) => c.adverse_event_count > 0 ? `${((c.serious_event_count / c.adverse_event_count) * 100).toFixed(1)}%` : '\u2014', color: '#DC2626' },
  { category: 'SAFETY & COMPLIANCE', label: 'Active Recalls', getValue: (c) => fmtNum(c.recall_count) },
  { category: 'SAFETY & COMPLIANCE', label: 'SEC Filings', getValue: (c) => fmtNum(c.filing_count) },
  // Clinical Pipeline
  { category: 'CLINICAL PIPELINE', label: 'Total Trials', getValue: (c) => fmtNum(c.trial_count) },
  { category: 'CLINICAL PIPELINE', label: 'Recruiting', getValue: (c) => fmtNum(c.trials_by_status?.['Recruiting'] ?? 0) },
  { category: 'CLINICAL PIPELINE', label: 'Completed', getValue: (c) => fmtNum(c.trials_by_status?.['Completed'] ?? 0) },
  // Physician Payments
  { category: 'PHYSICIAN PAYMENTS', label: 'Total Payments', getValue: (c) => fmtNum(c.payment_count), color: '#3B82F6' },
  // Market Data
  { category: 'MARKET DATA', label: 'Market Cap', getValue: (c) => fmtDollar(c.latest_stock?.market_cap) },
  { category: 'MARKET DATA', label: 'P/E Ratio', getValue: (c) => c.latest_stock?.pe_ratio != null ? c.latest_stock.pe_ratio.toFixed(2) : '\u2014' },
  { category: 'MARKET DATA', label: 'EPS', getValue: (c) => c.latest_stock?.eps != null ? `$${c.latest_stock.eps.toFixed(2)}` : '\u2014' },
  { category: 'MARKET DATA', label: 'Profit Margin', getValue: (c) => fmtPct(c.latest_stock?.profit_margin), color: '#10B981' },
  { category: 'MARKET DATA', label: '52-Week High', getValue: (c) => c.latest_stock?.week_52_high != null ? `$${c.latest_stock.week_52_high.toFixed(2)}` : '\u2014' },
  { category: 'MARKET DATA', label: '52-Week Low', getValue: (c) => c.latest_stock?.week_52_low != null ? `$${c.latest_stock.week_52_low.toFixed(2)}` : '\u2014' },
];

// -- Company Selector Dropdown --

function CompanyPicker({
  companies,
  selectedIds,
  onAdd,
}: {
  companies: CompanyListItem[];
  selectedIds: Set<string>;
  onAdd: (id: string) => void;
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

  const filtered = companies.filter(
    (c) =>
      !selectedIds.has(c.company_id) &&
      (search.trim() === '' ||
        c.display_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.ticker && c.ticker.toLowerCase().includes(search.toLowerCase())))
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold text-white cursor-pointer border-0"
        style={{ background: '#DC2626', fontFamily: "'JetBrains Mono', monospace" }}
      >
        <Plus size={16} /> Add Entity
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border shadow-lg overflow-hidden"
          style={{ background: '#1a1a2e', borderColor: 'rgba(255,255,255,0.1)' }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <input
                autoFocus
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border-0 py-2 pl-8 pr-3 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', fontFamily: "'JetBrains Mono', monospace", color: '#E2E8F0' }}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No companies available</p>
            ) : (
              filtered.slice(0, 20).map((c) => (
                <button
                  key={c.company_id}
                  onClick={() => { onAdd(c.company_id); setOpen(false); setSearch(''); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer border-0 bg-transparent hover:bg-white/[0.05]"
                >
                  <div className="w-8 h-8 rounded border flex items-center justify-center shrink-0" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                    {companyLogoUrl(c) ? (
                      <img src={companyLogoUrl(c)} alt="" className="w-full h-full object-contain p-1" />
                    ) : (
                      <Building2 size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0' }}>
                      {c.display_name}
                    </p>
                    {c.ticker && (
                      <p className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                        {c.ticker}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// -- Page --

export default function HealthComparePage() {
  const [allCompanies, setAllCompanies] = useState<CompanyListItem[]>([]);
  const [selectedDetails, setSelectedDetails] = useState<CompanyDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  useEffect(() => {
    getHealthCompanies({ limit: 100 })
      .then((res) => setAllCompanies(res.companies || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const selectedIds = new Set(selectedDetails.map((c) => c.company_id));

  const handleAdd = async (id: string) => {
    if (selectedIds.has(id) || selectedDetails.length >= 5) return;
    try {
      const detail = await getHealthCompanyDetail(id);
      setSelectedDetails((prev) => [...prev, detail]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemove = (id: string) => {
    setSelectedDetails((prev) => prev.filter((c) => c.company_id !== id));
  };

  // Group metrics by category
  const categories = METRICS.reduce<Record<string, MetricDef[]>>((acc, m) => {
    (acc[m.category] = acc[m.category] || []).push(m);
    return acc;
  }, {});

  const cellPy = density === 'compact' ? 'py-2' : 'py-4';
  const cellText = density === 'compact' ? 'text-sm' : 'text-base';

  return (
    <div className="min-h-screen w-full relative">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <LightRays
          raysOrigin="top-center"
          raysColor="#ff0000"
          raysSpeed={1}
          lightSpread={2}
          rayLength={3}
          pulsating
          fadeDistance={2}
          saturation={1}
          followMouse
          mouseInfluence={0.1}
          noiseAmount={0.3}
          distortion={0}
        />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[1600px] flex flex-col px-8 py-8">
        <HealthSectorHeader />

        {/* Header */}
        <div
          className="flex items-end justify-between pb-4 mb-6 shrink-0"
          style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitCompare size={20} style={{ color: '#DC2626' }} />
              <span
                className="text-sm font-bold uppercase"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: '#DC2626', letterSpacing: '0.1em' }}
              >
                CROSS-EXAMINATION
              </span>
            </div>
            <h1 className="text-4xl font-black" style={{ fontFamily: "'Syne', sans-serif", color: 'white' }}>
              Entity Comparison
            </h1>
          </div>
          <CompanyPicker companies={allCompanies} selectedIds={selectedIds} onAdd={handleAdd} />
        </div>

        {/* Table */}
        <div
          className="rounded-xl border shadow-sm"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
        >
          {selectedDetails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20">
              <GitCompare size={48} style={{ color: 'rgba(255,255,255,0.1)' }} className="mb-4" />
              <p className="text-lg font-semibold mb-2" style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0' }}>
                No entities selected
              </p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Click "Add Entity" to begin comparing healthcare companies.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse" style={{ minWidth: '800px' }}>
              <thead className="sticky top-0 z-10" style={{ background: 'rgba(255,255,255,0.05)', boxShadow: '0 1px 0 rgba(255,255,255,0.1)' }}>
                <tr>
                  {/* Metric label column */}
                  <th
                    className="w-64 p-4 border-r font-medium"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '12px',
                      color: 'rgba(255,255,255,0.4)',
                      borderColor: 'rgba(255,255,255,0.1)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    METRIC
                  </th>

                  {/* Company columns */}
                  {selectedDetails.map((c, idx) => (
                    <th
                      key={c.company_id}
                      className="p-4 min-w-[250px]"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderRight: idx < selectedDetails.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded border flex items-center justify-center shrink-0" style={{ borderColor: 'rgba(255,255,255,0.1)', padding: '4px' }}>
                          {companyLogoUrl(c) ? (
                            <img src={companyLogoUrl(c)} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <Building2 size={20} style={{ color: 'rgba(255,255,255,0.3)' }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-lg font-bold leading-tight truncate" style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0' }}>
                            {c.display_name}
                          </p>
                          {c.ticker && (
                            <p className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                              {c.ticker}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemove(c.company_id)}
                          className="text-white/20 hover:text-[#DC2626] transition-colors cursor-pointer bg-transparent border-0 p-1"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(categories).map(([category, metrics], catIdx) => (
                  <React.Fragment key={category}>
                    {/* Category header row */}
                    <tr style={{ background: 'rgba(255,255,255,0.05)', borderTop: catIdx > 0 ? '2px solid rgba(255,255,255,0.1)' : 'none' }}>
                      <td
                        colSpan={1 + selectedDetails.length}
                        className="px-4 py-2"
                      >
                        <span
                          className="text-xs font-bold uppercase"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            color: 'rgba(255,255,255,0.5)',
                            letterSpacing: '0.1em',
                          }}
                        >
                          {category}
                        </span>
                      </td>
                    </tr>

                    {/* Data rows */}
                    {metrics.map((metric) => (
                      <tr
                        key={metric.label}
                        className="transition-colors hover:bg-white/[0.05]"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                      >
                        <td
                          className={`px-4 ${cellPy} border-r font-medium`}
                          style={{
                            color: 'rgba(255,255,255,0.5)',
                            borderColor: 'rgba(255,255,255,0.1)',
                            fontSize: density === 'compact' ? '14px' : '16px',
                          }}
                        >
                          {metric.label}
                        </td>
                        {selectedDetails.map((c, idx) => (
                          <td
                            key={c.company_id}
                            className={`px-4 ${cellPy} ${cellText}`}
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              color: metric.color || '#E2E8F0',
                              fontWeight: metric.color ? 700 : 400,
                              borderRight: idx < selectedDetails.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                            }}
                          >
                            {metric.getValue(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
