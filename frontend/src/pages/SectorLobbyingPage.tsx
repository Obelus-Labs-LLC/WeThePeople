import React, { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Scale, Building2, TrendingUp } from 'lucide-react';
import {
  PoliticsSectorHeader,
  FinanceSectorHeader,
  HealthSectorHeader,
  TechSectorHeader,
  EnergySectorHeader,
} from '../components/SectorHeader';
import { getApiBaseUrl } from '../api/client';
import { fmtDollar, fmtNum } from '../utils/format';

const API_BASE = getApiBaseUrl();

// ── Sector config ──

interface SectorConfig {
  key: string;
  label: string;
  accent: string;
  accentRGB: string;
  Header: React.FC;
  companiesEndpoint: string;
  entityKey: string;        // 'companies' or 'institutions'
  entityIdField: string;    // 'company_id' or 'institution_id'
  entityNameField: string;  // 'display_name'
  lobbyingPath: (id: string) => string;
  profilePath: (id: string) => string;
}

const SECTOR_MAP: Record<string, SectorConfig> = {
  finance: {
    key: 'finance', label: 'Finance', accent: '#10B981', accentRGB: '16,185,129',
    Header: FinanceSectorHeader,
    companiesEndpoint: `${API_BASE}/finance/institutions?limit=200`,
    entityKey: 'institutions', entityIdField: 'institution_id', entityNameField: 'display_name',
    lobbyingPath: (id) => `${API_BASE}/finance/institutions/${id}/lobbying?limit=100`,
    profilePath: (id) => `/finance/${id}`,
  },
  health: {
    key: 'health', label: 'Health', accent: '#F43F5E', accentRGB: '244,63,94',
    Header: HealthSectorHeader,
    companiesEndpoint: `${API_BASE}/health/companies?limit=200`,
    entityKey: 'companies', entityIdField: 'company_id', entityNameField: 'display_name',
    lobbyingPath: (id) => `${API_BASE}/health/companies/${id}/lobbying?limit=100`,
    profilePath: (id) => `/health/${id}`,
  },
  technology: {
    key: 'technology', label: 'Technology', accent: '#8B5CF6', accentRGB: '139,92,246',
    Header: TechSectorHeader,
    companiesEndpoint: `${API_BASE}/tech/companies?limit=200`,
    entityKey: 'companies', entityIdField: 'company_id', entityNameField: 'display_name',
    lobbyingPath: (id) => `${API_BASE}/tech/companies/${id}/lobbying?limit=100`,
    profilePath: (id) => `/technology/${id}`,
  },
  energy: {
    key: 'energy', label: 'Energy', accent: '#F97316', accentRGB: '249,115,22',
    Header: EnergySectorHeader,
    companiesEndpoint: `${API_BASE}/energy/companies?limit=200`,
    entityKey: 'companies', entityIdField: 'company_id', entityNameField: 'display_name',
    lobbyingPath: (id) => `${API_BASE}/energy/companies/${id}/lobbying?limit=100`,
    profilePath: (id) => `/energy/${id}`,
  },
  politics: {
    key: 'politics', label: 'Politics', accent: '#3B82F6', accentRGB: '59,130,246',
    Header: PoliticsSectorHeader,
    companiesEndpoint: '', // politics doesn't have a companies list — handle gracefully
    entityKey: 'companies', entityIdField: 'company_id', entityNameField: 'display_name',
    lobbyingPath: () => '',
    profilePath: () => '/politics',
  },
};

// ── Types ──

interface LobbyingFiling {
  id: number;
  filing_uuid: string | null;
  filing_year: number | null;
  filing_period: string | null;
  income: number | null;
  expenses: number | null;
  registrant_name: string | null;
  client_name: string | null;
  lobbying_issues: string | null;
  government_entities: string | null;
  entity_id: string;
  entity_name: string;
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

const BAR_COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#A855F7',
];

// ── Helpers ──

function detectSector(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] || '';
  if (seg in SECTOR_MAP) return seg;
  return 'technology';
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── Page ──

export default function SectorLobbyingPage() {
  const location = useLocation();
  const sectorKey = detectSector(location.pathname);
  const config = SECTOR_MAP[sectorKey];

  const [allFilings, setAllFilings] = useState<LobbyingFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!config.companiesEndpoint) {
        // Politics sector doesn't have a standard companies list
        setLoading(false);
        return;
      }

      try {
        const compRes = await fetchJSON<any>(config.companiesEndpoint);
        const entities: any[] = compRes[config.entityKey] || [];
        if (cancelled) return;

        const results = await Promise.allSettled(
          entities.map((e) => {
            const entityId = e[config.entityIdField];
            const entityName = e[config.entityNameField];
            return fetchJSON<any>(config.lobbyingPath(entityId)).then((r) =>
              (r.filings || []).map((f: any) => ({
                ...f,
                entity_id: entityId,
                entity_name: entityName,
              })),
            );
          }),
        );

        if (cancelled) return;

        const combined: LobbyingFiling[] = [];
        for (const result of results) {
          if (result.status === 'fulfilled') {
            combined.push(...result.value);
          }
        }

        setAllFilings(combined);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load lobbying data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    setError(null);
    setAllFilings([]);
    setExpandedId(null);
    loadData();
    return () => { cancelled = true; };
  }, [sectorKey]);

  // Parse lobbying issues and build breakdown
  const issueBreakdown = useMemo(() => {
    const issueMap = new Map<string, IssueBreakdown>();

    for (const filing of allFilings) {
      if (!filing.lobbying_issues) continue;
      const income = filing.income || 0;

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
          const comp = existing.companies.get(filing.entity_id);
          if (comp) {
            comp.income += income;
          } else {
            existing.companies.set(filing.entity_id, { name: filing.entity_name, income });
          }
        } else {
          const companies = new Map<string, { name: string; income: number }>();
          companies.set(filing.entity_id, { name: filing.entity_name, income });
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
  const uniqueCompanies = new Set(allFilings.map((f) => f.entity_id)).size;

  const maxIncome = issueBreakdown.length > 0 ? issueBreakdown[0].totalIncome : 0;

  const SectorHeaderComp = config.Header;

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-400 mb-2">Failed to load lobbying data</p>
          <p className="text-sm text-white/50">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded px-4 py-2 text-sm text-white hover:opacity-80"
            style={{ backgroundColor: config.accent }}
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
          style={{ background: `radial-gradient(ellipse at 50% -20%, ${config.accent} 0%, transparent 60%)`, opacity: 0.08 }}
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
            <SectorHeaderComp />

            <div className="flex items-center gap-3 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ backgroundColor: config.accent }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: config.accent, boxShadow: `0 0 8px rgba(${config.accentRGB},0.5)` }} />
              </span>
              <span className="font-heading text-sm font-bold tracking-[0.2em] uppercase" style={{ color: config.accent }}>
                Lobbying Activity
              </span>
            </div>

            <h1 className="font-heading text-4xl font-bold tracking-tight text-zinc-50 leading-tight xl:text-5xl">
              {config.label} Lobbying Breakdown
            </h1>
            <p className="font-body text-base text-zinc-400 leading-relaxed max-w-2xl">
              Lobbying spending by issue area across all tracked {config.label.toLowerCase()} {config.entityKey === 'institutions' ? 'institutions' : 'companies'}.
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
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">{config.entityKey === 'institutions' ? 'Institutions' : 'Companies'}</span>
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
                  .map(([entityId, v]) => ({ entityId, ...v }))
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

                    {/* Company breakdown */}
                    {isExpanded ? (
                      <div className="flex flex-col gap-1 mt-2">
                        <span className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-white/30">
                          All {config.entityKey === 'institutions' ? 'Institutions' : 'Companies'}
                        </span>
                        {allCompanies.map((comp) => (
                          <div
                            key={comp.entityId}
                            className="flex items-center gap-1 px-1 py-0.5 rounded transition-colors hover:bg-white/[0.06] [&:hover_.comp-name]:text-white [&:hover_.comp-amount]:text-white"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link
                              to={config.profilePath(comp.entityId)}
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
                            key={comp.entityId}
                            to={config.profilePath(comp.entityId)}
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
