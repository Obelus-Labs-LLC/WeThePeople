import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Landmark, TrendingUp, Building2, Calendar, ExternalLink, Search, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import CSVExport from '../components/CSVExport';
import {
  PoliticsSectorHeader,
  FinanceSectorHeader,
  HealthSectorHeader,
  TechSectorHeader,
  EnergySectorHeader,
  TransportationSectorHeader,
  DefenseSectorHeader,
  ChemicalsSectorHeader,
  AgricultureSectorHeader,
  TelecomSectorHeader,
  EducationSectorHeader,
} from '../components/SectorHeader';
import { getApiBaseUrl } from '../api/client';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';
import SpendingChart from '../components/SpendingChart';

const API_BASE = getApiBaseUrl();

// ── Sector config ──

interface SectorConfig {
  key: string;
  label: string;
  accent: string;
  accentRGB: string;
  Header: React.FC;
  aggregateEndpoint: string;
  entityKey: string;
  profilePath: (id: string) => string;
}

const SECTOR_MAP: Record<string, SectorConfig> = {
  finance: {
    key: 'finance', label: 'Finance', accent: '#10B981', accentRGB: '16,185,129',
    Header: FinanceSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/finance/contracts?limit=1000`,
    entityKey: 'institutions',
    profilePath: (id) => `/finance/${id}`,
  },
  health: {
    key: 'health', label: 'Health', accent: '#F43F5E', accentRGB: '244,63,94',
    Header: HealthSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/health/contracts?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/health/${id}`,
  },
  technology: {
    key: 'technology', label: 'Technology', accent: '#8B5CF6', accentRGB: '139,92,246',
    Header: TechSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/tech/contracts?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/technology/${id}`,
  },
  energy: {
    key: 'energy', label: 'Energy', accent: '#F97316', accentRGB: '249,115,22',
    Header: EnergySectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/energy/contracts?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/energy/${id}`,
  },
  politics: {
    key: 'politics', label: 'Politics', accent: '#3B82F6', accentRGB: '59,130,246',
    Header: PoliticsSectorHeader,
    aggregateEndpoint: '',
    entityKey: 'companies',
    profilePath: () => '/politics',
  },
  transportation: {
    key: 'transportation', label: 'Transportation', accent: '#06B6D4', accentRGB: '6,182,212',
    Header: TransportationSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/transportation/contracts?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/transportation/${id}`,
  },
  defense: {
    key: 'defense', label: 'Defense', accent: '#DC2626', accentRGB: '220,38,38',
    Header: DefenseSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/defense/contracts?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/defense/${id}`,
  },
  chemicals: {
    key: 'chemicals', label: 'Chemicals', accent: '#A855F7', accentRGB: '168,85,247',
    Header: ChemicalsSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/chemicals/contracts?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/chemicals/${id}`,
  },
  agriculture: {
    key: 'agriculture', label: 'Agriculture', accent: '#16A34A', accentRGB: '22,163,74',
    Header: AgricultureSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/agriculture/contracts?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/agriculture/${id}`,
  },
  telecom: {
    key: 'telecom', label: 'Telecommunications', accent: '#06B6D4', accentRGB: '6,182,212',
    Header: TelecomSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/telecom/contracts?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/telecom/${id}`,
  },
  education: {
    key: 'education', label: 'Education', accent: '#A855F7', accentRGB: '168,85,247',
    Header: EducationSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/education/contracts?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/education/${id}`,
  },
};

// ── Types ──

interface ContractItem {
  id: number;
  award_id: string | null;
  award_amount: number | null;
  awarding_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
  entity_id: string;
  entity_name: string;
  ai_summary?: string;
}

interface YearBucket {
  year: string;
  totalAmount: number;
  count: number;
}

interface CompanyContractStats {
  entity_id: string;
  entity_name: string;
  totalAmount: number;
  contractCount: number;
}

type SortOption = 'amount_desc' | 'date_desc' | 'agency_asc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'amount_desc', label: 'Highest Value' },
  { value: 'date_desc', label: 'Most Recent' },
  { value: 'agency_asc', label: 'Agency (A-Z)' },
];

const CONTRACTS_PER_PAGE = 10;

// ── Deterministic agency color palette ──

const AGENCY_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981',
  '#EF4444', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
  '#D946EF', '#84CC16', '#FB923C', '#A78BFA', '#F472B6',
];

function agencyColor(agency: string): string {
  let hash = 0;
  for (let i = 0; i < agency.length; i++) {
    hash = ((hash << 5) - hash + agency.charCodeAt(i)) | 0;
  }
  return AGENCY_COLORS[Math.abs(hash) % AGENCY_COLORS.length];
}

// ── Animation variants ──

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 120, damping: 22 },
  },
};

const BAR_COLORS = [
  '#EF4444', '#F59E0B', '#CDDC39', '#22D3EE', '#3B82F6',
  '#8B5CF6', '#EC4899', '#10B981', '#F97316', '#6366F1',
];

// ── Helpers ──

function detectSector(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] || '';
  if (seg in SECTOR_MAP) return seg;
  return 'technology';
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

function sortContracts(contracts: ContractItem[], sortBy: SortOption): ContractItem[] {
  const sorted = [...contracts];
  switch (sortBy) {
    case 'amount_desc':
      sorted.sort((a, b) => (b.award_amount || 0) - (a.award_amount || 0));
      break;
    case 'date_desc':
      sorted.sort((a, b) => {
        const da = a.start_date ? new Date(a.start_date).getTime() : 0;
        const db = b.start_date ? new Date(b.start_date).getTime() : 0;
        return db - da;
      });
      break;
    case 'agency_asc':
      sorted.sort((a, b) => (a.awarding_agency || '').localeCompare(b.awarding_agency || ''));
      break;
  }
  return sorted;
}

// ── Expanded company contracts panel ──

interface CompanyContractsPanelProps {
  contracts: ContractItem[];
  accent: string;
  accentRGB: string;
}

function CompanyContractsPanel({ contracts, accent, accentRGB }: CompanyContractsPanelProps) {
  const [sortBy, setSortBy] = useState<SortOption>('amount_desc');
  const [filterText, setFilterText] = useState('');
  const [visibleCount, setVisibleCount] = useState(CONTRACTS_PER_PAGE);

  // Summary stats
  const totalValue = contracts.reduce((s, c) => s + (c.award_amount || 0), 0);
  const agencyCounts = new Map<string, number>();
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const c of contracts) {
    if (c.awarding_agency) {
      agencyCounts.set(c.awarding_agency, (agencyCounts.get(c.awarding_agency) || 0) + 1);
    }
    if (c.start_date) {
      if (!minDate || c.start_date < minDate) minDate = c.start_date;
      if (!maxDate || c.start_date > maxDate) maxDate = c.start_date;
    }
  }

  let topAgency = '';
  let topAgencyCount = 0;
  for (const [agency, count] of agencyCounts) {
    if (count > topAgencyCount) {
      topAgency = agency;
      topAgencyCount = count;
    }
  }

  // Filter and sort
  const filtered = useMemo(() => {
    let list = contracts;
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter(
        (c) =>
          (c.awarding_agency || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q) ||
          (c.contract_type || '').toLowerCase().includes(q)
      );
    }
    return sortContracts(list, sortBy);
  }, [contracts, filterText, sortBy]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="mt-4 ml-9 space-y-4" onClick={(e) => e.stopPropagation()}>
      {/* Summary stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Total Value</p>
          <p className="font-mono text-sm font-bold text-emerald-400">{fmtDollar(totalValue)}</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Contracts</p>
          <p className="font-mono text-sm font-bold text-zinc-200">{fmtNum(contracts.length)}</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Top Agency</p>
          <p className="font-mono text-xs font-medium text-zinc-300 truncate" title={topAgency}>
            {topAgency || '\u2014'}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Date Range</p>
          <p className="font-mono text-xs font-medium text-zinc-300">
            {minDate && maxDate ? `${fmtDate(minDate)} \u2013 ${fmtDate(maxDate)}` : '\u2014'}
          </p>
        </div>
      </div>

      {/* Controls row: search + sort */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Filter by agency, description, or type..."
            value={filterText}
            onChange={(e) => { setFilterText(e.target.value); setVisibleCount(CONTRACTS_PER_PAGE); }}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder-white/25 outline-none focus:border-white/20 focus:bg-white/[0.06] transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-white/30 flex-shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as SortOption); setVisibleCount(CONTRACTS_PER_PAGE); }}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 px-3 text-sm text-zinc-200 outline-none focus:border-white/20 cursor-pointer appearance-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filtered count indicator */}
      {filterText.trim() && (
        <p className="font-mono text-xs text-white/30">
          Showing {filtered.length} of {contracts.length} contracts
        </p>
      )}

      {/* Contract cards */}
      <div className="space-y-2">
        {visible.map((ct) => (
          <div
            key={ct.id}
            className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 hover:bg-white/[0.05] transition-colors"
          >
            {/* Top row: description + amount */}
            <div className="flex items-start justify-between gap-4 mb-2">
              <p className="font-body text-sm text-white/80 leading-relaxed flex-1">
                {ct.description || 'No description available'}
              </p>
              {ct.award_amount != null && (
                <span className="font-mono text-sm font-bold text-emerald-400 flex-shrink-0 whitespace-nowrap">
                  {fmtDollar(ct.award_amount)}
                </span>
              )}
            </div>

            {/* AI summary if present */}
            {ct.ai_summary && (
              <p className="text-zinc-400 text-xs mb-2 leading-relaxed">{ct.ai_summary}</p>
            )}

            {/* Tags row: agency badge, date, type, source link */}
            <div className="flex items-center gap-2 flex-wrap">
              {ct.awarding_agency && (
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border"
                  style={{
                    color: agencyColor(ct.awarding_agency),
                    borderColor: `${agencyColor(ct.awarding_agency)}33`,
                    backgroundColor: `${agencyColor(ct.awarding_agency)}12`,
                  }}
                >
                  {ct.awarding_agency}
                </span>
              )}
              {ct.start_date && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-white/40">
                  <Calendar size={11} />
                  {fmtDate(ct.start_date)}{ct.end_date ? ` \u2013 ${fmtDate(ct.end_date)}` : ''}
                </span>
              )}
              {ct.contract_type && (
                <span className="rounded-full bg-white/[0.08] px-2.5 py-0.5 font-mono text-[10px] text-white/45">
                  {ct.contract_type}
                </span>
              )}
              {ct.award_id && (
                <a
                  href={`https://www.usaspending.gov/award/${ct.award_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[11px] no-underline hover:opacity-80 transition-opacity"
                  style={{ color: accent }}
                >
                  <ExternalLink size={11} />USASpending
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Show more / Show fewer */}
      {filtered.length > CONTRACTS_PER_PAGE && (
        <div className="flex justify-center pt-1">
          {hasMore ? (
            <button
              onClick={() => setVisibleCount((v) => v + CONTRACTS_PER_PAGE)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-5 py-2 text-sm text-zinc-300 hover:bg-white/[0.08] hover:border-white/[0.15] transition-colors cursor-pointer"
            >
              <ChevronDown size={14} />
              Show more ({filtered.length - visibleCount} remaining)
            </button>
          ) : (
            <button
              onClick={() => setVisibleCount(CONTRACTS_PER_PAGE)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-5 py-2 text-sm text-zinc-300 hover:bg-white/[0.08] hover:border-white/[0.15] transition-colors cursor-pointer"
            >
              <ChevronUp size={14} />
              Show fewer
            </button>
          )}
        </div>
      )}

      {/* No results after filter */}
      {filtered.length === 0 && filterText.trim() && (
        <p className="text-center font-body text-sm text-white/30 py-4">
          No contracts match "{filterText}"
        </p>
      )}
    </div>
  );
}

// ── Page ──

export default function SectorContractsPage() {
  const location = useLocation();
  const sectorKey = detectSector(location.pathname);
  const config = SECTOR_MAP[sectorKey];

  const [allContracts, setAllContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!config.aggregateEndpoint) {
        setError('No contract data available for this sector.');
        setLoading(false);
        return;
      }

      try {
        const data = await fetchJSON<any>(config.aggregateEndpoint);
        if (cancelled) return;

        const contracts: ContractItem[] = (data.contracts || []);
        // Sort by award_amount descending (already sorted by backend, but ensure)
        contracts.sort((a, b) => (b.award_amount || 0) - (a.award_amount || 0));
        setAllContracts(contracts);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load contracts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    setError(null);
    setAllContracts([]);
    setExpandedId(null);
    loadData();
    return () => { cancelled = true; };
  }, [sectorKey]);

  // Build year-based timeline
  const yearBuckets = useMemo(() => {
    const buckets = new Map<string, YearBucket>();

    for (const c of allContracts) {
      const year = c.start_date ? new Date(c.start_date).getFullYear().toString() : 'Unknown';
      if (year === 'Unknown' || year === 'NaN') continue;

      const existing = buckets.get(year);
      if (existing) {
        existing.totalAmount += c.award_amount || 0;
        existing.count += 1;
      } else {
        buckets.set(year, { year, totalAmount: c.award_amount || 0, count: 1 });
      }
    }

    return Array.from(buckets.values()).sort((a, b) => a.year.localeCompare(b.year));
  }, [allContracts]);

  // Top contractors table
  const topContractors = useMemo(() => {
    const statsMap = new Map<string, CompanyContractStats>();

    for (const c of allContracts) {
      const existing = statsMap.get(c.entity_id);
      if (existing) {
        existing.totalAmount += c.award_amount || 0;
        existing.contractCount += 1;
      } else {
        statsMap.set(c.entity_id, {
          entity_id: c.entity_id,
          entity_name: c.entity_name,
          totalAmount: c.award_amount || 0,
          contractCount: 1,
        });
      }
    }

    return Array.from(statsMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 15);
  }, [allContracts]);

  // Stats
  const totalValue = allContracts.reduce((sum, c) => sum + (c.award_amount || 0), 0);
  const totalContracts = allContracts.length;
  const uniqueCompanies = new Set(allContracts.map((c) => c.entity_id)).size;
  const maxBarAmount = yearBuckets.length > 0 ? Math.max(...yearBuckets.map((b) => b.totalAmount)) : 0;
  const maxContractorAmount = topContractors.length > 0 ? topContractors[0].totalAmount : 0;

  const SectorHeaderComp = config.Header;

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-400 mb-2">Failed to load contracts</p>
          <p className="text-sm text-white/50">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded px-4 py-2 text-sm text-white hover:opacity-80"
            style={{ backgroundColor: config.accent }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Background decor */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute w-full h-full"
          style={{ background: `radial-gradient(ellipse at 50% -20%, ${config.accent} 0%, transparent 60%)`, opacity: 0.08 }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(#F8FAFC 1px, transparent 1px), linear-gradient(90deg, #F8FAFC 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            opacity: 0.025,
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-8 py-8 md:px-12">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-8"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="flex flex-col gap-3">
            <SectorHeaderComp />

            <div className="flex items-center gap-3 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ backgroundColor: config.accent }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: config.accent, boxShadow: `0 0 8px rgba(${config.accentRGB},0.5)` }} />
              </span>
              <span className="font-heading text-sm font-bold tracking-[0.2em] uppercase" style={{ color: config.accent }}>
                Government Contracts
              </span>
            </div>

            <h1 className="font-heading text-4xl font-bold tracking-tight text-zinc-50 leading-tight xl:text-5xl">
              {config.label} Contract Timeline
            </h1>
            <div className="flex items-center gap-4">
              <p className="font-body text-base text-zinc-400 leading-relaxed max-w-2xl">
                Government contract awards over time across all tracked {config.label.toLowerCase()} {config.entityKey === 'institutions' ? 'institutions' : 'companies'}.
              </p>
              <CSVExport
                data={allContracts}
                filename={`${config.key}-contracts`}
                columns={[
                  { key: 'entity_name', label: 'Company' },
                  { key: 'award_amount', label: 'Award Amount' },
                  { key: 'awarding_agency', label: 'Agency' },
                  { key: 'description', label: 'Description' },
                  { key: 'start_date', label: 'Start Date' },
                  { key: 'end_date', label: 'End Date' },
                  { key: 'contract_type', label: 'Type' },
                ]}
              />
            </div>
          </motion.div>

          {/* Stat cards */}
          {loading ? (
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : (
            <motion.div variants={containerVariants} className="grid grid-cols-3 gap-4">
              <motion.div
                variants={itemVariants}
                className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">Total Value</span>
                  <TrendingUp size={18} className="text-zinc-500" />
                </div>
                <span className="font-mono text-3xl font-semibold text-zinc-100">{fmtDollar(totalValue)}</span>
              </motion.div>
              <motion.div
                variants={itemVariants}
                className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">Total Contracts</span>
                  <Landmark size={18} className="text-zinc-500" />
                </div>
                <span className="font-mono text-3xl font-semibold text-zinc-100">{fmtNum(totalContracts)}</span>
              </motion.div>
              <motion.div
                variants={itemVariants}
                className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">{config.entityKey === 'institutions' ? 'Institutions' : 'Companies'}</span>
                  <Building2 size={18} className="text-zinc-500" />
                </div>
                <span className="font-mono text-3xl font-semibold text-zinc-100">{uniqueCompanies}</span>
              </motion.div>
            </motion.div>
          )}

          {/* Year-based timeline chart */}
          {!loading && yearBuckets.length > 0 && (
            <motion.div variants={itemVariants}>
              <h2 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-50 mb-2">
                Spending Over Time
              </h2>
              <p className="font-body text-sm text-zinc-500 mb-6">
                Contract award values by fiscal year
              </p>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-6">
                <SpendingChart
                  data={yearBuckets.map((b) => ({ year: b.year, total_amount: b.totalAmount, count: b.count }))}
                  height={260}
                  countLabel="award"
                />
              </div>
            </motion.div>
          )}

          {/* Top contractors table */}
          {!loading && topContractors.length > 0 && (
            <motion.div variants={itemVariants}>
              <h2 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-50 mb-2">
                Top {config.entityKey === 'institutions' ? 'Recipients' : 'Contractors'}
              </h2>
              <p className="font-body text-sm text-zinc-500 mb-1">
                {config.entityKey === 'institutions' ? 'Institutions' : 'Companies'} ranked by total government contract value.
                Click any row to explore individual contracts.
              </p>

              <div className="flex flex-col gap-2 mt-4">
                {topContractors.map((comp, idx) => {
                  const pct = maxContractorAmount > 0 ? (comp.totalAmount / maxContractorAmount) * 100 : 0;
                  const color = BAR_COLORS[idx % BAR_COLORS.length];
                  const isExpanded = expandedId === comp.entity_id;
                  const companyContracts = isExpanded
                    ? allContracts.filter((c) => c.entity_id === comp.entity_id)
                    : [];

                  return (
                    <motion.div
                      key={comp.entity_id}
                      variants={itemVariants}
                      layout
                      className="group rounded-xl border border-transparent bg-white/[0.03] transition-all hover:bg-white/[0.06] hover:border-white/10"
                    >
                      {/* Clickable header row */}
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : comp.entity_id)}
                        className="p-4 cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="font-mono text-xs text-white/30 w-6 text-right flex-shrink-0">
                              {idx + 1}
                            </span>
                            <Link
                              to={config.profilePath(comp.entity_id)}
                              onClick={(e) => e.stopPropagation()}
                              className="font-body text-sm font-medium text-white no-underline truncate"
                              style={{ ['--hover-color' as any]: config.accent }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = config.accent)}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'white')}
                            >
                              {comp.entity_name}
                            </Link>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0">
                            <span className="font-mono text-xs text-white/40">{comp.contractCount} contracts</span>
                            <span className="font-mono text-sm font-bold text-emerald-400">{fmtDollar(comp.totalAmount)}</span>
                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronDown size={16} className="text-white/30" />
                            </motion.div>
                          </div>
                        </div>

                        {/* Bar */}
                        <div className="h-4 bg-zinc-900 rounded-lg overflow-hidden ml-9">
                          <motion.div
                            className="h-full rounded-lg"
                            style={{ backgroundColor: color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(pct, 1)}%` }}
                            transition={{ duration: 0.8, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </div>
                      </div>

                      {/* Expanded contract details panel */}
                      <AnimatePresence>
                        {isExpanded && companyContracts.length > 0 && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden border-t border-white/[0.06]"
                          >
                            <div className="px-4 pb-4">
                              <CompanyContractsPanel
                                contracts={companyContracts}
                                accent={config.accent}
                                accentRGB={config.accentRGB}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Loading state for charts */}
          {loading && (
            <div className="flex flex-col gap-6">
              <div className="h-72 rounded-xl bg-zinc-900 animate-pulse" />
              <div className="h-96 rounded-xl bg-zinc-900 animate-pulse" />
            </div>
          )}

          {/* Empty state */}
          {!loading && allContracts.length === 0 && (
            <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-20">
              <Landmark size={48} className="text-white/20 mb-4" />
              <p className="font-body text-xl text-white/40">No contract data available</p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
