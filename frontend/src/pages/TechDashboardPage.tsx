import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { Building2, FileText, Landmark, FileBadge, DollarSign, Shield, Search, type LucideIcon } from 'lucide-react';
import BackButton from '../components/BackButton';
import { TechSectorHeader } from '../components/SectorHeader';
import {
  getTechDashboardStats,
  type TechDashboardStats,
} from '../api/tech';

// ── Helpers ──

function formatLargeNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Sector color mapping ──

const SECTOR_COLORS: Record<string, string> = {
  platform: '#8B5CF6',
  enterprise: '#2563EB',
  semiconductor: '#F59E0B',
  automotive: '#10B981',
  media: '#EC4899',
};

const SECTOR_LABELS: Record<string, string> = {
  platform: 'PLATFORM',
  enterprise: 'ENTERPRISE',
  semiconductor: 'SEMICONDUCTOR',
  automotive: 'AUTOMOTIVE',
  media: 'MEDIA',
};

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector.toLowerCase()] || '#52525B';
}

function getSectorLabel(sector: string): string {
  return SECTOR_LABELS[sector.toLowerCase()] || sector.toUpperCase();
}

// ── Animation variants ──

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 100, damping: 20 },
  },
};

// ── Stat Card (compact) ──

function HeroStatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-5 flex flex-col gap-3"
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-zinc-600 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      <div className="flex items-center justify-between">
        <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500 group-hover:text-zinc-300 transition-colors">
          {label}
        </span>
        <Icon size={18} className="text-zinc-500 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
      </div>
      <span className="font-mono text-3xl font-semibold text-zinc-100">
        {value}
      </span>
    </motion.div>
  );
}

// ── Sector Distribution (compact) ──

function SectorDistribution({
  bySector,
  totalCompanies,
}: {
  bySector: Record<string, number>;
  totalCompanies: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  const sectors = Object.entries(bySector)
    .map(([key, count]) => ({
      key,
      count,
      percentage: totalCompanies > 0 ? (count / totalCompanies) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <motion.div
      ref={ref}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="w-full"
    >
      <motion.div variants={itemVariants} className="mb-4">
        <h2 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-50">
          Sector Distribution
        </h2>
        <p className="mt-1 font-body text-sm text-zinc-500">
          Breakdown of tracked companies by industry segment
        </p>
      </motion.div>

      {/* Stacked Bar */}
      <motion.div
        variants={itemVariants}
        className="h-16 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 shadow-lg flex gap-1.5"
      >
        {sectors.map((sector, idx) => (
          <motion.div
            key={sector.key}
            className="group relative h-full rounded-lg overflow-hidden cursor-default"
            initial={{ width: 0, opacity: 0 }}
            animate={isInView ? { width: `${sector.percentage}%`, opacity: 1 } : { width: 0, opacity: 0 }}
            transition={{ duration: 1, delay: 0.15 + idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
            style={{ backgroundColor: getSectorColor(sector.key) }}
          >
            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300" />
            <span className="absolute bottom-1.5 left-2 font-mono text-xs font-bold text-white drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {sector.percentage.toFixed(0)}%
            </span>
          </motion.div>
        ))}
      </motion.div>

      {/* Legend */}
      <div className="grid grid-cols-5 gap-4 mt-5">
        {sectors.map((sector) => (
          <Link
            key={sector.key}
            to={`/technology/companies?sector=${encodeURIComponent(sector.key)}`}
          >
          <motion.div
            variants={itemVariants}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 flex flex-col gap-3 transition-all hover:bg-zinc-900 hover:border-zinc-700 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-3.5 h-3.5 rounded-sm shadow-sm"
                style={{ backgroundColor: getSectorColor(sector.key) }}
              />
              <span className="font-heading text-sm font-bold tracking-wider uppercase text-zinc-400 group-hover:text-zinc-200 transition-colors">
                {getSectorLabel(sector.key)}
              </span>
            </div>
            <div className="flex items-end gap-2">
              <span className="font-mono text-3xl font-semibold text-white">
                {sector.count}
              </span>
              <span className="font-mono text-sm text-zinc-500 mb-0.5">
                {sector.percentage.toFixed(1)}%
              </span>
            </div>
          </motion.div>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}

// ── Navigation Cards ──


const DATA_SOURCES = [
  'USPTO Patent Database',
  'USASpending.gov',
  'SEC EDGAR',
  'Senate LDA Lobbying',
  'FTC Enforcement',
  'Yahoo Finance',
];

function DataSourcesFooter() {
  return (
    <motion.div
      variants={itemVariants}
      className="border-t border-zinc-800/50 pt-6 flex flex-col gap-4"
    >
      <span className="font-heading text-xs font-bold tracking-[0.2em] uppercase text-zinc-600">
        Data Sources
      </span>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {DATA_SOURCES.map((source) => (
          <div key={source} className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
            <span className="w-1.5 h-1.5 rounded-sm bg-zinc-600" />
            <span className="font-mono text-xs font-semibold tracking-wider uppercase text-zinc-300">
              {source}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Page ──

export default function TechDashboardPage() {
  const [stats, setStats] = useState<TechDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTechDashboardStats()
      .then((statsRes) => setStats(statsRes))
      .catch((e) => setError(e.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-400 mb-2">Failed to load dashboard</p>
          <p className="text-sm text-white/50">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded bg-[#8B5CF6] px-4 py-2 text-sm text-white hover:bg-[#7C3AED]">Retry</button>
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
          style={{ background: 'radial-gradient(ellipse at 50% -20%, #8B5CF6 0%, transparent 60%)', opacity: 0.08 }}
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
          whileInView="visible"
          viewport={{ once: true }}
          className="flex flex-col gap-10"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="flex flex-col gap-3">
            <TechSectorHeader />

            <div className="flex items-center gap-3 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
              </span>
              <span className="font-heading text-sm font-bold tracking-[0.2em] text-emerald-400 uppercase">
                Technology Sector
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="font-heading text-4xl font-bold tracking-tight text-zinc-50 leading-tight xl:text-5xl">
                Technology Sector
              </h1>
              <p className="font-body text-base text-zinc-400 leading-relaxed max-w-2xl">
                Big Tech's political playbook — lobbying, government contracts, enforcement, and patents
                across the largest technology companies in the United States.
              </p>
            </div>
          </motion.div>

          {/* Stat Cards — always 4 columns */}
          {loading ? (
            <div className="grid grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : stats ? (
            <motion.div variants={containerVariants} className="grid grid-cols-4 gap-4">
              <HeroStatCard label="Lobbying Spend" value={stats.total_lobbying_spend ? `$${formatLargeNum(stats.total_lobbying_spend)}` : '$0'} icon={DollarSign} />
              <HeroStatCard label="Gov Contract Value" value={stats.total_contract_value ? `$${formatLargeNum(stats.total_contract_value)}` : `$${formatLargeNum(stats.total_contracts)}`} icon={Landmark} />
              <HeroStatCard label="Enforcement Actions" value={formatLargeNum(stats.total_enforcement || 0)} icon={Shield} />
              <HeroStatCard label="Patents Filed" value={formatLargeNum(stats.total_patents)} icon={FileBadge} />
            </motion.div>
          ) : null}

          {/* Sector Distribution */}
          {stats && Object.keys(stats.by_sector).length > 0 && (
            <SectorDistribution bySector={stats.by_sector} totalCompanies={stats.total_companies} />
          )}

          {/* Data Sources footer */}
          <DataSourcesFooter />
        </motion.div>
      </div>
    </div>
  );
}
