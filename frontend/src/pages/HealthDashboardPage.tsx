import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DollarSign, Landmark, Shield, FlaskConical,
  ArrowRight, Building2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { HealthSectorHeader } from '../components/SectorHeader';
import SpotlightCard from '../components/SpotlightCard';
import {
  getHealthDashboardStats,
  getHealthCompanies,
  type HealthDashboardStats,
  type CompanyListItem,
} from '../api/health';
import { fmtNum } from '../utils/format';
import { LOCAL_LOGOS } from '../data/healthLogos';

// ── Helpers ──

function companyLogoUrl(c: { company_id: string; logo_url?: string | null }): string {
  if (LOCAL_LOGOS.has(c.company_id)) return `/logos/${c.company_id}.png`;
  if (c.logo_url) return c.logo_url;
  return '';
}

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ── Design Tokens ──

const ACCENT = '#DC2626';

const SECTOR_COLORS: Record<string, string> = {
  pharma: '#DC2626',
  insurer: '#3B82F6',
  biotech: '#10B981',
  pharmacy: '#F59E0B',
  distributor: '#64748B',
};

const SECTOR_LABELS: Record<string, string> = {
  pharma: 'Pharma',
  insurer: 'Insurers',
  biotech: 'Biotech',
  pharmacy: 'Pharmacy',
  distributor: 'Distributors',
};

function getSectorColor(key: string): string {
  return SECTOR_COLORS[key] || '#64748B';
}

function getSectorLabel(key: string): string {
  return SECTOR_LABELS[key] || key;
}

// ── Animation Variants ──

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

// ── Sector Distribution (Energy-style) ──

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
          Breakdown of tracked companies by healthcare segment
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

      {/* Legend Cards */}
      <div className="grid grid-cols-5 gap-4 mt-5">
        {sectors.map((sector) => (
          <Link
            key={sector.key}
            to={`/health/companies?sector=${encodeURIComponent(sector.key)}`}
            className="no-underline"
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

// ── Page ──

export default function HealthDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<HealthDashboardStats | null>(null);
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAction, setExpandedAction] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      getHealthDashboardStats(),
      getHealthCompanies({ limit: 100 }),
    ])
      .then(([statsRes, compRes]) => {
        setStats(statsRes);
        setCompanies(compRes.companies || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DC2626] border-t-transparent" />
      </div>
    );
  }

  const statCards = [
    { label: 'Lobbying Spend', value: formatMoney(stats?.total_lobbying_spend || 0), icon: DollarSign, color: '#3B82F6', to: '/health/companies' },
    { label: 'Gov Contracts', value: formatMoney(stats?.total_contract_value || 0), icon: Landmark, color: '#10B981', to: '/health/companies' },
    { label: 'Enforcement Actions', value: fmtNum(stats?.total_enforcement || 0), icon: Shield, color: '#EF4444', to: '/health/companies' },
    { label: 'Clinical Trials', value: fmtNum(stats?.total_trials || 0), icon: FlaskConical, color: '#A855F7', to: '/health/pipeline' },
  ];

  const featured = companies.slice(0, 6);

  // Use enforcement count as a proxy for recent activity items
  const activityItems = companies
    .filter((c) => (c.recall_count || 0) > 0 || (c.adverse_event_count || 0) > 0)
    .slice(0, 5)
    .map((c, idx) => ({
      id: idx,
      title: `${c.display_name} — ${c.recall_count || 0} recalls, ${c.adverse_event_count || 0} adverse events`,
      company_id: c.company_id,
      sector: c.sector_type,
    }));

  return (
    <div className="min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Navigation bar */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <HealthSectorHeader />
        </motion.nav>

        {/* Hero Section — 2 columns */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mb-12">
          {/* Left: Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col justify-center"
          >
            <p className="font-heading text-xs font-semibold tracking-[0.3em] text-red-400 uppercase mb-4">
              Healthcare Transparency
            </p>
            <h1 className="font-heading text-5xl font-bold leading-[1.1] tracking-tight text-white lg:text-6xl">
              Tracking Pharma's
              <br />
              <span className="text-red-500">Political Influence</span>
            </h1>
            <p className="mt-4 max-w-lg font-body text-lg text-white/50 leading-relaxed">
              Lobbying expenditures, government contracts, enforcement actions, and clinical trials across the nation's largest healthcare and pharmaceutical companies.
            </p>
            <div className="mt-8 flex gap-3">
              <Link
                to="/health/companies"
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-red-700 no-underline"
              >
                Browse Companies
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/health/drugs"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2.5 font-body text-sm font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white no-underline"
              >
                Drug Lookup
              </Link>
            </div>
          </motion.div>

          {/* Right: 2x2 Stat Cards */}
          <div className="grid grid-cols-2 gap-4">
            {statCards.map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.2 + idx * 0.1 }}
              >
                <button
                  onClick={() => navigate(stat.to)}
                  className="group relative w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-all duration-300 hover:border-white/20 cursor-pointer text-left"
                >
                  <div className="absolute left-0 top-0 h-full w-[3px] opacity-0 transition-opacity group-hover:opacity-100" style={{ backgroundColor: stat.color }} />
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-heading text-[10px] font-semibold tracking-wider text-white/40 uppercase">
                      {stat.label}
                    </span>
                    <stat.icon size={18} style={{ color: stat.color }} className="opacity-60" />
                  </div>
                  <span className="font-mono text-3xl font-bold text-white tracking-tight">
                    {stat.value}
                  </span>
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Sector Distribution */}
        {stats && stats.by_sector && Object.keys(stats.by_sector).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="mb-12"
          >
            <SectorDistribution
              bySector={stats.by_sector}
              totalCompanies={stats.total_companies || 0}
            />
          </motion.div>
        )}

        {/* Navigation Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-12"
        >
          {[
            { to: '/health/companies', label: 'Companies', desc: 'Full company directory', color: ACCENT },
            { to: '/health/drugs', label: 'Drug Lookup', desc: 'Search FDA drug database', color: '#3B82F6' },
            { to: '/health/pipeline', label: 'Clinical Pipeline', desc: 'Active trials & phases', color: '#A855F7' },
            { to: '/health/compare', label: 'Compare', desc: 'Side-by-side company analysis', color: '#10B981' },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-white/20 no-underline"
            >
              <p className="font-heading text-sm font-bold uppercase tracking-wider" style={{ color: link.color }}>
                {link.label}
              </p>
              <p className="font-body text-xs text-white/30 mt-1">{link.desc}</p>
            </Link>
          ))}
        </motion.div>

        {/* Two columns: Featured Companies + Recent Activity */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Featured Companies */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white">
                Featured Companies
              </h2>
              <Link
                to="/health/companies"
                className="font-body text-xs font-medium text-red-400 hover:text-red-300 transition-colors no-underline"
              >
                View all &rarr;
              </Link>
            </div>
            <div className="space-y-3">
              {featured.map((company, idx) => (
                <motion.div
                  key={company.company_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.85 + idx * 0.06 }}
                >
                  <Link
                    to={`/health/${company.company_id}`}
                    className="block no-underline"
                  >
                    <SpotlightCard
                      className="rounded-xl border border-white/10 bg-white/[0.03]"
                      spotlightColor="rgba(220, 38, 38, 0.10)"
                    >
                      <div className="flex items-center gap-4 p-4">
                        <div className="w-11 h-11 rounded-lg border border-white/10 bg-white/[0.05] flex items-center justify-center shrink-0 p-1.5">
                          {companyLogoUrl(company) ? (
                            <img src={companyLogoUrl(company)} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <Building2 size={18} className="text-white/30" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-sm font-semibold text-white truncate">
                            {company.display_name}
                          </p>
                          {company.ticker && (
                            <span className="font-mono text-[11px] text-white/30">
                              {company.ticker}
                            </span>
                          )}
                        </div>
                        <span
                          className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                          style={{
                            backgroundColor: getSectorColor(company.sector_type) + '22',
                            color: getSectorColor(company.sector_type),
                          }}
                        >
                          {getSectorLabel(company.sector_type)}
                        </span>
                      </div>
                    </SpotlightCard>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white">
                Recent Activity
              </h2>
              <Link
                to="/health/companies"
                className="font-body text-xs font-medium text-red-400 hover:text-red-300 transition-colors no-underline"
              >
                Full feed &rarr;
              </Link>
            </div>
            <SpotlightCard
              className="rounded-xl border border-white/10 bg-white/[0.03]"
              spotlightColor="rgba(220, 38, 38, 0.10)"
            >
              <div className="divide-y divide-white/5">
                {activityItems.length > 0 ? (
                  activityItems.map((item) => {
                    const isExpanded = expandedAction === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setExpandedAction(isExpanded ? null : item.id)}
                        className="w-full p-4 text-left cursor-pointer transition-colors hover:bg-white/[0.02]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className={`font-body text-sm font-medium text-white/90 ${isExpanded ? '' : 'truncate'}`}>
                              {item.title}
                            </p>
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <span
                                className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                                style={{
                                  backgroundColor: getSectorColor(item.sector) + '22',
                                  color: getSectorColor(item.sector),
                                }}
                              >
                                {getSectorLabel(item.sector)}
                              </span>
                              {isExpanded && (
                                <Link
                                  to={`/health/${item.company_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] text-red-400 hover:bg-red-500/20 transition-colors no-underline"
                                >
                                  View company &rarr;
                                </Link>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            {isExpanded ? (
                              <ChevronUp size={12} className="text-white/20" />
                            ) : (
                              <ChevronDown size={12} className="text-white/20" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-6 text-center">
                    <p className="font-body text-sm text-white/30">No recent activity data available</p>
                  </div>
                )}
              </div>
            </SpotlightCard>
          </motion.div>
        </div>

        {/* Data Sources */}
        <div className="border-t border-white/10 pt-6 mt-8">
          <span className="font-mono text-xs font-bold tracking-[0.2em] uppercase text-white/30">Data Sources</span>
          <div className="flex flex-wrap gap-x-8 gap-y-3 mt-4">
            {['Senate LDA (Lobbying)', 'USASpending (Contracts)', 'FDA Enforcement', 'OpenFDA', 'ClinicalTrials.gov', 'CMS Open Payments', 'SEC EDGAR'].map((source) => (
              <div key={source} className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
                <span className="w-1.5 h-1.5 rounded-sm bg-zinc-600" />
                <span className="font-mono text-xs font-semibold tracking-wider uppercase text-zinc-300">{source}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <Link to="/" className="font-body text-sm text-white/50 hover:text-white transition-colors no-underline">
            &larr; All Sectors
          </Link>
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}
