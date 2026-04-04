import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { DollarSign, Landmark, Shield, ArrowRight, ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';
import { TelecomSectorHeader } from '../components/SectorHeader';
import SpotlightCard from '../components/SpotlightCard';
import CompanyLogo from '../components/CompanyLogo';
import DataFreshness from '../components/DataFreshness';
import {
  getTelecomDashboardStats,
  getTelecomCompanies,
  getTelecomRecentActivity,
  type TelecomDashboardStats,
  type TelecomCompanyListItem,
  type RecentActivityItem,
} from '../api/telecom';

// ── Helpers ──

function fmtNum(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtMoney(n: number): string {
  return `$${fmtNum(n).replace('$', '')}`;
}

// ── Sector colors ──

const SECTOR_COLORS: Record<string, string> = {
  wireless: '#3B82F6',
  broadband: '#10B981',
  cable: '#F59E0B',
  satellite: '#8B5CF6',
  fiber: '#EC4899',
  voip: '#06B6D4',
  infrastructure: '#EF4444',
};

const SECTOR_LABELS: Record<string, string> = {
  wireless: 'WIRELESS',
  broadband: 'BROADBAND',
  cable: 'CABLE',
  satellite: 'SATELLITE',
  fiber: 'FIBER',
  voip: 'VOIP',
  infrastructure: 'INFRASTRUCTURE',
};

function getSectorColor(s: string): string { return SECTOR_COLORS[s.toLowerCase()] || '#52525B'; }
function getSectorLabel(s: string): string { return SECTOR_LABELS[s.toLowerCase()] || s.toUpperCase(); }

// ── Animation variants ──

const containerV = { hidden: {}, visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };
const itemV = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 20 } },
};

// ── Sector Distribution ──

function SectorDistribution({ bySector, total }: { bySector: Record<string, number>; total: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  const sectors = Object.entries(bySector)
    .map(([key, count]) => ({ key, count, pct: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <motion.div ref={ref} variants={containerV} initial="hidden" whileInView="visible" viewport={{ once: true }}>
      <motion.div variants={itemV} className="mb-4">
        <h2 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-50">Sector Distribution</h2>
        <p className="mt-1 font-body text-sm text-zinc-500">Breakdown of tracked companies by telecom segment</p>
      </motion.div>
      <motion.div variants={itemV} className="h-16 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 shadow-lg flex gap-1.5">
        {sectors.map((s, i) => (
          <motion.div key={s.key} className="group relative h-full rounded-lg overflow-hidden cursor-default"
            initial={{ width: 0, opacity: 0 }}
            animate={inView ? { width: `${s.pct}%`, opacity: 1 } : { width: 0, opacity: 0 }}
            transition={{ duration: 1, delay: 0.15 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            style={{ backgroundColor: getSectorColor(s.key) }}
          >
            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300" />
            <span className="absolute bottom-1.5 left-2 font-mono text-xs font-bold text-white drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity">{s.pct.toFixed(0)}%</span>
          </motion.div>
        ))}
      </motion.div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-5">
        {sectors.map((s) => (
          <Link key={s.key} to={`/telecom/companies?sector=${encodeURIComponent(s.key)}`}>
            <motion.div variants={itemV} className="group rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 flex flex-col gap-3 transition-all hover:bg-zinc-900 hover:border-zinc-700 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 rounded-sm shadow-sm" style={{ backgroundColor: getSectorColor(s.key) }} />
                <span className="font-heading text-sm font-bold tracking-wider uppercase text-zinc-400 group-hover:text-zinc-200 transition-colors">{getSectorLabel(s.key)}</span>
              </div>
              <div className="flex items-end gap-2">
                <span className="font-mono text-3xl font-semibold text-white">{s.count}</span>
                <span className="font-mono text-sm text-zinc-500 mb-0.5">{s.pct.toFixed(1)}%</span>
              </div>
            </motion.div>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}

// ── Data Sources ──

const DATA_SOURCES = ['SEC EDGAR', 'USASpending.gov', 'Senate LDA Lobbying', 'FCC Enforcement', 'Yahoo Finance'];

// ── Page ──

export default function TelecomDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<TelecomDashboardStats | null>(null);
  const [companies, setCompanies] = useState<TelecomCompanyListItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [expandedAction, setExpandedAction] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getTelecomDashboardStats(),
      getTelecomCompanies({ limit: 6 }),
      getTelecomRecentActivity(10).catch(() => ({ items: [] })),
    ])
      .then(([s, c, activity]) => {
        if (s.total_companies == null) throw new Error('Telecom sector data is not yet available on this server.');
        setStats(s);
        setCompanies(c.companies || []);
        setRecentActivity(activity.items || []);
      })
      .catch((e) => setError(e.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-400 mb-2">Failed to load dashboard</p>
          <p className="text-sm text-white/50">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded bg-cyan-500 px-4 py-2 text-sm text-white hover:bg-cyan-600">Retry</button>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Lobbying Spend', value: stats?.total_lobbying_spend ? fmtMoney(stats.total_lobbying_spend) : '$0', icon: DollarSign, color: '#F59E0B', to: '/telecom/lobbying' },
    { label: 'Gov Contracts', value: stats?.total_contract_value ? fmtMoney(stats.total_contract_value) : fmtMoney(stats?.total_contracts || 0), icon: Landmark, color: '#2563EB', to: '/telecom/contracts' },
    { label: 'Enforcement Actions', value: fmtNum(stats?.total_enforcement || 0), icon: Shield, color: '#EF4444', to: '/telecom/enforcement' },
  ];

  return (
    <div className="min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        {/* Sector Header */}
        <motion.nav initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-10">
          <TelecomSectorHeader />
        </motion.nav>

        {/* Hero Section — 2 columns */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mb-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="flex flex-col justify-center">
            <p className="font-heading text-xs font-semibold tracking-[0.3em] text-cyan-400 uppercase mb-4">Telecom Transparency</p>
            <h1 className="font-heading text-3xl sm:text-5xl font-bold leading-[1.1] tracking-tight text-white lg:text-6xl">
              Connecting Influence<br />to <span className="text-cyan-400">Power</span>
            </h1>
            <p className="mt-4 max-w-lg font-body text-lg text-white/50 leading-relaxed">
              Lobbying, government contracts, and enforcement across the largest telecommunications companies in the United States.
            </p>
            <div className="mt-8 flex gap-3">
              <Link to="/telecom/companies" className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-cyan-600 no-underline">
                Browse Companies <ArrowRight size={16} />
              </Link>
              <Link to="/telecom/compare" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2.5 font-body text-sm font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white no-underline">
                Compare Companies
              </Link>
            </div>
          </motion.div>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {loading ? (
              [0, 1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-white/[0.03] animate-pulse" />)
            ) : (
              statCards.map((stat, idx) => (
                <motion.div key={stat.label} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.2 + idx * 0.1 }}>
                  <button onClick={() => navigate(stat.to)} className="group relative w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-all duration-300 hover:border-white/20 cursor-pointer text-left">
                    <div className="absolute left-0 top-0 h-full w-[3px] opacity-0 transition-opacity group-hover:opacity-100" style={{ backgroundColor: stat.color }} />
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-heading text-[10px] font-semibold tracking-wider text-white/40 uppercase">{stat.label}</span>
                      <stat.icon size={18} style={{ color: stat.color }} className="opacity-60" />
                    </div>
                    <span className="font-mono text-3xl font-bold text-white tracking-tight">{stat.value}</span>
                  </button>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Data Freshness */}
        <DataFreshness />

        {/* Sector Distribution */}
        {stats && Object.keys(stats.by_sector).length > 0 && (
          <div className="mb-12">
            <SectorDistribution bySector={stats.by_sector} total={stats.total_companies} />
          </div>
        )}

        {/* Nav Cards */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.7 }} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-12">
          {[
            { to: '/telecom/companies', label: 'Companies', desc: 'Full company directory', color: '#06B6D4' },
            { to: '/telecom/companies', label: 'Contracts', desc: 'Government contract awards', color: '#2563EB' },
            { to: '/telecom/companies', label: 'Lobbying', desc: 'Political lobbying filings', color: '#F59E0B' },
            { to: '/telecom/compare', label: 'Compare', desc: 'Side-by-side company analysis', color: '#10B981' },
          ].map((link) => (
            <Link key={link.label} to={link.to} className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-white/20 no-underline">
              <p className="font-heading text-sm font-bold uppercase tracking-wider" style={{ color: link.color }}>{link.label}</p>
              <p className="font-body text-xs text-white/30 mt-1">{link.desc}</p>
            </Link>
          ))}
        </motion.div>

        {/* Two columns: Featured Companies + Recent Activity */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Featured Companies */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.8 }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white">Featured Companies</h2>
              <Link to="/telecom/companies" className="font-body text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors no-underline">View all &rarr;</Link>
            </div>
            <div className="space-y-3">
              {companies.slice(0, 6).map((c, idx) => (
                <motion.div key={c.company_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.85 + idx * 0.06 }}>
                  <Link to={`/telecom/${c.company_id}`} className="block no-underline">
                    <SpotlightCard className="rounded-xl border border-white/10 bg-white/[0.03]" spotlightColor="rgba(6, 182, 212, 0.10)">
                      <div className="flex items-center gap-4 p-4">
                        <CompanyLogo
                          id={c.company_id}
                          name={c.display_name}
                          logoUrl={c.logo_url}
                          size={44}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-sm font-semibold text-white truncate">{c.display_name}</p>
                          <p className="font-mono text-[11px] text-white/30">{c.ticker || c.company_id}</p>
                        </div>
                        <span className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold" style={{ backgroundColor: getSectorColor(c.sector_type) + '22', color: getSectorColor(c.sector_type) }}>
                          {getSectorLabel(c.sector_type)}
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
                to="/telecom/companies"
                className="font-body text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors no-underline"
              >
                Full feed &rarr;
              </Link>
            </div>
            <SpotlightCard
              className="rounded-xl border border-white/10 bg-white/[0.03]"
              spotlightColor="rgba(6, 182, 212, 0.10)"
            >
              <div className="divide-y divide-white/5">
                {recentActivity.length > 0 ? (
                  recentActivity.map((item, idx) => {
                    const isExpanded = expandedAction === idx;
                    const typeBadgeColors: Record<string, { bg: string; text: string }> = {
                      enforcement: { bg: '#EF444422', text: '#EF4444' },
                      contract: { bg: '#2563EB22', text: '#3B82F6' },
                      lobbying: { bg: '#F59E0B22', text: '#F59E0B' },
                    };
                    const badge = typeBadgeColors[item.type] || { bg: '#52525B22', text: '#A1A1AA' };
                    return (
                      <button
                        key={idx}
                        onClick={() => setExpandedAction(isExpanded ? null : idx)}
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
                                style={{ backgroundColor: badge.bg, color: badge.text }}
                              >
                                {item.type}
                              </span>
                              <span className="font-mono text-[10px] text-white/30">
                                {item.company_name}
                              </span>
                              {item.date && (
                                <span className="font-mono text-[10px] text-white/20">
                                  {item.date}
                                </span>
                              )}
                            </div>
                            {isExpanded && (
                              <div className="mt-3 space-y-2">
                                {item.description && (
                                  <p className="font-body text-xs text-white/50 leading-relaxed">
                                    {item.description}
                                  </p>
                                )}
                                {item.meta?.award_amount && (
                                  <p className="font-mono text-xs text-white/40">
                                    Award: {fmtMoney(item.meta.award_amount)}
                                  </p>
                                )}
                                {item.meta?.penalty_amount && (
                                  <p className="font-mono text-xs text-white/40">
                                    Penalty: {fmtMoney(item.meta.penalty_amount)}
                                  </p>
                                )}
                                {item.meta?.income && (
                                  <p className="font-mono text-xs text-white/40">
                                    Income: {fmtMoney(item.meta.income)}
                                  </p>
                                )}
                                <div className="flex items-center gap-2">
                                  <Link
                                    to={`/telecom/${item.company_id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-400 hover:bg-cyan-500/20 transition-colors no-underline"
                                  >
                                    View company &rarr;
                                  </Link>
                                  {item.url && (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/40 hover:bg-white/10 transition-colors no-underline"
                                    >
                                      Source &rarr;
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}
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
        <div className="border-t border-white/10 pt-6 mt-12">
          <span className="font-mono text-xs font-bold tracking-[0.2em] uppercase text-white/30">Data Sources</span>
          <div className="flex flex-wrap gap-x-8 gap-y-3 mt-4">
            {DATA_SOURCES.map((source) => (
              <div key={source} className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
                <span className="w-1.5 h-1.5 rounded-sm bg-zinc-600" />
                <span className="font-mono text-xs font-semibold tracking-wider uppercase text-zinc-300">{source}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <Link to="/" className="font-body text-sm text-white/50 hover:text-white transition-colors no-underline">&larr; All Sectors</Link>
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}
