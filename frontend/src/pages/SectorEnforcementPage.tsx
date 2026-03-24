import React, { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Shield, Building2, Calendar, ExternalLink, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import CSVExport from '../components/CSVExport';
import {
  PoliticsSectorHeader,
  FinanceSectorHeader,
  HealthSectorHeader,
  TechSectorHeader,
  EnergySectorHeader,
  TransportationSectorHeader,
  DefenseSectorHeader,
} from '../components/SectorHeader';
import { getApiBaseUrl } from '../api/client';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';

const API_BASE = getApiBaseUrl();

// ── Sector config ──

interface SectorConfig {
  key: string;
  label: string;
  accent: string;
  accentRGB: string;
  Header: React.FC;
  aggregateEndpoint: string;
  entityKey: string;
  profilePath: (id: string) => string;
}

const SECTOR_MAP: Record<string, SectorConfig> = {
  finance: {
    key: 'finance', label: 'Finance', accent: '#10B981', accentRGB: '16,185,129',
    Header: FinanceSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/finance/enforcement?limit=1000`,
    entityKey: 'institutions',
    profilePath: (id) => `/finance/${id}`,
  },
  health: {
    key: 'health', label: 'Health', accent: '#F43F5E', accentRGB: '244,63,94',
    Header: HealthSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/health/enforcement?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/health/${id}`,
  },
  technology: {
    key: 'technology', label: 'Technology', accent: '#8B5CF6', accentRGB: '139,92,246',
    Header: TechSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/tech/enforcement?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/technology/${id}`,
  },
  energy: {
    key: 'energy', label: 'Energy', accent: '#F97316', accentRGB: '249,115,22',
    Header: EnergySectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/energy/enforcement?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/energy/${id}`,
  },
  politics: {
    key: 'politics', label: 'Politics', accent: '#3B82F6', accentRGB: '59,130,246',
    Header: PoliticsSectorHeader,
    aggregateEndpoint: '',
    entityKey: 'companies',
    profilePath: () => '/politics',
  },
  transportation: {
    key: 'transportation', label: 'Transportation', accent: '#06B6D4', accentRGB: '6,182,212',
    Header: TransportationSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/transportation/enforcement?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/transportation/${id}`,
  },
  defense: {
    key: 'defense', label: 'Defense', accent: '#DC2626', accentRGB: '220,38,38',
    Header: DefenseSectorHeader,
    aggregateEndpoint: `${API_BASE}/aggregate/defense/enforcement?limit=1000`,
    entityKey: 'companies',
    profilePath: (id) => `/defense/${id}`,
  },
};

// ── Types ──

interface EnforcementAction {
  id: number;
  case_title: string | null;
  case_date: string | null;
  case_url: string | null;
  enforcement_type: string | null;
  penalty_amount: number | null;
  description: string | null;
  source: string | null;
  entity_id: string;
  entity_name: string;
}

interface CompanyEnforcementStats {
  entity_id: string;
  entity_name: string;
  totalPenalties: number;
  actionCount: number;
}

// ── Animation variants ──

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 120, damping: 22 },
  },
};

// ── Severity helpers ──

function getSeverity(penalty: number | null): 'high' | 'medium' | 'low' {
  if (penalty == null || penalty === 0) return 'low';
  if (penalty >= 1_000_000_000) return 'high';
  if (penalty >= 100_000_000) return 'medium';
  return 'low';
}

function getSeverityColor(severity: 'high' | 'medium' | 'low'): string {
  switch (severity) {
    case 'high': return '#EF4444';
    case 'medium': return '#F59E0B';
    case 'low': return '#22C55E';
  }
}

function getSeverityLabel(severity: 'high' | 'medium' | 'low'): string {
  switch (severity) {
    case 'high': return 'SEVERE';
    case 'medium': return 'MODERATE';
    case 'low': return 'MINOR';
  }
}

function getSeverityBg(severity: 'high' | 'medium' | 'low'): string {
  switch (severity) {
    case 'high': return 'bg-red-500/10 border-red-500/20';
    case 'medium': return 'bg-amber-500/10 border-amber-500/20';
    case 'low': return 'bg-green-500/10 border-green-500/20';
  }
}

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

export default function SectorEnforcementPage() {
  const location = useLocation();
  const sectorKey = detectSector(location.pathname);
  const config = SECTOR_MAP[sectorKey];

  const [allActions, setAllActions] = useState<EnforcementAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [expandedId, setExpandedId] = useState<number | string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!config.aggregateEndpoint) {
        setLoading(false);
        return;
      }

      try {
        const data = await fetchJSON<any>(config.aggregateEndpoint);
        if (cancelled) return;

        const actions: EnforcementAction[] = (data.actions || []);
        actions.sort((a, b) => (b.penalty_amount || 0) - (a.penalty_amount || 0));
        setAllActions(actions);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load enforcement data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    setError(null);
    setAllActions([]);
    setSeverityFilter('all');
    setExpandedId(null);
    loadData();
    return () => { cancelled = true; };
  }, [sectorKey]);

  // Filtered actions
  const filtered = useMemo(() => {
    if (severityFilter === 'all') return allActions;
    return allActions.filter((a) => getSeverity(a.penalty_amount) === severityFilter);
  }, [allActions, severityFilter]);

  // Company breakdown
  const companyStats = useMemo(() => {
    const statsMap = new Map<string, CompanyEnforcementStats>();

    for (const a of allActions) {
      const existing = statsMap.get(a.entity_id);
      if (existing) {
        existing.totalPenalties += a.penalty_amount || 0;
        existing.actionCount += 1;
      } else {
        statsMap.set(a.entity_id, {
          entity_id: a.entity_id,
          entity_name: a.entity_name,
          totalPenalties: a.penalty_amount || 0,
          actionCount: 1,
        });
      }
    }

    return Array.from(statsMap.values())
      .sort((a, b) => b.totalPenalties - a.totalPenalties);
  }, [allActions]);

  // Severity counts
  const severityCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const a of allActions) {
      counts[getSeverity(a.penalty_amount)] += 1;
    }
    return counts;
  }, [allActions]);

  // Top-level stats
  const totalPenalties = allActions.reduce((sum, a) => sum + (a.penalty_amount || 0), 0);
  const totalActionsCount = allActions.length;
  const uniqueCompanies = new Set(allActions.map((a) => a.entity_id)).size;
  const maxCompanyPenalty = companyStats.length > 0 ? companyStats[0].totalPenalties : 0;

  const SectorHeaderComp = config.Header;

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-400 mb-2">Failed to load enforcement data</p>
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
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              </span>
              <span className="font-heading text-sm font-bold tracking-[0.2em] text-red-400 uppercase">
                Enforcement Actions
              </span>
            </div>

            <h1 className="font-heading text-4xl font-bold tracking-tight text-zinc-50 leading-tight xl:text-5xl">
              {config.label} Enforcement Tracker
            </h1>
            <div className="flex items-center gap-4">
              <p className="font-body text-base text-zinc-400 leading-relaxed max-w-2xl">
                Regulatory enforcement actions and penalties across all tracked {config.label.toLowerCase()} {config.entityKey === 'institutions' ? 'institutions' : 'companies'}, color-coded by severity.
              </p>
              <CSVExport
                data={filtered}
                filename={`${config.key}-enforcement`}
                columns={[
                  { key: 'entity_name', label: 'Company' },
                  { key: 'case_title', label: 'Case Title' },
                  { key: 'case_date', label: 'Date' },
                  { key: 'enforcement_type', label: 'Type' },
                  { key: 'penalty_amount', label: 'Penalty Amount' },
                  { key: 'description', label: 'Description' },
                  { key: 'source', label: 'Source' },
                ]}
              />
            </div>
          </motion.div>

          {/* Stat cards */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : (
            <motion.div variants={containerVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <motion.div
                variants={itemVariants}
                className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">Total Penalties</span>
                  <TrendingUp size={18} className="text-zinc-500" />
                </div>
                <span className="font-mono text-3xl font-semibold text-zinc-100">{fmtDollar(totalPenalties)}</span>
              </motion.div>
              <motion.div
                variants={itemVariants}
                className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">Actions</span>
                  <AlertTriangle size={18} className="text-zinc-500" />
                </div>
                <span className="font-mono text-3xl font-semibold text-zinc-100">{fmtNum(totalActionsCount)}</span>
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
              <motion.div
                variants={itemVariants}
                className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold tracking-[0.15em] uppercase text-zinc-500">Severe Actions</span>
                  <Shield size={18} className="text-zinc-500" />
                </div>
                <span className="font-mono text-3xl font-semibold text-red-400">{severityCounts.high}</span>
              </motion.div>
            </motion.div>
          )}

          {/* Company breakdown */}
          {!loading && companyStats.length > 0 && (
            <motion.div variants={itemVariants}>
              <h2 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-50 mb-2">
                Penalties by {config.entityKey === 'institutions' ? 'Institution' : 'Company'}
              </h2>
              <p className="font-body text-sm text-zinc-500 mb-6">
                {config.entityKey === 'institutions' ? 'Institutions' : 'Companies'} ranked by total penalty amounts
              </p>

              <div className="flex flex-col gap-2">
                {companyStats.slice(0, 10).map((comp, idx) => {
                  const pct = maxCompanyPenalty > 0 ? (comp.totalPenalties / maxCompanyPenalty) * 100 : 0;
                  const severity = getSeverity(comp.totalPenalties);
                  const color = getSeverityColor(severity);
                  const isCompanyExpanded = expandedId === `company-${comp.entity_id}`;
                  const companyActions = isCompanyExpanded
                    ? allActions.filter((a) => a.entity_id === comp.entity_id).sort((a, b) => (b.penalty_amount || 0) - (a.penalty_amount || 0))
                    : [];

                  return (
                    <motion.div
                      key={comp.entity_id}
                      variants={itemVariants}
                      onClick={() => setExpandedId(isCompanyExpanded ? null : `company-${comp.entity_id}`)}
                      className="group rounded-xl border border-transparent bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06] hover:border-white/10 cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="font-mono text-xs text-white/30 w-6 text-right flex-shrink-0">{idx + 1}</span>
                          <Link
                            to={config.profilePath(comp.entity_id)}
                            onClick={(e) => e.stopPropagation()}
                            className="font-body text-sm font-medium text-white no-underline truncate"
                            onMouseEnter={(e) => (e.currentTarget.style.color = config.accent)}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'white')}
                          >
                            {comp.entity_name}
                          </Link>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="font-mono text-xs text-white/40">{comp.actionCount} actions</span>
                          <span className="font-mono text-sm font-bold" style={{ color }}>{fmtDollar(comp.totalPenalties)}</span>
                          {isCompanyExpanded ? (
                            <ChevronUp size={16} className="text-white/30" />
                          ) : (
                            <ChevronDown size={16} className="text-white/30" />
                          )}
                        </div>
                      </div>
                      <div className="h-3 bg-zinc-900 rounded-lg overflow-hidden ml-9">
                        <motion.div
                          className="h-full rounded-lg"
                          style={{ backgroundColor: color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(pct, 1)}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>

                      {/* Expanded enforcement actions for this company */}
                      <AnimatePresence>
                        {isCompanyExpanded && companyActions.length > 0 && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                          >
                            <div className="flex flex-col gap-2 mt-3 ml-9 pt-3 border-t border-white/10">
                              <span className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-white/30">
                                Enforcement Actions ({companyActions.length})
                              </span>
                              {companyActions.map((action) => {
                                const actionSeverity = getSeverity(action.penalty_amount);
                                const actionColor = getSeverityColor(actionSeverity);
                                return (
                                  <div key={action.id} className={`rounded-lg border p-3 ${getSeverityBg(actionSeverity)}`}>
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span
                                            className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase"
                                            style={{ backgroundColor: `${actionColor}20`, color: actionColor }}
                                          >
                                            {getSeverityLabel(actionSeverity)}
                                          </span>
                                          {action.enforcement_type && (
                                            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/50">
                                              {action.enforcement_type}
                                            </span>
                                          )}
                                        </div>
                                        <p className="font-body text-sm text-white/80 mb-1">
                                          {action.case_title || 'Enforcement Action'}
                                        </p>
                                        {action.description && (
                                          <p className="font-body text-xs text-white/50 mb-1 line-clamp-2">{action.description}</p>
                                        )}
                                        {(action as any).ai_summary && (
                                          <p className="text-zinc-400 text-sm italic mb-1">{(action as any).ai_summary}</p>
                                        )}
                                        <div className="flex items-center gap-3 flex-wrap">
                                          {action.penalty_amount != null && action.penalty_amount > 0 && (
                                            <span className="font-mono text-xs font-bold" style={{ color: actionColor }}>
                                              {fmtDollar(action.penalty_amount)}
                                            </span>
                                          )}
                                          {action.case_date && (
                                            <span className="flex items-center gap-1 font-mono text-[11px] text-white/40">
                                              <Calendar size={11} />{fmtDate(action.case_date)}
                                            </span>
                                          )}
                                          {action.source && (
                                            <span className="font-mono text-[11px] text-white/30">{action.source}</span>
                                          )}
                                          {action.case_url && (
                                            <a
                                              href={action.case_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="flex items-center gap-1 font-mono text-[11px] no-underline"
                                              style={{ color: config.accent }}
                                            >
                                              <ExternalLink size={11} />Source
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Severity filter pills */}
          {!loading && allActions.length > 0 && (
            <motion.div variants={itemVariants}>
              <h2 className="font-heading text-2xl font-bold tracking-tight uppercase text-zinc-50 mb-4">
                All Enforcement Actions
              </h2>

              <div className="flex gap-3 mb-6">
                {(['all', 'high', 'medium', 'low'] as const).map((level) => {
                  const active = severityFilter === level;
                  const count = level === 'all' ? totalActionsCount : severityCounts[level];
                  const color = level === 'all' ? '#FFFFFF' : getSeverityColor(level);

                  return (
                    <button
                      key={level}
                      onClick={() => setSeverityFilter(level)}
                      className="flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 font-body text-sm font-medium transition-all duration-200"
                      style={{
                        borderColor: active ? color : 'rgba(255,255,255,0.1)',
                        backgroundColor: active ? `${color}15` : 'transparent',
                        color: active ? color : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {level === 'all' ? 'All' : getSeverityLabel(level)}
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
                })}
              </div>

              {/* Action list */}
              <div className="flex flex-col gap-3">
                {filtered.map((action) => {
                  const severity = getSeverity(action.penalty_amount);
                  const severityColor = getSeverityColor(severity);
                  const cardKey = `${action.entity_id}-${action.id}`;
                  const isExpanded = expandedId === cardKey;

                  return (
                    <motion.div
                      key={cardKey}
                      variants={itemVariants}
                      onClick={() => setExpandedId(isExpanded ? null : cardKey)}
                      className={`group rounded-xl border p-5 transition-all hover:bg-white/[0.06] cursor-pointer ${getSeverityBg(severity)}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <span
                              className="rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                              style={{
                                backgroundColor: `${severityColor}20`,
                                color: severityColor,
                              }}
                            >
                              {getSeverityLabel(severity)}
                            </span>
                            <Link
                              to={config.profilePath(action.entity_id)}
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono text-xs no-underline"
                              style={{ color: config.accent }}
                            >
                              {action.entity_name}
                            </Link>
                          </div>

                          <div className="flex items-center gap-2">
                            <p className="font-body text-base font-medium text-white mb-1 flex-1">
                              {action.case_title || 'Enforcement Action'}
                            </p>
                            {isExpanded ? (
                              <ChevronUp size={16} className="text-white/30 flex-shrink-0" />
                            ) : (
                              <ChevronDown size={16} className="text-white/30 flex-shrink-0" />
                            )}
                          </div>

                          <div className="flex items-center gap-4 flex-wrap">
                            {action.penalty_amount != null && action.penalty_amount > 0 && (
                              <span className="font-mono text-sm font-bold" style={{ color: severityColor }}>
                                {fmtDollar(action.penalty_amount)}
                              </span>
                            )}
                            {action.enforcement_type && (
                              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/50">
                                {action.enforcement_type}
                              </span>
                            )}
                            {action.case_date && (
                              <span className="flex items-center gap-1 font-mono text-xs text-white/40">
                                <Calendar size={12} />{fmtDate(action.case_date)}
                              </span>
                            )}
                            {action.source && (
                              <span className="font-mono text-xs text-white/30">{action.source}</span>
                            )}
                          </div>

                          {/* Expandable details */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-3 pt-3 border-t border-white/10">
                                  {action.description && (
                                    <p className="font-body text-sm text-white/60 mb-3">{action.description}</p>
                                  )}
                                  {(action as any).ai_summary && (
                                    <div className="mb-3">
                                      <span className="text-zinc-500 text-xs uppercase tracking-wider">AI Analysis</span>
                                      <p className="text-zinc-400 text-sm italic mt-1">{(action as any).ai_summary}</p>
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-4">
                                    {action.penalty_amount != null && action.penalty_amount > 0 && (
                                      <div className="flex flex-col">
                                        <span className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-white/30">Penalty Amount</span>
                                        <span className="font-mono text-sm font-bold" style={{ color: severityColor }}>
                                          {fmtDollar(action.penalty_amount)}
                                        </span>
                                      </div>
                                    )}
                                    {action.enforcement_type && (
                                      <div className="flex flex-col">
                                        <span className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-white/30">Type</span>
                                        <span className="font-mono text-sm text-white/70">{action.enforcement_type}</span>
                                      </div>
                                    )}
                                    {action.case_date && (
                                      <div className="flex flex-col">
                                        <span className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-white/30">Date</span>
                                        <span className="font-mono text-sm text-white/70">{fmtDate(action.case_date)}</span>
                                      </div>
                                    )}
                                    {action.source && (
                                      <div className="flex flex-col">
                                        <span className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-white/30">Source</span>
                                        <span className="font-mono text-sm text-white/70">{action.source}</span>
                                      </div>
                                    )}
                                  </div>
                                  {action.case_url && (
                                    <a
                                      href={action.case_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 mt-3 font-mono text-xs no-underline transition-opacity hover:opacity-80"
                                      style={{ color: config.accent }}
                                    >
                                      <ExternalLink size={12} />
                                      View Source Document
                                    </a>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {action.case_url && !isExpanded && (
                          <a
                            href={action.case_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                          >
                            <ExternalLink size={14} className="text-white" />
                          </a>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-zinc-900 animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && allActions.length === 0 && (
            <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-20">
              <Shield size={48} className="text-white/20 mb-4" />
              <p className="font-body text-xl text-white/40">No enforcement actions found</p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
