import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { Building2, FileText, Landmark, FileBadge, Search, GitCompare } from 'lucide-react';
import {
  getTechDashboardStats,
  getTechCompanies,
  type TechDashboardStats,
  type TechCompanyListItem,
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

// ── Spring animation variants ──

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 80, damping: 20 },
  },
};

// ── Stat Card ──

function HeroStatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-8 flex flex-col gap-6"
    >
      {/* Top hover bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-zinc-600 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

      {/* Label + Icon */}
      <div className="flex items-center justify-between">
        <span className="font-heading text-sm font-bold tracking-[0.2em] uppercase text-zinc-500 group-hover:text-zinc-300 transition-colors">
          {label}
        </span>
        <Icon
          size={24}
          className="text-zinc-500 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all"
        />
      </div>

      {/* Value */}
      <span className="font-mono text-5xl font-semibold text-zinc-100 2xl:text-7xl">
        {value}
      </span>
    </motion.div>
  );
}

// ── Sector Distribution Bar ──

function SectorDistribution({
  bySector,
  totalCompanies,
}: {
  bySector: Record<string, number>;
  totalCompanies: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

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
      {/* Header */}
      <motion.div variants={itemVariants} className="mb-6">
        <h2 className="font-heading text-6xl font-bold tracking-tight uppercase text-zinc-50 2xl:text-8xl">
          Sector Distribution
        </h2>
        <p className="mt-4 font-body text-2xl text-zinc-400 leading-relaxed max-w-2xl 2xl:text-3xl">
          Breakdown of tracked companies by industry segment
        </p>
      </motion.div>

      {/* Stacked Bar */}
      <motion.div
        variants={itemVariants}
        className="h-32 bg-zinc-900 border border-zinc-800 rounded-2xl p-2 shadow-2xl flex gap-2 2xl:h-40"
      >
        {sectors.map((sector, idx) => (
          <motion.div
            key={sector.key}
            className="group relative h-full rounded-xl overflow-hidden cursor-default"
            initial={{ width: 0, opacity: 0 }}
            animate={
              isInView
                ? { width: `${sector.percentage}%`, opacity: 1 }
                : { width: 0, opacity: 0 }
            }
            transition={{
              duration: 1.2,
              delay: 0.2 + idx * 0.1,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{ backgroundColor: getSectorColor(sector.key) }}
          >
            {/* Dark overlay — removed on hover */}
            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300" />
            {/* Percentage label — revealed on hover */}
            <span className="absolute bottom-4 left-4 font-mono text-2xl font-bold text-white drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {sector.percentage.toFixed(1)}%
            </span>
          </motion.div>
        ))}
      </motion.div>

      {/* Legend Grid */}
      <div className="grid grid-cols-2 gap-6 mt-8 lg:grid-cols-5">
        {sectors.map((sector) => (
          <motion.div
            key={sector.key}
            variants={itemVariants}
            className="group rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 flex flex-col gap-4 transition-all hover:bg-zinc-900 hover:border-zinc-700"
          >
            {/* Color dot + label */}
            <div className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-md shadow-sm group-hover:scale-110 transition-transform duration-150"
                style={{ backgroundColor: getSectorColor(sector.key) }}
              />
              <span className="font-heading text-xl font-bold tracking-widest uppercase text-zinc-300 group-hover:text-zinc-100 transition-colors">
                {getSectorLabel(sector.key)}
              </span>
            </div>
            {/* Count + percentage */}
            <div className="flex items-end gap-3 mt-2">
              <span className="font-mono text-4xl font-semibold text-white 2xl:text-5xl">
                {sector.count}
              </span>
              <span className="font-mono text-sm text-zinc-500 mb-1">
                {sector.percentage.toFixed(1)}%
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Location Pin SVG ──

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

// ── Featured Company Card ──

function FeaturedCompanyCard({
  company,
}: {
  company: TechCompanyListItem;
}) {
  const sectorColor = getSectorColor(company.sector_type);

  return (
    <motion.div variants={itemVariants}>
      <Link
        to={`/technology/${company.company_id}`}
        className="group flex flex-col rounded-2xl border border-zinc-800 bg-[#18181B] shadow-lg overflow-hidden transition-colors hover:border-zinc-600 cursor-pointer no-underline h-full"
      >
        {/* Card Body */}
        <div className="flex-1 p-6 flex flex-col gap-6 lg:p-8">
          {/* Header: Logo + Name/Meta */}
          <div className="flex items-start gap-5">
            {/* Logo Box */}
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-[#09090B] p-3 shadow-inner lg:h-20 lg:w-20">
              {company.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={company.display_name}
                  className="h-full w-full object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                />
              ) : (
                <Building2 size={28} className="text-zinc-500" />
              )}
            </div>

            {/* Name + Ticker/HQ */}
            <div className="min-w-0 flex-1">
              <h3 className="font-heading text-2xl font-bold text-white leading-tight truncate lg:text-3xl">
                {company.display_name}
              </h3>
              <div className="flex items-center gap-3 mt-1.5">
                {company.ticker && (
                  <span className="font-mono text-sm font-medium text-zinc-400 bg-[#18181B] px-2 py-0.5 rounded">
                    {company.ticker}
                  </span>
                )}
                {company.ticker && company.headquarters && (
                  <span className="w-1 h-1 rounded-full bg-zinc-700" />
                )}
                {company.headquarters && (
                  <span className="font-body text-sm font-medium text-zinc-400 truncate">
                    <PinIcon />
                    {company.headquarters}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Sector Badge */}
          <div>
            <span
              className="inline-block px-3.5 py-1.5 rounded-md font-heading text-xs font-bold tracking-widest uppercase"
              style={{
                color: sectorColor,
                backgroundColor: `${sectorColor}15`,
                border: `1px solid ${sectorColor}30`,
              }}
            >
              {getSectorLabel(company.sector_type)}
            </span>
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
              className="flex flex-col items-center justify-center gap-2 p-5 transition-colors hover:bg-zinc-900/50"
            >
              <span className="font-mono text-2xl font-semibold text-zinc-100">
                {stat.value.toLocaleString()}
              </span>
              <span className="font-heading text-xs font-normal tracking-widest uppercase text-zinc-500">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </Link>
    </motion.div>
  );
}

// ── Navigation & Sources (Deeper Investigation) ──

const navContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15 },
  },
};

const navItemVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 80 },
  },
};

const NAV_LINKS = [
  {
    to: '/technology/companies',
    title: 'Company Directory',
    subtitle: 'Browse all tracked tech companies with search and filters',
    icon: Search,
  },
  {
    to: '/technology/compare',
    title: 'Compare Entities',
    subtitle: 'Side-by-side comparison of patents, contracts, and lobbying',
    icon: GitCompare,
  },
];

const DATA_SOURCES = [
  'USPTO Patent Database',
  'USASpending.gov',
  'SEC EDGAR',
  'Senate LDA Lobbying',
  'FTC Enforcement',
  'Yahoo Finance',
];

function DeeperInvestigation() {
  return (
    <motion.div
      variants={navContainerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="relative w-full"
    >
      {/* Abstract glows */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full translate-x-1/3 -translate-y-1/3"
          style={{
            backgroundColor: '#2563EB',
            mixBlendMode: 'screen',
            filter: 'blur(150px)',
            opacity: 0.1,
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full -translate-x-1/3 translate-y-1/3"
          style={{
            backgroundColor: '#8B5CF6',
            mixBlendMode: 'screen',
            filter: 'blur(150px)',
            opacity: 0.1,
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl flex flex-col gap-24">
        {/* Section title */}
        <motion.h2
          variants={navItemVariants}
          className="font-heading text-4xl font-bold tracking-[0.2em] uppercase text-zinc-500 2xl:text-5xl"
        >
          Deeper Investigation
        </motion.h2>

        {/* Nav cards grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          {NAV_LINKS.map((link) => (
            <motion.div key={link.to} variants={navItemVariants}>
              <Link to={link.to} className="no-underline">
                <motion.div
                  className="group flex items-center justify-between rounded-[2rem] border border-zinc-800 bg-[#18181B] p-10 shadow-2xl cursor-pointer transition-all duration-300 hover:border-blue-500/50 hover:shadow-blue-900/20 lg:p-14"
                  whileHover={{ y: -8, scale: 1.02, transition: { duration: 0.2 } }}
                >
                  {/* Text */}
                  <div className="flex flex-col gap-5 pr-8">
                    <span className="font-heading text-4xl font-bold tracking-tight uppercase text-white group-hover:text-blue-400 transition-colors duration-300 2xl:text-5xl">
                      {link.title}
                    </span>
                    <span className="font-body text-xl font-medium text-zinc-400 leading-relaxed 2xl:text-2xl">
                      {link.subtitle}
                    </span>
                  </div>
                  {/* Icon circle */}
                  <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-[#09090B] transition-all duration-300 group-hover:bg-blue-500/10 group-hover:border-blue-500/50">
                    <link.icon
                      size={36}
                      className="text-zinc-400 group-hover:text-blue-400 group-hover:scale-110 transition-all"
                    />
                  </div>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Data Sources footer */}
        <motion.div
          variants={navItemVariants}
          className="border-t border-zinc-800/50 pt-16 flex flex-col gap-10"
        >
          <span className="font-heading text-sm font-bold tracking-[0.3em] uppercase text-zinc-600">
            Data Sources
          </span>
          <div className="flex flex-wrap gap-x-16 gap-y-8">
            {DATA_SOURCES.map((source) => (
              <div
                key={source}
                className="flex items-center gap-4 opacity-50 hover:opacity-100 transition-opacity"
              >
                <span className="w-2 h-2 rounded-sm bg-zinc-600" />
                <span className="font-mono text-xl font-semibold tracking-widest uppercase text-zinc-50">
                  {source}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── Page ──

export default function TechDashboardPage() {
  const [stats, setStats] = useState<TechDashboardStats | null>(null);
  const [companies, setCompanies] = useState<TechCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTechDashboardStats(),
      getTechCompanies({ limit: 50 }),
    ])
      .then(([statsRes, compRes]) => {
        setStats(statsRes);
        setCompanies(compRes.companies || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#09090B]">
      {/* Background decor */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {/* Radial purple glow */}
        <div
          className="absolute w-full h-full"
          style={{
            background: 'radial-gradient(ellipse at 50% -20%, #8B5CF6 0%, transparent 60%)',
            opacity: 0.1,
          }}
        />
        {/* Grid pattern */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(#F8FAFC 1px, transparent 1px), linear-gradient(90deg, #F8FAFC 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            opacity: 0.03,
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-[1600px] px-12 py-16 md:px-20 2xl:px-24">
        {/* ────── HERO STATS SECTION ────── */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="flex flex-col gap-20"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="flex flex-col gap-6">
            {/* Sector label with pulse */}
            <div className="flex items-center gap-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
              </span>
              <span className="font-heading text-lg font-bold tracking-[0.25em] text-emerald-400 uppercase xl:text-xl">
                Technology Sector
              </span>
            </div>

            {/* Headline */}
            <h1 className="font-heading text-6xl font-bold tracking-tight text-zinc-50 leading-[0.95] xl:text-[110px]">
              Tech Accountability
            </h1>

            {/* Subtitle */}
            <p className="font-body text-2xl text-zinc-400 leading-relaxed max-w-3xl xl:text-3xl">
              Tracking patents, government contracts, SEC filings, and lobbying
              across the largest technology companies in the United States.
            </p>
          </motion.div>

          {/* Stat Cards Grid */}
          {loading ? (
            <div className="grid grid-cols-2 gap-6 2xl:grid-cols-4 2xl:gap-8">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-40 rounded-2xl bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : stats ? (
            <motion.div
              variants={containerVariants}
              className="grid grid-cols-2 gap-6 2xl:grid-cols-4 2xl:gap-8"
            >
              <HeroStatCard
                label="Companies Tracked"
                value={stats.total_companies.toLocaleString()}
                icon={Building2}
              />
              <HeroStatCard
                label="Patents Filed"
                value={formatLargeNum(stats.total_patents)}
                icon={FileBadge}
              />
              <HeroStatCard
                label="Gov Contracts"
                value={formatLargeNum(stats.total_contracts)}
                icon={Landmark}
              />
              <HeroStatCard
                label="SEC Filings"
                value={formatLargeNum(stats.total_filings)}
                icon={FileText}
              />
            </motion.div>
          ) : null}

          {/* ────── SECTOR DISTRIBUTION SECTION ────── */}
          {stats && Object.keys(stats.by_sector).length > 0 && (
            <SectorDistribution
              bySector={stats.by_sector}
              totalCompanies={stats.total_companies}
            />
          )}

          {/* ────── FEATURED COMPANIES ────── */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.h2
              variants={itemVariants}
              className="font-heading text-5xl font-bold tracking-tight uppercase text-zinc-50 mb-10 2xl:text-7xl"
            >
              Featured Companies
            </motion.h2>

            {loading ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8 auto-rows-fr">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-72 rounded-2xl bg-zinc-900 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8 auto-rows-fr">
                {companies.map((co) => (
                  <FeaturedCompanyCard key={co.company_id} company={co} />
                ))}
              </div>
            )}
          </motion.div>

          {/* ────── NAVIGATION & SOURCES ────── */}
          <DeeperInvestigation />
        </motion.div>
      </div>
    </div>
  );
}
