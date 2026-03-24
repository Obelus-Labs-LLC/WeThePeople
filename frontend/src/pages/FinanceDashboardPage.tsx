import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DollarSign, FileText, Shield, TrendingUp, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import SpotlightCard from '../components/SpotlightCard';
import CompanyLogo from '../components/CompanyLogo';
import DataFreshness from '../components/DataFreshness';
import { FinanceSectorHeader } from '../components/SectorHeader';
import { LOCAL_LOGOS } from '../data/financeLogos';
import {
  getFinanceDashboardStats,
  getInstitutions,
  getAllInsiderTrades,
  type FinanceDashboardStats,
  type InstitutionListItem,
  type InsiderTradeItem,
} from '../api/finance';

function formatMoney(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Sector colors ──

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

// ── Sector Distribution ──

function SectorDistribution({
  bySector,
  totalInstitutions,
}: {
  bySector: Record<string, number>;
  totalInstitutions: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  const sectors = Object.entries(bySector)
    .map(([key, count]) => ({
      key,
      count,
      percentage: totalInstitutions > 0 ? (count / totalInstitutions) * 100 : 0,
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
        <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white mb-1">
          Sector Distribution
        </h2>
        <p className="font-body text-xs text-white/30">
          Breakdown of tracked institutions by financial segment
        </p>
      </motion.div>

      {/* Stacked Bar */}
      <motion.div
        variants={itemVariants}
        className="h-10 bg-white/[0.02] border border-white/10 rounded-xl p-1.5 flex gap-1"
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
            <span className="absolute bottom-0.5 left-2 font-mono text-[10px] font-bold text-white drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {sector.percentage.toFixed(0)}%
            </span>
          </motion.div>
        ))}
      </motion.div>

      {/* Legend cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
        {sectors.map((sector) => (
          <Link
            key={sector.key}
            to={`/finance/institutions?sector=${encodeURIComponent(sector.key)}`}
            className="no-underline"
          >
            <motion.div
              variants={itemVariants}
              className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2 transition-all hover:bg-white/[0.05] hover:border-white/20 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: getSectorColor(sector.key) }}
                />
                <span className="font-heading text-[10px] font-bold tracking-wider uppercase text-white/40 group-hover:text-white/60 transition-colors">
                  {getSectorLabel(sector.key)}
                </span>
              </div>
              <div className="flex items-end gap-2">
                <span className="font-mono text-2xl font-bold text-white">
                  {sector.count}
                </span>
                <span className="font-mono text-xs text-white/30 mb-0.5">
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

// ── Extended stats type (includes by_sector from API) ──

interface FinanceDashboardStatsExtended extends FinanceDashboardStats {
  by_sector?: Record<string, number>;
}

// ── Page ──

export default function FinanceDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<FinanceDashboardStatsExtended | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionListItem[]>([]);
  const [trades, setTrades] = useState<InsiderTradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTrade, setExpandedTrade] = useState<number | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  useInView(headerRef, { once: true, amount: 0.1 });

  useEffect(() => {
    Promise.all([
      getFinanceDashboardStats(),
      getInstitutions({ limit: 6 }),
      getAllInsiderTrades({ limit: 8 }),
    ])
      .then(([statsRes, instRes, tradesRes]) => {
        setStats(statsRes as FinanceDashboardStatsExtended);
        setInstitutions(instRes.institutions || []);
        setTrades(tradesRes.trades || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const statCards = [
    { label: 'Lobbying Spend', value: formatMoney(stats?.total_lobbying_spend || 0), icon: DollarSign, color: '#60A5FA', to: '/finance/lobbying' },
    { label: 'Gov Contracts', value: formatMoney(stats?.total_contract_value || 0), icon: FileText, color: '#34D399', to: '/finance/contracts' },
    { label: 'Enforcement Actions', value: formatNum(stats?.total_enforcement || 0), icon: Shield, color: '#FF3366', to: '/finance/enforcement' },
    { label: 'Insider Trade Alerts', value: formatNum(stats?.total_insider_trades || 0), icon: TrendingUp, color: '#FBBF24', to: '/finance/institutions' },
  ];

  return (
    <div className="min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        {/* Navigation bar */}
        <motion.nav
          ref={headerRef}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <FinanceSectorHeader />
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
            <p className="font-heading text-xs font-semibold tracking-[0.3em] text-emerald-400 uppercase mb-4">
              Financial Transparency
            </p>
            <h1 className="font-heading text-3xl sm:text-5xl font-bold leading-[1.1] tracking-tight text-white lg:text-6xl">
              Following Wall Street's
              <br />
              Influence in{' '}
              <span className="text-emerald-400">Washington</span>
            </h1>
            <p className="mt-4 max-w-lg font-body text-lg text-white/50 leading-relaxed">
              Lobbying expenditures, government contracts, enforcement actions, and insider trading alerts across the nation's largest financial institutions.
            </p>
            <div className="mt-8 flex gap-3">
              <Link
                to="/finance/institutions"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-emerald-600 no-underline"
              >
                Browse Institutions
                <ArrowRight size={16} />
              </Link>
              <a
                href="https://research.wethepeopleforus.com/insider-trades"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2.5 font-body text-sm font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white no-underline"
              >
                Insider Trades <span className="text-[10px] text-white/30">Research</span>
              </a>
            </div>
          </motion.div>

          {/* Right: 2x2 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        {/* Data Freshness */}
        <DataFreshness />

        {/* Sector Distribution Bar */}
        {stats?.by_sector && Object.keys(stats.by_sector).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="mb-12"
          >
            <SpotlightCard
              className="rounded-xl border border-white/10 bg-white/[0.03]"
              spotlightColor="rgba(52, 211, 153, 0.10)"
            >
              <div className="p-6">
                <SectorDistribution bySector={stats.by_sector} totalInstitutions={stats.total_institutions} />
              </div>
            </SpotlightCard>
          </motion.div>
        )}

        {/* Navigation Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-12"
        >
          {[
            { to: '/finance/institutions', label: 'Institutions', desc: 'Full institution directory', color: '#34D399' },
            { to: 'https://research.wethepeopleforus.com/insider-trades', label: 'Insider Trades', desc: 'Corporate insider trading (WTP Research)', color: '#FBBF24', external: true },
            { to: 'https://research.wethepeopleforus.com/news', label: 'News & Regulatory', desc: 'Latest sector developments (WTP Research)', color: '#60A5FA', external: true },
            { to: '/finance/compare', label: 'Compare', desc: 'Side-by-side institution analysis', color: '#C084FC' },
          ].map((link) => (
            'external' in link && link.external ? (
              <a
                key={link.to}
                href={link.to}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-white/20 no-underline"
              >
                <p className="font-heading text-sm font-bold uppercase tracking-wider" style={{ color: link.color }}>
                  {link.label} <span className="text-[9px] text-white/30 normal-case tracking-normal">&#8599;</span>
                </p>
                <p className="font-body text-xs text-white/30 mt-1">{link.desc}</p>
              </a>
            ) : (
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
            )
          ))}
        </motion.div>

        {/* Two columns: Featured Institutions + Recent Activity */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Featured Institutions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white">
                Featured Institutions
              </h2>
              <Link
                to="/finance/institutions"
                className="font-body text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors no-underline"
              >
                View all &rarr;
              </Link>
            </div>
            <div className="space-y-3">
              {institutions.map((inst, idx) => {
                const color = SECTOR_COLORS[inst.sector_type] || '#34D399';
                return (
                  <motion.div
                    key={inst.institution_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.85 + idx * 0.06 }}
                  >
                    <Link
                      to={`/finance/${inst.institution_id}`}
                      className="block no-underline"
                    >
                      <SpotlightCard
                        className="rounded-xl border border-white/10 bg-white/[0.03]"
                        spotlightColor="rgba(52, 211, 153, 0.10)"
                      >
                        <div className="flex items-center gap-4 p-4">
                          <CompanyLogo
                            id={inst.institution_id}
                            name={inst.display_name}
                            logoUrl={inst.logo_url}
                            localLogos={LOCAL_LOGOS}
                            size={44}
                            fallbackBg={color + '33'}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-body text-sm font-semibold text-white truncate">
                              {inst.display_name}
                            </p>
                            {inst.ticker && (
                              <p className="font-mono text-[11px] text-white/30">{inst.ticker}</p>
                            )}
                          </div>
                          <span
                            className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                            style={{
                              backgroundColor: color + '22',
                              color,
                            }}
                          >
                            {SECTOR_LABELS[inst.sector_type] || inst.sector_type.toUpperCase()}
                          </span>
                        </div>
                      </SpotlightCard>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Recent Activity (Insider Trades) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white">
                Recent Activity
              </h2>
              <a
                href="https://research.wethepeopleforus.com/insider-trades"
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors no-underline"
              >
                Full feed &#8599;
              </a>
            </div>
            <SpotlightCard
              className="rounded-xl border border-white/10 bg-white/[0.03]"
              spotlightColor="rgba(251, 191, 36, 0.10)"
            >
              <div className="divide-y divide-white/5">
                {trades.map((trade) => {
                  const isExpanded = expandedTrade === trade.id;
                  const txType = trade.transaction_type?.toLowerCase();
                  const isSale = txType?.includes('sale') || txType?.includes('sell');

                  return (
                    <button
                      key={trade.id}
                      onClick={() => setExpandedTrade(isExpanded ? null : trade.id)}
                      className="w-full p-4 text-left cursor-pointer transition-colors hover:bg-white/[0.02]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={`font-body text-sm font-medium text-white/90 ${isExpanded ? '' : 'truncate'}`}>
                            {trade.filer_name}{trade.filer_title ? ` (${trade.filer_title})` : ''}
                          </p>
                          <p className={`mt-1 font-body text-xs text-white/40 leading-relaxed ${isExpanded ? '' : 'line-clamp-1'}`}>
                            {trade.transaction_type || 'Trade'} &mdash; {trade.shares?.toLocaleString() || '?'} shares
                            {trade.ticker ? ` of ${trade.ticker}` : ''}
                            {trade.total_value ? ` ($${formatNum(trade.total_value)})` : ''}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] text-white/20">
                              {trade.company_name}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                                isSale
                                  ? 'bg-red-500/10 text-red-400'
                                  : 'bg-emerald-500/10 text-emerald-400'
                              }`}
                            >
                              {isSale ? 'SELL' : 'BUY'}
                            </span>
                            {isExpanded && trade.filing_url && (
                              <a
                                href={trade.filing_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/40 hover:text-white/60 transition-colors no-underline"
                              >
                                SEC Filing &rarr;
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {trade.transaction_date && (
                            <span className="font-mono text-[10px] text-white/20 tabular-nums">
                              {new Date(trade.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronUp size={12} className="text-white/20" />
                          ) : (
                            <ChevronDown size={12} className="text-white/20" />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {trades.length === 0 && (
                  <div className="p-6 text-center">
                    <p className="font-body text-sm text-white/30">No recent insider trades</p>
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
            {['SEC EDGAR (10-K, 10-Q, 8-K Filings)', 'Senate LDA (Lobbying Disclosures)', 'USASpending.gov (Gov Contracts)', 'FEC (PAC Donations)', 'Federal Register (Enforcement Actions)', 'FDIC BankFind (Bank Financials)', 'Alpha Vantage (Stock Data)', 'FRED (Economic Indicators)', 'SAM.gov (Contractor Data)', 'Regulations.gov (Regulatory Comments)', 'IT Dashboard (IT Investments)'].map((source) => (
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
