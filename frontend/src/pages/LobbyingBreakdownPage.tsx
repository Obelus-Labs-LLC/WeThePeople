import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Scale, Building2, TrendingUp } from 'lucide-react';
import { TechSectorHeader } from '../components/SectorHeader';
import {
  getTechCompanies,
  getTechCompanyLobbying,
  type TechCompanyListItem,
  type TechLobbyingItem,
} from '../api/tech';
import { fmtDollar, fmtNum } from '../utils/format';

// ── Types ──

interface LobbyingWithCompany extends TechLobbyingItem {
  company_id: string;
  company_name: string;
}

interface IssueBreakdown {
  issue: string;
  totalIncome: number;
  filingCount: number;
  companies: Map<string, { name: string; income: number }>;
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

// ── Bar colors ──

const BAR_COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#A855F7',
];

// ── Page ──

export default function LobbyingBreakdownPage() {
  const [allFilings, setAllFilings] = useState<LobbyingWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const compRes = await getTechCompanies({ limit: 200 });
        const comps = compRes.companies || [];
        if (cancelled) return;

        const results = await Promise.allSettled(
          comps.map((c) =>
            getTechCompanyLobbying(c.company_id, { limit: 100 }).then((r) =>
              (r.filings || []).map((f) => ({
                ...f,
                company_id: c.company_id,
                company_name: c.display_name,
              })),
            ),
          ),
        );

        if (cancelled) return;

        const combined: LobbyingWithCompany[] = [];
        for (const result of results) {
          if (result.status === 'fulfilled') {
            combined.push(...result.value);
          }
        }

        setAllFilings(combined);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load lobbying data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  // Parse lobbying issues and build breakdown
  const issueBreakdown = useMemo(() => {
    const issueMap = new Map<string, IssueBreakdown>();

    for (const filing of allFilings) {
      if (!filing.lobbying_issues) continue;
      const income = filing.income || 0;

      // Split issues by comma/semicolon and normalize
      const issues = filing.lobbying_issues
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length < 100);

      for (const raw of issues) {
        const issue = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
        const existing = issueMap.get(issue);

        if (existing) {
          existing.totalIncome += income;
          existing.filingCount += 1;
          const comp = existing.companies.get(filing.company_id);
          if (comp) {
            comp.income += income;
          } else {
            existing.companies.set(filing.company_id, { name: filing.company_name, income });
          }
        } else {
          const companies = new Map<string, { name: string; income: number }>();
          companies.set(filing.company_id, { name: filing.company_name, income });
          issueMap.set(issue, {
            issue,
            totalIncome: income,
            filingCount: 1,
            companies,
          });
        }
      }
    }

    return Array.from(issueMap.values())
      .sort((a, b) => b.totalIncome - a.totalIncome)
      .slice(0, 25);
  }, [allFilings]);

  // Top-level stats
  const totalIncome = allFilings.reduce((sum, f) => sum + (f.income || 0), 0);
  const totalFilings = allFilings.length;
  const uniqueCompanies = new Set(allFilings.map((f) => f.company_id)).size;

  const maxIncome = issueBreakdown.length > 0 ? issueBreakdown[0].totalIncome : 0;

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-400 mb-2">Failed to load lobbying data</p>
          <p className="text-sm text-white/50">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-[#8B5CF6] px-4 py-2 text-sm text-white hover:bg-[#7C3AED]"
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
          animate="visible"
          className="flex flex-col gap-8"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="flex flex-col gap-3">
            <TechSectorHeader />

            <div className="flex items-center gap-3 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
              </span>
              <span className="font-heading text-sm font-bold tracking-[0.2em] text-violet-400 uppercase">
                Lobbying Activity
              </span>
            </div>

            <h1 className="font-heading text-4xl font-bold tracking-tight text-zinc-50 leading-tight xl:text-5xl">
              Lobbying Breakdown
            </h1>
            <p className="font-body text-base text-zinc-400 leading-relaxed max-w-2xl">
              Lobbying spending by issue area across all tracked technology companies.
            </p>
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
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">Total Lobbying Income</span>
                  <TrendingUp size={18} className="text-zinc-500" />
                </div>
                <span className="font-mono text-3xl font-semibold text-zinc-100">{fmtDollar(totalIncome)}</span>
              </motion.div>
              <motion.div
                variants={itemVariants}
                className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">Total Filings</span>
                  <Scale size={18} className="text-zinc-500" />
                </div>
                <span className="font-mono text-3xl font-semibold text-zinc-100">{fmtNum(totalFilings)}</span>
              </motion.div>
              <motion.div
                variants={itemVariants}
                className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">Companies</span>
                  <Building2 size={18} className="text-zinc-500" />
                </div>
                <span className="font-mono text-3xl font-semibold text-zinc-100">{uniqueCompanies}</span>
              </motion.div>
            </motion.div>
          )}

          {/* Issue breakdown - horizontal bar chart */}
          {loading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : issueBreakdown.length === 0 ? (
            <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-20">
              <Scale size={48} className="text-white/20 mb-4" />
              <p className="font-body text-xl text-white/40">No lobbying issue data available</p>
            </motion.div>
          ) : (
            <motion.div variants={containerVariants} className="flex flex-col gap-2">
              <motion.div variants={itemVariants} className="mb-2">
                <h2 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-50">
                  Spending by Issue Area
                </h2>
                <p className="mt-1 font-body text-sm text-zinc-500">
                  Top 25 lobbying issue categories ranked by total reported income
                </p>
              </motion.div>

              {issueBreakdown.map((item, idx) => {
                const pct = maxIncome > 0 ? (item.totalIncome / maxIncome) * 100 : 0;
                const color = BAR_COLORS[idx % BAR_COLORS.length];
                const allCompanies = Array.from(item.companies.entries())
                  .map(([companyId, v]) => ({ companyId, ...v }))
                  .sort((a, b) => b.income - a.income);
                const topCompanies = allCompanies.slice(0, 3);
                const isExpanded = expandedId === item.issue;

                return (
                  <motion.div
                    key={item.issue}
                    variants={itemVariants}
                    onClick={() => setExpandedId(isExpanded ? null : item.issue)}
                    className="group rounded-xl border border-transparent bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06] hover:border-white/10 cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="w-3 h-3 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className={`font-body text-sm font-medium text-white ${isExpanded ? '' : 'truncate'}`}>
                          {item.issue}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className="font-mono text-xs text-white/40">{item.filingCount} filings</span>
                        <span className="font-mono text-sm font-bold text-white">{fmtDollar(item.totalIncome)}</span>
                      </div>
                    </div>

                    {/* Bar */}
                    <div className="h-6 bg-zinc-900 rounded-lg overflow-hidden mb-2">
                      <motion.div
                        className="h-full rounded-lg"
                        style={{ backgroundColor: color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(pct, 2)}%` }}
                        transition={{ duration: 0.8, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>

                    {/* Company breakdown (shown on hover via group, or all when expanded) */}
                    {isExpanded ? (
                      <div className="flex flex-col gap-1 mt-2">
                        <span className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-white/30">All Companies</span>
                        {allCompanies.map((comp) => (
                          <div
                            key={comp.companyId}
                            className="flex items-center gap-1 px-1 py-0.5 rounded transition-colors hover:bg-white/[0.06] [&:hover_.comp-name]:text-white [&:hover_.comp-amount]:text-white"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link
                              to={`/technology/${comp.companyId}`}
                              className="comp-name font-mono text-[11px] text-white/60 hover:underline flex-shrink-0 transition-colors"
                            >
                              {comp.name}
                            </Link>
                            <div className="flex-1 border-b border-dotted border-white/15 mx-1 translate-y-[-2px]" />
                            <span className="comp-amount font-mono text-[11px] text-white/50 flex-shrink-0 transition-colors">
                              {fmtDollar(comp.income)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 opacity-60 group-hover:opacity-100 transition-opacity">
                        {topCompanies.map((comp) => (
                          <Link
                            key={comp.companyId}
                            to={`/technology/${comp.companyId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-[11px] text-white/50 hover:text-white hover:underline transition-colors"
                          >
                            {comp.name}: {fmtDollar(comp.income)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
