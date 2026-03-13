import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, SearchX, Building2, ArrowLeft } from 'lucide-react';
import {
  getTechCompanies,
  type TechCompanyListItem,
} from '../api/tech';

// ── Sector helpers ──

const SECTOR_COLORS: Record<string, string> = {
  platform: '#8B5CF6',
  enterprise: '#2563EB',
  semiconductor: '#F59E0B',
  automotive: '#10B981',
  media: '#EC4899',
};

const SECTOR_LABELS: Record<string, string> = {
  platform: 'Platform',
  enterprise: 'Enterprise',
  semiconductor: 'Semiconductor',
  automotive: 'Automotive',
  media: 'Media',
};

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector.toLowerCase()] || '#52525B';
}

function getSectorLabel(sector: string): string {
  return SECTOR_LABELS[sector.toLowerCase()] || sector;
}

// ── Company Card ──

function DirectoryCompanyCard({ company }: { company: TechCompanyListItem }) {
  const sectorColor = getSectorColor(company.sector_type);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <Link
        to={`/technology/${company.company_id}`}
        className="group flex flex-col rounded-2xl border border-zinc-800 bg-[#18181B] overflow-hidden transition-all hover:border-zinc-600 hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] cursor-pointer no-underline"
      >
        {/* Body */}
        <div className="flex-1 p-6 flex flex-col gap-4">
          {/* Header: Logo + Name */}
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-[#09090B] p-2.5 lg:h-16 lg:w-16">
              {company.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={company.display_name}
                  className="h-full w-full object-contain grayscale group-hover:grayscale-0 transition-all duration-300"
                />
              ) : (
                <Building2 size={24} className="text-zinc-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-heading text-xl font-bold text-white leading-tight truncate lg:text-2xl">
                {company.display_name}
              </h3>
              {company.ticker && (
                <span className="font-mono text-sm text-zinc-500">
                  {company.ticker}
                </span>
              )}
            </div>
          </div>

          {/* Meta: Badge + HQ */}
          <div className="flex items-center justify-between">
            <span
              className="inline-block px-3 py-1 rounded-md font-heading text-xs font-bold tracking-wider uppercase"
              style={{
                color: sectorColor,
                backgroundColor: `${sectorColor}15`,
                border: `1px solid ${sectorColor}30`,
              }}
            >
              {getSectorLabel(company.sector_type)}
            </span>
            {company.headquarters && (
              <span className="flex items-center gap-1.5 font-body text-xs text-zinc-500 truncate max-w-[50%]">
                <MapPin size={12} />
                {company.headquarters}
              </span>
            )}
          </div>
        </div>

        {/* Stats Footer */}
        <div className="grid grid-cols-3 border-t border-zinc-800 bg-[#09090B] divide-x divide-zinc-800">
          {[
            { label: 'Patents', value: company.patent_count },
            { label: 'Contracts', value: company.contract_count },
            { label: 'Filings', value: company.filing_count },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center justify-center gap-1 p-3 transition-colors hover:bg-zinc-900/50"
            >
              <span className="font-mono text-lg font-semibold text-zinc-100">
                {stat.value.toLocaleString()}
              </span>
              <span className="font-heading text-[10px] font-normal tracking-widest uppercase text-zinc-500">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </Link>
    </motion.div>
  );
}

// ── Page ──

export default function TechCompaniesPage() {
  const [companies, setCompanies] = useState<TechCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSector, setActiveSector] = useState<string | null>(null);

  useEffect(() => {
    getTechCompanies({ limit: 200 })
      .then((res) => setCompanies(res.companies || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Derive sector counts
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

  // Filter
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
    <div className="flex flex-col h-screen bg-[#09090B]">
      <div className="relative z-10 mx-auto w-full max-w-[1600px] flex flex-col h-full px-8 py-12 md:px-16 2xl:px-24">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-6">
          <Link
            to="/technology"
            className="flex items-center gap-2 font-body text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors no-underline w-fit"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="font-heading text-5xl font-bold tracking-tight uppercase text-zinc-50 2xl:text-7xl">
              Company Directory
            </h1>
            <span className="font-mono text-lg text-zinc-400">
              Showing {filtered.length} of {companies.length} companies
            </span>
          </div>
        </div>

        {/* Controls: Search + Filters */}
        <div className="flex flex-col gap-4 mb-6">
          {/* Search */}
          <div className="relative max-w-md w-full">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search companies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-[#18181B] py-3 pl-12 pr-4 font-body text-base text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-500 transition-colors"
            />
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-3">
            {/* All pill */}
            <button
              onClick={() => setActiveSector(null)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 font-body text-base font-semibold border transition-colors cursor-pointer ${
                activeSector === null
                  ? 'bg-white/20 border-white text-white'
                  : 'bg-[#18181B] border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded-full ${
                  activeSector === null ? 'bg-black/40 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {companies.length}
              </span>
            </button>

            {sectors.map(({ key, count }) => {
              const color = getSectorColor(key);
              const isActive = activeSector === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveSector(isActive ? null : key)}
                  className="flex items-center gap-2 rounded-full px-4 py-2 font-body text-base font-semibold border transition-colors cursor-pointer"
                  style={
                    isActive
                      ? {
                          backgroundColor: `${color}20`,
                          borderColor: color,
                          color: color,
                        }
                      : {
                          backgroundColor: '#18181B',
                          borderColor: '#27272A',
                          color: '#A1A1AA',
                        }
                  }
                >
                  {getSectorLabel(key)}
                  <span
                    className="font-mono text-xs px-2 py-0.5 rounded-full"
                    style={
                      isActive
                        ? { backgroundColor: 'rgba(0,0,0,0.4)', color: 'white' }
                        : { backgroundColor: '#27272A', color: '#A1A1AA' }
                    }
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable grid */}
        <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:rounded-full">
          {loading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 auto-rows-max">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-56 rounded-2xl bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-zinc-500">
              <SearchX size={48} className="opacity-50" />
              <span className="text-xl">No companies match your filters</span>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 auto-rows-max pb-4">
                {filtered.map((co) => (
                  <DirectoryCompanyCard key={co.company_id} company={co} />
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
