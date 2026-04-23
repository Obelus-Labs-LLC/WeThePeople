import React, { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Landmark,
  TrendingUp,
  Building2,
  Calendar,
  ExternalLink,
  Search,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from 'lucide-react';
import CSVExport from '../components/CSVExport';
import SpendingChart from '../components/SpendingChart';
import SectorTabLayout, {
  statCard,
  statLabel,
  statNumber,
  sectionTitle,
  sectionSubtitle,
  emptyState,
} from '../components/sector/SectorTabLayout';
import { SECTOR_MAP, detectSector } from '../components/sector/sectorConfig';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';

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

// ── Deterministic agency color palette using design tokens ──

const AGENCY_COLORS = [
  '#4A7FDE', // dem
  '#B06FD8', // ind
  '#3DB87A', // green
  '#D4AE35', // accent-text
  '#E63946', // red
  '#5EC090', // green-mid
  '#8F9EE6', // dem-soft
  '#D48B3A', // warm
  '#6B95E8', // dem-light
  '#C48FD9', // ind-light
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
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 130, damping: 22 },
  },
};

// ── Helpers ──

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
}

function CompanyContractsPanel({ contracts, accent }: CompanyContractsPanelProps) {
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

  const miniStat: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: '10px',
    background: 'var(--color-surface-2)',
    border: '1px solid rgba(235,229,213,0.06)',
  };

  return (
    <div
      style={{ padding: '16px 8px 0', display: 'flex', flexDirection: 'column', gap: '14px' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Mini stat strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '10px',
        }}
      >
        <div style={miniStat}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              marginBottom: '4px',
            }}
          >
            Total Value
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--color-green)',
            }}
          >
            {fmtDollar(totalValue)}
          </div>
        </div>
        <div style={miniStat}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              marginBottom: '4px',
            }}
          >
            Contracts
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--color-text-1)',
            }}
          >
            {fmtNum(contracts.length)}
          </div>
        </div>
        <div style={miniStat}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              marginBottom: '4px',
            }}
          >
            Top Agency
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--color-text-2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={topAgency}
          >
            {topAgency || '—'}
          </div>
        </div>
        <div style={miniStat}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              marginBottom: '4px',
            }}
          >
            Date Range
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--color-text-2)',
            }}
          >
            {minDate && maxDate ? `${fmtDate(minDate)} – ${fmtDate(maxDate)}` : '—'}
          </div>
        </div>
      </div>

      {/* Controls: search + sort */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-3)',
            }}
          />
          <input
            type="text"
            placeholder="Filter by agency, description, or type…"
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              setVisibleCount(CONTRACTS_PER_PAGE);
            }}
            style={{
              width: '100%',
              padding: '9px 12px 9px 34px',
              borderRadius: '10px',
              border: '1px solid rgba(235,229,213,0.08)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-1)',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(235,229,213,0.2)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)'; }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SlidersHorizontal size={14} color="var(--color-text-3)" />
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortOption);
              setVisibleCount(CONTRACTS_PER_PAGE);
            }}
            style={{
              padding: '9px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(235,229,213,0.08)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-1)',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filterText.trim() && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--color-text-3)',
            margin: 0,
          }}
        >
          Showing {filtered.length} of {contracts.length} contracts
        </p>
      )}

      {/* Contract cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visible.map((ct) => {
          const ac = ct.awarding_agency ? agencyColor(ct.awarding_agency) : '#6E7A85';
          return (
            <div
              key={ct.id}
              style={{
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid rgba(235,229,213,0.06)',
                background: 'var(--color-surface-2)',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(235,229,213,0.14)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(235,229,213,0.06)';
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '14px',
                  marginBottom: '8px',
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--color-text-1)',
                    lineHeight: 1.55,
                    flex: 1,
                    margin: 0,
                  }}
                >
                  {ct.description || 'No description available'}
                </p>
                {ct.award_amount != null && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: 'var(--color-green)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {fmtDollar(ct.award_amount)}
                  </span>
                )}
              </div>

              {ct.ai_summary && (
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontStyle: 'italic',
                    fontSize: '12px',
                    color: 'var(--color-text-3)',
                    margin: '0 0 10px',
                    lineHeight: 1.55,
                  }}
                >
                  {ct.ai_summary}
                </p>
              )}

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {ct.awarding_agency && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 10px',
                      borderRadius: '999px',
                      border: `1px solid ${ac}33`,
                      background: `${ac}14`,
                      color: ac,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 500,
                    }}
                  >
                    {ct.awarding_agency}
                  </span>
                )}
                {ct.start_date && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--color-text-3)',
                    }}
                  >
                    <Calendar size={11} />
                    {fmtDate(ct.start_date)}
                    {ct.end_date ? ` – ${fmtDate(ct.end_date)}` : ''}
                  </span>
                )}
                {ct.contract_type && (
                  <span
                    style={{
                      padding: '2px 10px',
                      borderRadius: '999px',
                      background: 'rgba(235,229,213,0.06)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--color-text-3)',
                    }}
                  >
                    {ct.contract_type}
                  </span>
                )}
                {ct.award_id && (
                  <a
                    href={`https://www.usaspending.gov/award/${ct.award_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: accent,
                      textDecoration: 'none',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    <ExternalLink size={11} />
                    USASpending
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more / fewer */}
      {filtered.length > CONTRACTS_PER_PAGE && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4px' }}>
          {hasMore ? (
            <button
              onClick={() => setVisibleCount((v) => v + CONTRACTS_PER_PAGE)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(235,229,213,0.1)',
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-2)',
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(235,229,213,0.06)';
                e.currentTarget.style.color = 'var(--color-text-1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-surface-2)';
                e.currentTarget.style.color = 'var(--color-text-2)';
              }}
            >
              <ChevronDown size={13} />
              Show more ({filtered.length - visibleCount} remaining)
            </button>
          ) : (
            <button
              onClick={() => setVisibleCount(CONTRACTS_PER_PAGE)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(235,229,213,0.1)',
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-2)',
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <ChevronUp size={13} />
              Show fewer
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 && filterText.trim() && (
        <p
          style={{
            textAlign: 'center',
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            color: 'var(--color-text-3)',
            padding: '12px 0',
            margin: 0,
          }}
        >
          No contracts match “{filterText}”
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
  const entityWord = config.entityKey === 'institutions' ? 'institutions' : 'companies';
  const EntityWord = config.entityKey === 'institutions' ? 'Institutions' : 'Companies';

  const [allContracts, setAllContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const endpoint = config.endpoints.contracts;

    async function loadData() {
      if (!endpoint) {
        setError('No contract data available for this sector.');
        setLoading(false);
        return;
      }

      try {
        const data = await fetchJSON<{ contracts: ContractItem[] }>(endpoint);
        if (cancelled) return;
        const contracts = [...(data.contracts || [])];
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
  }, [sectorKey, config.endpoints.contracts]);

  // Year buckets
  const yearBuckets = useMemo<YearBucket[]>(() => {
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

  // Top contractors
  const topContractors = useMemo<CompanyContractStats[]>(() => {
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
  const maxContractorAmount = topContractors.length > 0 ? topContractors[0].totalAmount : 0;

  const csvExport = (
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
  );

  return (
    <SectorTabLayout
      config={config}
      eyebrow="Government Contracts"
      title={`${config.label} contract timeline`}
      subtitle={`Government contract awards over time across all tracked ${config.label.toLowerCase()} ${entityWord}.`}
      rightSlot={csvExport}
      error={error}
      errorLabel="contracts"
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}
      >
        {/* Stat cards */}
        {loading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '12px',
            }}
          >
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ ...statCard, height: '96px' }} />
            ))}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            <motion.div variants={itemVariants} style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={statLabel}>Total Value</span>
                <TrendingUp size={16} color="var(--color-text-3)" />
              </div>
              <span style={{ ...statNumber, color: 'var(--color-green)' }}>{fmtDollar(totalValue)}</span>
            </motion.div>
            <motion.div variants={itemVariants} style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={statLabel}>Total Contracts</span>
                <Landmark size={16} color="var(--color-text-3)" />
              </div>
              <span style={statNumber}>{fmtNum(totalContracts)}</span>
            </motion.div>
            <motion.div variants={itemVariants} style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={statLabel}>{EntityWord}</span>
                <Building2 size={16} color="var(--color-text-3)" />
              </div>
              <span style={statNumber}>{uniqueCompanies}</span>
            </motion.div>
          </motion.div>
        )}

        {/* Timeline chart */}
        {!loading && yearBuckets.length > 0 && (
          <motion.div variants={itemVariants}>
            <h2 style={sectionTitle}>
              Spending over <span style={{ color: config.accent, fontStyle: 'italic' }}>time</span>
            </h2>
            <p style={sectionSubtitle}>Contract award values by fiscal year.</p>

            <div
              style={{
                padding: '20px',
                borderRadius: '16px',
                border: '1px solid rgba(235,229,213,0.08)',
                background: 'var(--color-surface)',
              }}
            >
              <SpendingChart
                data={yearBuckets.map((b) => ({ year: b.year, total_amount: b.totalAmount, count: b.count }))}
                height={260}
                countLabel="award"
              />
            </div>
          </motion.div>
        )}

        {/* Top contractors */}
        {!loading && topContractors.length > 0 && (
          <motion.div variants={itemVariants}>
            <h2 style={sectionTitle}>
              Top <span style={{ color: config.accent, fontStyle: 'italic' }}>
                {config.entityKey === 'institutions' ? 'recipients' : 'contractors'}
              </span>
            </h2>
            <p style={sectionSubtitle}>
              {EntityWord} ranked by total government contract value. Click any row to explore individual contracts.
            </p>

            <div
              style={{
                padding: '8px',
                background: 'var(--color-surface)',
                border: '1px solid rgba(235,229,213,0.08)',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {topContractors.map((comp, idx) => {
                const pct = maxContractorAmount > 0 ? (comp.totalAmount / maxContractorAmount) * 100 : 0;
                const isExpanded = expandedId === comp.entity_id;
                const companyContracts = isExpanded
                  ? allContracts.filter((c) => c.entity_id === comp.entity_id)
                  : [];

                return (
                  <motion.div
                    key={comp.entity_id}
                    variants={itemVariants}
                    layout
                    style={{
                      borderRadius: '12px',
                      background: isExpanded ? 'rgba(235,229,213,0.04)' : 'transparent',
                      transition: 'background 0.18s',
                    }}
                  >
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : comp.entity_id)}
                      style={{
                        padding: '14px 16px',
                        cursor: 'pointer',
                        borderRadius: '12px',
                      }}
                      onMouseEnter={(e) => {
                        if (!isExpanded) {
                          e.currentTarget.style.background = 'rgba(235,229,213,0.03)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '10px',
                          gap: '12px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: 'var(--color-text-3)',
                              width: '20px',
                              textAlign: 'right',
                              flexShrink: 0,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <Link
                            to={config.profilePath(comp.entity_id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '14px',
                              fontWeight: 500,
                              color: 'var(--color-text-1)',
                              textDecoration: 'none',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = config.accent; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
                          >
                            {comp.entity_name}
                          </Link>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: 'var(--color-text-3)',
                            }}
                          >
                            {comp.contractCount} contracts
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: 'var(--color-green)',
                              minWidth: '100px',
                              textAlign: 'right',
                            }}
                          >
                            {fmtDollar(comp.totalAmount)}
                          </span>
                          <motion.div
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronDown size={16} color="var(--color-text-3)" />
                          </motion.div>
                        </div>
                      </div>

                      {/* Bar */}
                      <div
                        style={{
                          height: '6px',
                          background: 'var(--color-surface-2)',
                          borderRadius: '999px',
                          overflow: 'hidden',
                          marginLeft: '32px',
                        }}
                      >
                        <motion.div
                          style={{
                            height: '100%',
                            borderRadius: '999px',
                            background: config.accent,
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(pct, 1)}%` }}
                          transition={{ duration: 0.7, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && companyContracts.length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div
                            style={{
                              margin: '0 16px 14px',
                              paddingTop: '8px',
                              borderTop: '1px solid rgba(235,229,213,0.06)',
                            }}
                          >
                            <CompanyContractsPanel
                              contracts={companyContracts}
                              accent={config.accent}
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

        {/* Loading state */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ ...statCard, height: '280px' }} />
            <div style={{ ...statCard, height: '360px' }} />
          </div>
        )}

        {/* Empty */}
        {!loading && allContracts.length === 0 && (
          <div style={emptyState}>
            <Landmark size={40} color="var(--color-text-3)" style={{ opacity: 0.4, marginBottom: '16px' }} />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '16px',
                color: 'var(--color-text-3)',
                margin: 0,
              }}
            >
              No contract data available
            </p>
          </div>
        )}
      </motion.div>
    </SectorTabLayout>
  );
}
