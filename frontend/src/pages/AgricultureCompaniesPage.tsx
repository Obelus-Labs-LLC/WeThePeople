import React, { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, MapPin, SearchX } from 'lucide-react';
import { useInView } from 'framer-motion';
import SpotlightCard from '../components/SpotlightCard';
import CompanyLogo from '../components/CompanyLogo';
import { AgricultureSectorHeader } from '../components/SectorHeader';
import {
  getAgricultureCompanies,
  type AgricultureCompanyListItem,
} from '../api/agriculture';

// ── Sector helpers ──

const SECTOR_COLORS: Record<string, string> = {
  diversified: '#0D9488',
  specialty: '#7C3AED',
  agroagriculture: '#10B981',
  petroagriculture: '#F59E0B',
  industrial_gas: '#3B82F6',
};

const SECTOR_LABELS: Record<string, string> = {
  diversified: 'DIVERSIFIED',
  specialty: 'SPECIALTY',
  agroagriculture: 'AGROCHEMICAL',
  petroagriculture: 'PETROCHEMICAL',
  industrial_gas: 'INDUSTRIAL GAS',
};

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector.toLowerCase()] || '#52525B';
}

function getSectorLabel(sector: string): string {
  return SECTOR_LABELS[sector.toLowerCase()] || sector.toUpperCase();
}

// ── Filter Pill ──

function FilterPill({
  label,
  count,
  active,
  color,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 font-body text-sm font-medium transition-all duration-200"
      style={{
        borderColor: active ? color : 'rgba(255,255,255,0.1)',
        backgroundColor: active ? `${color}15` : 'transparent',
        color: active ? color : 'rgba(255,255,255,0.5)',
      }}
    >
      {label}
      <span
        className="rounded-full px-1.5 py-0.5 font-mono text-[10px]"
        style={{
          backgroundColor: active ? `${color}33` : 'rgba(255,255,255,0.1)',
          color: active ? color : 'rgba(255,255,255,0.4)',
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ── Company Card ──

function DirectoryCompanyCard({ company, index }: { company: AgricultureCompanyListItem; index: number }) {
  const color = getSectorColor(company.sector_type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.03 }}
    >
      <Link
        to={`/agriculture/${company.company_id}`}
        className="block no-underline h-full"
      >
        <SpotlightCard
          className="rounded-xl border border-white/10 bg-white/[0.03] h-full"
          spotlightColor="rgba(13, 148, 136, 0.10)"
        >
          <div className="relative flex h-full flex-col p-6 overflow-hidden">
            {/* Top row: logo + sector tag */}
            <div className="flex items-start justify-between mb-4">
              <CompanyLogo
                id={company.company_id}
                name={company.display_name}
                logoUrl={company.logo_url}
                size={48}
                iconFallback
              />
              <span
                className="rounded border px-2 py-1 font-mono text-xs"
                style={{
                  borderColor: `${color}50`,
                  color: color,
                  backgroundColor: `${color}15`,
                }}
              >
                {getSectorLabel(company.sector_type)}
              </span>
            </div>

            {/* Name + ticker */}
            <h3 className="font-body text-xl font-bold text-white line-clamp-1 mb-1">
              {company.display_name}
            </h3>
            {company.ticker && (
              <p className="font-mono text-sm text-white/40 mb-2">{company.ticker}</p>
            )}

            {/* HQ */}
            {company.headquarters && (
              <div className="flex items-center gap-1.5 mb-4">
                <MapPin size={14} className="text-white/30 flex-shrink-0" />
                <span className="font-body text-sm text-white/50 truncate">
                  {company.headquarters}
                </span>
              </div>
            )}

            {/* Spacer */}
            <div className="mt-auto" />

            {/* Stats footer */}
            <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
              <div>
                <p className="font-mono text-xs text-white/40 mb-1">CONTRACTS</p>
                <p className="font-mono text-lg text-white">
                  {company.contract_count.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs text-white/40 mb-1">FILINGS</p>
                <p className="font-mono text-lg text-white">
                  {company.filing_count.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs text-white/40 mb-1">ENFORCEMENT</p>
                <p className="font-mono text-lg text-white">
                  {company.enforcement_count.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </SpotlightCard>
      </Link>
    </motion.div>
  );
}

// ── Page ──

export default function AgricultureCompaniesPage() {
  const [searchParams] = useSearchParams();
  const initialSector = searchParams.get('sector')?.toLowerCase() || null;
  const [companies, setCompanies] = useState<AgricultureCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSector, setActiveSector] = useState<string | null>(initialSector);
  const headerRef = React.useRef<HTMLDivElement>(null);
  useInView(headerRef, { once: true, amount: 0.1 });

  useEffect(() => {
    getAgricultureCompanies({ limit: 200 })
      .then((res) => {
        if (!Array.isArray(res.companies)) {
          throw new Error('Agriculture sector data is not yet available.');
        }
        setCompanies(res.companies);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const co of companies) {
      const key = co.sector_type.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [companies]);

  const sectors = useMemo(
    () =>
      Object.entries(sectorCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([key, count]) => ({ key, count })),
    [sectorCounts],
  );

  const filtered = useMemo(() => {
    let list = companies;
    if (activeSector) {
      list = list.filter((c) => c.sector_type.toLowerCase() === activeSector);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.display_name.toLowerCase().includes(q) ||
          (c.ticker && c.ticker.toLowerCase().includes(q)) ||
          c.company_id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [companies, activeSector, search]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <motion.div
        ref={headerRef}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-30 shrink-0 px-8 pt-6 pb-4 md:px-12"
      >
        <div className="mb-2">
          <AgricultureSectorHeader />
        </div>
        <div className="flex items-end gap-4">
          <h1 className="font-heading text-4xl font-bold tracking-tight uppercase text-white xl:text-6xl">
            Company Explorer
          </h1>
          <span className="font-mono text-sm text-white/40 mb-1">
            {filtered.length} of {companies.length}
          </span>
        </div>

        {/* Search + Filters */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-4"
        >
          <div className="relative max-w-[480px] w-full mb-4">
            <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Search by name or ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[#0A0A0A] bg-[#111111] py-3 pl-12 pr-4 font-body text-lg text-white placeholder:text-white/30 outline-none transition-colors focus:border-lime-500/50"
            />
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2" style={{ touchAction: 'pan-x' }}>
            <FilterPill
              label="ALL"
              count={companies.length}
              active={activeSector === null}
              color="#FFFFFF"
              onClick={() => setActiveSector(null)}
            />
            {sectors.map(({ key, count }) => (
              <FilterPill
                key={key}
                label={getSectorLabel(key)}
                count={count}
                active={activeSector === key}
                color={getSectorColor(key)}
                onClick={() => setActiveSector(activeSector === key ? null : key)}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Content area */}
      <div className="flex-1 min-h-0 relative">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-2 border-white/20 border-t-lime-500 rounded-full animate-spin" />
              <span className="font-body text-sm text-white/40">Loading companies...</span>
            </div>
          </div>
        ) : (
          <div className="px-8 md:px-12 pr-4 custom-scrollbar">
            {filtered.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-4">
                <SearchX size={48} className="text-white/20" />
                <p className="font-body text-xl text-white/40">
                  No companies match your filters
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 pb-8">
                {filtered.map((co, idx) => (
                  <DirectoryCompanyCard key={co.company_id} company={co} index={idx} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
