import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Building2, MapPin, SearchX, ArrowLeft } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import SpotlightCard from '../components/SpotlightCard';
import { FinanceSectorHeader } from '../components/SectorHeader';
import { LOCAL_LOGOS } from '../data/financeLogos';
import {
  getInstitutions,
  type InstitutionListItem,
} from '../api/finance';

// ── Sector color map ──

const SECTOR_COLORS: Record<string, string> = {
  bank: '#60A5FA',
  investment: '#C084FC',
  insurance: '#FBBF24',
  fintech: '#34D399',
  central_bank: '#F87171',
};

const SECTOR_LABELS: Record<string, string> = {
  bank: 'BANK',
  investment: 'INVESTMENT',
  insurance: 'INSURANCE',
  fintech: 'FINTECH',
  central_bank: 'CENTRAL BANK',
};

function sectorColor(type: string): string {
  return SECTOR_COLORS[type] || '#34D399';
}

function instLogoUrl(inst: { institution_id: string; logo_url?: string | null; display_name: string }): string {
  if (LOCAL_LOGOS.has(inst.institution_id)) return `/logos/${inst.institution_id}.png`;
  if (inst.logo_url) return inst.logo_url;
  return '';
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

// ── Institution Card ──

function InstitutionCard({
  inst,
  index,
}: {
  inst: InstitutionListItem;
  index: number;
}) {
  const color = sectorColor(inst.sector_type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Link
        to={`/finance/${inst.institution_id}`}
        className="block no-underline h-full"
      >
        <SpotlightCard
          className="rounded-xl border border-white/10 bg-white/[0.03] h-full"
          spotlightColor="rgba(52, 211, 153, 0.10)"
        >
          <div className="relative flex h-full flex-col p-6 overflow-hidden">
            {/* Top row: logo + sector tag */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#111111] border border-white/5">
                {instLogoUrl(inst) ? (
                  <img
                    src={instLogoUrl(inst)}
                    alt={inst.display_name}
                    className="h-8 w-8 rounded object-contain"
                  />
                ) : (
                  <Building2 size={20} className="text-white/20" />
                )}
              </div>
              <span
                className="rounded border px-2 py-1 font-mono text-xs"
                style={{
                  borderColor: `${color}50`,
                  color: color,
                  backgroundColor: `${color}15`,
                }}
              >
                {SECTOR_LABELS[inst.sector_type] || inst.sector_type.toUpperCase()}
              </span>
            </div>

            {/* Name + ticker */}
            <h3 className="font-body text-xl font-bold text-white line-clamp-1 mb-1">
              {inst.display_name}
            </h3>
            {inst.ticker && (
              <p className="font-mono text-sm text-white/40 mb-2">{inst.ticker}</p>
            )}

            {/* HQ */}
            {inst.headquarters && (
              <div className="flex items-center gap-1.5 mb-4">
                <MapPin size={14} className="text-white/30 flex-shrink-0" />
                <span className="font-body text-sm text-white/50 truncate">
                  {inst.headquarters}
                </span>
              </div>
            )}

            {/* Spacer pushes stats to bottom */}
            <div className="mt-auto" />

            {/* Stats footer */}
            <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
              <div>
                <p className="font-mono text-xs text-white/40 mb-1">FILINGS</p>
                <p className="font-mono text-lg text-white">
                  {inst.filing_count.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs text-white/40 mb-1">COMPLAINTS</p>
                <p className="font-mono text-lg text-[#FF3366]">
                  {inst.complaint_count.toLocaleString()}
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

export default function InstitutionDirectoryPage() {
  const [allInstitutions, setAllInstitutions] = useState<InstitutionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  // Ref for scroll-triggered animations
  const headerRef = React.useRef<HTMLDivElement>(null);
  const headerInView = useInView(headerRef, { once: true, amount: 0.1 });

  useEffect(() => {
    getInstitutions({ limit: 200 })
      .then((res) => setAllInstitutions(res.institutions || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Sector counts
  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allInstitutions.forEach((inst) => {
      counts[inst.sector_type] = (counts[inst.sector_type] || 0) + 1;
    });
    return counts;
  }, [allInstitutions]);

  // Filter + search
  const filtered = useMemo(() => {
    let list = allInstitutions;
    if (sectorFilter) {
      list = list.filter((i) => i.sector_type === sectorFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.display_name.toLowerCase().includes(q) ||
          (i.ticker && i.ticker.toLowerCase().includes(q)) ||
          i.institution_id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allInstitutions, sectorFilter, search]);

  const sectors = ['bank', 'investment', 'insurance', 'fintech', 'central_bank'];

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        <FinanceSectorHeader />

        {/* Header */}
        <motion.div
          ref={headerRef}
          initial={{ opacity: 0, y: -20 }}
          animate={headerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-6"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
                Institutions
              </h1>
              <p className="mt-1 font-body text-lg text-white/50">
                {allInstitutions.length} tracked financial entities
              </p>
            </div>

            {/* Search */}
            <div className="relative w-full max-w-[480px]">
              <Search
                size={20}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                type="text"
                placeholder="Search by name or ticker…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-[#0A0A0A] bg-[#111111] py-3 pl-12 pr-4 font-body text-lg text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#34D399]"
              />
            </div>
          </div>
        </motion.div>

        {/* Sector filters */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={headerInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex gap-3 overflow-x-auto pb-4 mb-6"
          style={{ touchAction: 'pan-x' }}
        >
          <FilterPill
            label="ALL"
            count={allInstitutions.length}
            active={sectorFilter === null}
            color="#34D399"
            onClick={() => setSectorFilter(null)}
          />
          {sectors.map((s) => (
            <FilterPill
              key={s}
              label={SECTOR_LABELS[s] || s.toUpperCase()}
              count={sectorCounts[s] || 0}
              active={sectorFilter === s}
              color={sectorColor(s)}
              onClick={() => setSectorFilter(sectorFilter === s ? null : s)}
            />
          ))}
        </motion.div>

        {/* Cards grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-56 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <SearchX size={48} className="text-white/20" />
            <p className="font-body text-xl text-white/40">
              No institutions match your search
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 pb-8">
            {filtered.map((inst, idx) => (
              <InstitutionCard
                key={inst.institution_id}
                inst={inst}
                index={idx}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
