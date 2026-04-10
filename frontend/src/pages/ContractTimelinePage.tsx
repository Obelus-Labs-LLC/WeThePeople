import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Landmark, TrendingUp, Building2, Calendar, ExternalLink } from 'lucide-react';
import { TechSectorHeader } from '../components/SectorHeader';
import {
  getTechCompanies,
  getTechCompanyContracts,
  type TechCompanyListItem,
  type TechContractItem,
} from '../api/tech';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';
import SpendingChart from '../components/SpendingChart';

// ── Types ──

interface ContractWithCompany extends TechContractItem {
  company_id: string;
  company_name: string;
}

interface YearBucket {
  year: string;
  totalAmount: number;
  count: number;
}

interface CompanyContractStats {
  company_id: string;
  company_name: string;
  totalAmount: number;
  contractCount: number;
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

const BAR_COLORS = [
  '#EF4444', '#F59E0B', '#CDDC39', '#22D3EE', '#3B82F6',
  '#8B5CF6', '#EC4899', '#10B981', '#F97316', '#6366F1',
];

// ── Page ──

export default function ContractTimelinePage() {
  const [allContracts, setAllContracts] = useState<ContractWithCompany[]>([]);
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
            getTechCompanyContracts(c.company_id, { limit: 100 }).then((r) =>
              (r.contracts || []).map((ct) => ({
                ...ct,
                company_id: c.company_id,
                company_name: c.display_name,
              })),
            ),
          ),
        );

        if (cancelled) return;

        const combined: ContractWithCompany[] = [];
        for (const result of results) {
          if (result.status === 'fulfilled') {
            combined.push(...result.value);
          }
        }

        // Sort by start_date descending
        combined.sort((a, b) => {
          if (!a.start_date && !b.start_date) return 0;
          if (!a.start_date) return 1;
          if (!b.start_date) return -1;
          return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
        });

        setAllContracts(combined);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load contracts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  // Build year-based timeline
  const yearBuckets = useMemo(() => {
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

  // Top contractors table
  const topContractors = useMemo(() => {
    const statsMap = new Map<string, CompanyContractStats>();

    for (const c of allContracts) {
      const existing = statsMap.get(c.company_id);
      if (existing) {
        existing.totalAmount += c.award_amount || 0;
        existing.contractCount += 1;
      } else {
        statsMap.set(c.company_id, {
          company_id: c.company_id,
          company_name: c.company_name,
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
  const uniqueCompanies = new Set(allContracts.map((c) => c.company_id)).size;
  const maxBarAmount = yearBuckets.length > 0 ? Math.max(...yearBuckets.map((b) => b.totalAmount)) : 0;
  const maxContractorAmount = topContractors.length > 0 ? topContractors[0].totalAmount : 0;

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-400 mb-2">Failed to load contracts</p>
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
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
              </span>
              <span className="font-heading text-sm font-bold tracking-[0.2em] text-blue-400 uppercase">
                Government Contracts
              </span>
            </div>

            <h1 className="font-heading text-4xl font-bold tracking-tight text-zinc-50 leading-tight xl:text-5xl">
              Contract Timeline
            </h1>
            <p className="font-body text-base text-zinc-400 leading-relaxed max-w-2xl">
              Government contract awards over time across all tracked technology companies.
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
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">Total Value</span>
                  <TrendingUp size={18} className="text-zinc-500" />
                </div>
                <span className="font-mono text-3xl font-semibold text-zinc-100">{fmtDollar(totalValue)}</span>
              </motion.div>
              <motion.div
                variants={itemVariants}
                className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">Total Contracts</span>
                  <Landmark size={18} className="text-zinc-500" />
                </div>
                <span className="font-mono text-3xl font-semibold text-zinc-100">{fmtNum(totalContracts)}</span>
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

          {/* Year-based timeline chart */}
          {!loading && yearBuckets.length > 0 && (
            <motion.div variants={itemVariants}>
              <h2 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-50 mb-2">
                Spending Over Time
              </h2>
              <p className="font-body text-sm text-zinc-500 mb-6">
                Contract award values by fiscal year
              </p>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-6">
                <SpendingChart
                  data={yearBuckets.map((b) => ({ year: b.year, total_amount: b.totalAmount, count: b.count }))}
                  height={260}
                  countLabel="award"
                />
              </div>
            </motion.div>
          )}

          {/* Top contractors table */}
          {!loading && topContractors.length > 0 && (
            <motion.div variants={itemVariants}>
              <h2 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-50 mb-2">
                Top Contractors
              </h2>
              <p className="font-body text-sm text-zinc-500 mb-6">
                Companies ranked by total government contract value
              </p>

              <div className="flex flex-col gap-2">
                {topContractors.map((comp, idx) => {
                  const pct = maxContractorAmount > 0 ? (comp.totalAmount / maxContractorAmount) * 100 : 0;
                  const color = BAR_COLORS[idx % BAR_COLORS.length];
                  const isExpanded = expandedId === comp.company_id;
                  const companyContracts = isExpanded
                    ? allContracts.filter((c) => c.company_id === comp.company_id)
                    : [];

                  return (
                    <motion.div
                      key={comp.company_id}
                      variants={itemVariants}
                      onClick={() => setExpandedId(isExpanded ? null : comp.company_id)}
                      className="group rounded-xl border border-transparent bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06] hover:border-white/10 cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="font-mono text-xs text-white/30 w-6 text-right flex-shrink-0">
                            {idx + 1}
                          </span>
                          <Link
                            to={`/technology/${comp.company_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-body text-sm font-medium text-white hover:text-[#8B5CF6] no-underline truncate"
                          >
                            {comp.company_name}
                          </Link>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="font-mono text-xs text-white/40">{comp.contractCount} contracts</span>
                          <span className="font-mono text-sm font-bold text-[#10B981]">{fmtDollar(comp.totalAmount)}</span>
                        </div>
                      </div>

                      {/* Bar */}
                      <div className="h-4 bg-zinc-900 rounded-lg overflow-hidden ml-9">
                        <motion.div
                          className="h-full rounded-lg"
                          style={{ backgroundColor: color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(pct, 1)}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>

                      {/* Expanded contract details */}
                      {isExpanded && companyContracts.length > 0 && (
                        <div className="flex flex-col gap-2 mt-3 ml-9">
                          <span className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-white/30">Contract Details</span>
                          {companyContracts.map((ct) => (
                            <div key={ct.id} className="rounded-lg bg-white/[0.03] p-3">
                              {ct.description && (
                                <p className="font-body text-sm text-white/70 mb-1">{ct.description}</p>
                              )}
                              <div className="flex items-center gap-4 flex-wrap">
                                {ct.award_amount != null && (
                                  <span className="font-mono text-xs text-[#10B981]">{fmtDollar(ct.award_amount)}</span>
                                )}
                                {ct.awarding_agency && (
                                  <span className="font-mono text-xs text-white/40">{ct.awarding_agency}</span>
                                )}
                                {ct.start_date && (
                                  <span className="flex items-center gap-1 font-mono text-xs text-white/40">
                                    <Calendar size={12} />{fmtDate(ct.start_date)}{ct.end_date ? ` — ${fmtDate(ct.end_date)}` : ''}
                                  </span>
                                )}
                                {ct.contract_type && (
                                  <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/50">{ct.contract_type}</span>
                                )}
                                {ct.award_id && (
                                  <a
                                    href={`https://www.usaspending.gov/award/${ct.award_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 font-mono text-xs text-[#8B5CF6] hover:text-[#A78BFA] no-underline"
                                  >
                                    <ExternalLink size={11} />Source
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Loading state for charts */}
          {loading && (
            <div className="flex flex-col gap-6">
              <div className="h-72 rounded-xl bg-zinc-900 animate-pulse" />
              <div className="h-96 rounded-xl bg-zinc-900 animate-pulse" />
            </div>
          )}

          {/* Empty state */}
          {!loading && allContracts.length === 0 && (
            <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-20">
              <Landmark size={48} className="text-white/20 mb-4" />
              <p className="font-body text-xl text-white/40">No contract data available</p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
