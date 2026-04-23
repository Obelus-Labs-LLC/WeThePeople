import React, { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Shield,
  Building2,
  Calendar,
  ExternalLink,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import CSVExport from '../components/CSVExport';
import SectorTabLayout, {
  statCard,
  statLabel,
  statNumber,
  sectionTitle,
  sectionSubtitle,
  emptyState,
} from '../components/sector/SectorTabLayout';
import { SECTOR_MAP, detectSector } from '../components/sector/sectorConfig';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';

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
  ai_summary?: string;
}

interface CompanyEnforcementStats {
  entity_id: string;
  entity_name: string;
  totalPenalties: number;
  actionCount: number;
}

// ── Severity helpers ──

type Severity = 'high' | 'medium' | 'low';

const SEVERITY_TOKEN: Record<Severity, { token: string; hex: string; label: string }> = {
  high: { token: 'var(--color-red)', hex: '#E63946', label: 'Severe' },
  medium: { token: 'var(--color-accent-text)', hex: '#D4AE35', label: 'Moderate' },
  low: { token: 'var(--color-green)', hex: '#3DB87A', label: 'Minor' },
};

function getSeverity(penalty: number | null): Severity {
  if (penalty == null || penalty === 0) return 'low';
  if (penalty >= 1_000_000_000) return 'high';
  if (penalty >= 100_000_000) return 'medium';
  return 'low';
}

function sevInfo(sev: Severity) {
  return SEVERITY_TOKEN[sev];
}

// ── Animation variants ──

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 130, damping: 22 },
  },
};

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
  const entityWord = config.entityKey === 'institutions' ? 'institutions' : 'companies';
  const EntityWord = config.entityKey === 'institutions' ? 'Institutions' : 'Companies';

  const [allActions, setAllActions] = useState<EnforcementAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const endpoint = config.endpoints.enforcement;

    async function loadData() {
      if (!endpoint) {
        setLoading(false);
        return;
      }
      try {
        const data = await fetchJSON<{ actions: EnforcementAction[] }>(endpoint);
        if (cancelled) return;
        const actions = [...(data.actions || [])];
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
  }, [sectorKey, config.endpoints.enforcement]);

  // Filtered by severity
  const filtered = useMemo(() => {
    if (severityFilter === 'all') return allActions;
    return allActions.filter((a) => getSeverity(a.penalty_amount) === severityFilter);
  }, [allActions, severityFilter]);

  // Company aggregation
  const companyStats = useMemo<CompanyEnforcementStats[]>(() => {
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
    const arr = Array.from(statsMap.values());
    const hasPenalties = arr.some((c) => c.totalPenalties > 0);
    return arr.sort((a, b) => hasPenalties
      ? b.totalPenalties - a.totalPenalties
      : b.actionCount - a.actionCount
    );
  }, [allActions]);

  // Severity counts
  const severityCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const a of allActions) {
      counts[getSeverity(a.penalty_amount)] += 1;
    }
    return counts;
  }, [allActions]);

  // Totals
  const totalPenalties = allActions.reduce((sum, a) => sum + (a.penalty_amount || 0), 0);
  const totalActionsCount = allActions.length;
  const uniqueCompanies = new Set(allActions.map((a) => a.entity_id)).size;
  const hasPenaltyData = totalPenalties > 0;
  const maxCompanyPenalty = companyStats.length > 0 ? companyStats[0].totalPenalties : 0;
  const maxCompanyActions = companyStats.length > 0 ? companyStats[0].actionCount : 0;

  const csvExport = (
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
  );

  const filterPillStyles = (active: boolean, hex: string, tokenColor: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 14px',
    borderRadius: '999px',
    border: active ? `1px solid ${hex}55` : '1px solid rgba(235,229,213,0.1)',
    background: active ? `${hex}1A` : 'transparent',
    color: active ? tokenColor : 'var(--color-text-2)',
    fontFamily: 'var(--font-body)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  return (
    <SectorTabLayout
      config={config}
      eyebrow="Enforcement Actions"
      title={`${config.label} enforcement tracker`}
      subtitle={`Regulatory enforcement actions and penalties across all tracked ${config.label.toLowerCase()} ${entityWord}, color-coded by severity.`}
      rightSlot={csvExport}
      error={error}
      errorLabel="enforcement data"
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}
      >
        {/* Stat cards */}
        {loading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '12px',
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ ...statCard, height: '96px' }} />
            ))}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <motion.div variants={itemVariants} style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={statLabel}>Total Penalties</span>
                <TrendingUp size={16} color="var(--color-text-3)" />
              </div>
              <span style={{ ...statNumber, color: hasPenaltyData ? 'var(--color-red)' : 'var(--color-text-3)' }}>
                {hasPenaltyData ? fmtDollar(totalPenalties) : 'N/A'}
              </span>
            </motion.div>
            <motion.div variants={itemVariants} style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={statLabel}>Actions</span>
                <AlertTriangle size={16} color="var(--color-text-3)" />
              </div>
              <span style={statNumber}>{fmtNum(totalActionsCount)}</span>
            </motion.div>
            <motion.div variants={itemVariants} style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={statLabel}>{EntityWord}</span>
                <Building2 size={16} color="var(--color-text-3)" />
              </div>
              <span style={statNumber}>{uniqueCompanies}</span>
            </motion.div>
            <motion.div variants={itemVariants} style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={statLabel}>Severe Actions</span>
                <Shield size={16} color="var(--color-text-3)" />
              </div>
              <span style={{ ...statNumber, color: 'var(--color-red)' }}>{severityCounts.high}</span>
            </motion.div>
          </motion.div>
        )}

        {/* Company breakdown */}
        {!loading && companyStats.length > 0 && (
          <motion.div variants={itemVariants}>
            <h2 style={sectionTitle}>
              {hasPenaltyData ? 'Penalties' : 'Actions'} by{' '}
              <span style={{ color: config.accent, fontStyle: 'italic' }}>
                {config.entityKey === 'institutions' ? 'institution' : 'company'}
              </span>
            </h2>
            <p style={sectionSubtitle}>
              {EntityWord} ranked by {hasPenaltyData ? 'total penalty amounts' : 'enforcement action count'}.
            </p>

            <div
              style={{
                padding: '8px',
                background: 'var(--color-surface)',
                border: '1px solid rgba(235,229,213,0.08)',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {companyStats.slice(0, 10).map((comp, idx) => {
                const pct = hasPenaltyData
                  ? (maxCompanyPenalty > 0 ? (comp.totalPenalties / maxCompanyPenalty) * 100 : 0)
                  : (maxCompanyActions > 0 ? (comp.actionCount / maxCompanyActions) * 100 : 0);
                const severity: Severity = hasPenaltyData ? getSeverity(comp.totalPenalties) : 'low';
                const sev = sevInfo(severity);
                const barColor = hasPenaltyData ? sev.hex : config.accent;
                const barColorToken = hasPenaltyData ? sev.token : config.accent;

                const expandKey = `company-${comp.entity_id}`;
                const isExpanded = expandedId === expandKey;
                const companyActions = isExpanded
                  ? allActions
                      .filter((a) => a.entity_id === comp.entity_id)
                      .sort((a, b) => (b.penalty_amount || 0) - (a.penalty_amount || 0))
                  : [];

                return (
                  <motion.div
                    key={comp.entity_id}
                    variants={itemVariants}
                    layout
                    style={{
                      borderRadius: '12px',
                      background: isExpanded ? 'rgba(235,229,213,0.04)' : 'transparent',
                      transition: 'background 0.18s',
                    }}
                  >
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : expandKey)}
                      style={{ padding: '14px 16px', cursor: 'pointer', borderRadius: '12px' }}
                      onMouseEnter={(e) => {
                        if (!isExpanded) e.currentTarget.style.background = 'rgba(235,229,213,0.03)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          marginBottom: '10px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: 'var(--color-text-3)',
                              width: '20px',
                              textAlign: 'right',
                              flexShrink: 0,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <Link
                            to={config.profilePath(comp.entity_id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '14px',
                              fontWeight: 500,
                              color: 'var(--color-text-1)',
                              textDecoration: 'none',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = config.accent; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
                          >
                            {comp.entity_name}
                          </Link>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: 'var(--color-text-3)',
                            }}
                          >
                            {comp.actionCount} actions
                          </span>
                          {comp.totalPenalties > 0 && (
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '13px',
                                fontWeight: 700,
                                color: barColorToken,
                                minWidth: '100px',
                                textAlign: 'right',
                              }}
                            >
                              {fmtDollar(comp.totalPenalties)}
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronUp size={16} color="var(--color-text-3)" />
                          ) : (
                            <ChevronDown size={16} color="var(--color-text-3)" />
                          )}
                        </div>
                      </div>

                      {/* Bar */}
                      <div
                        style={{
                          height: '6px',
                          background: 'var(--color-surface-2)',
                          borderRadius: '999px',
                          overflow: 'hidden',
                          marginLeft: '32px',
                        }}
                      >
                        <motion.div
                          style={{
                            height: '100%',
                            borderRadius: '999px',
                            background: barColor,
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(pct, 1)}%` }}
                          transition={{ duration: 0.7, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    </div>

                    {/* Expanded actions */}
                    <AnimatePresence>
                      {isExpanded && companyActions.length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div
                            style={{
                              margin: '0 16px 16px',
                              paddingTop: '12px',
                              borderTop: '1px solid rgba(235,229,213,0.06)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '10px',
                                fontWeight: 700,
                                letterSpacing: '0.14em',
                                textTransform: 'uppercase',
                                color: 'var(--color-text-3)',
                              }}
                            >
                              Enforcement actions ({companyActions.length})
                            </span>
                            {companyActions.map((action) => {
                              const actSev = getSeverity(action.penalty_amount);
                              const actInfo = sevInfo(actSev);
                              return (
                                <div
                                  key={action.id}
                                  style={{
                                    padding: '12px',
                                    borderRadius: '10px',
                                    border: `1px solid ${actInfo.hex}22`,
                                    background: `${actInfo.hex}10`,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      marginBottom: '6px',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    <span
                                      style={{
                                        padding: '2px 8px',
                                        borderRadius: '999px',
                                        background: `${actInfo.hex}22`,
                                        color: actInfo.token,
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: '9px',
                                        fontWeight: 700,
                                        letterSpacing: '0.1em',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      {actInfo.label}
                                    </span>
                                    {action.enforcement_type && (
                                      <span
                                        style={{
                                          padding: '2px 8px',
                                          borderRadius: '999px',
                                          background: 'rgba(235,229,213,0.06)',
                                          fontFamily: 'var(--font-mono)',
                                          fontSize: '9px',
                                          color: 'var(--color-text-3)',
                                        }}
                                      >
                                        {action.enforcement_type}
                                      </span>
                                    )}
                                  </div>
                                  <p
                                    style={{
                                      fontFamily: 'var(--font-body)',
                                      fontSize: '13px',
                                      color: 'var(--color-text-1)',
                                      margin: '0 0 4px',
                                    }}
                                  >
                                    {action.case_title || 'Enforcement Action'}
                                  </p>
                                  {action.description && (
                                    <p
                                      style={{
                                        fontFamily: 'var(--font-body)',
                                        fontSize: '12px',
                                        color: 'var(--color-text-2)',
                                        margin: '0 0 4px',
                                        lineHeight: 1.5,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                      }}
                                    >
                                      {action.description}
                                    </p>
                                  )}
                                  {action.ai_summary && (
                                    <p
                                      style={{
                                        fontFamily: 'var(--font-body)',
                                        fontStyle: 'italic',
                                        fontSize: '12px',
                                        color: 'var(--color-text-3)',
                                        margin: '0 0 4px',
                                      }}
                                    >
                                      {action.ai_summary}
                                    </p>
                                  )}
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    {action.penalty_amount != null && action.penalty_amount > 0 && (
                                      <span
                                        style={{
                                          fontFamily: 'var(--font-mono)',
                                          fontSize: '12px',
                                          fontWeight: 700,
                                          color: actInfo.token,
                                        }}
                                      >
                                        {fmtDollar(action.penalty_amount)}
                                      </span>
                                    )}
                                    {action.case_date && (
                                      <span
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          fontFamily: 'var(--font-mono)',
                                          fontSize: '11px',
                                          color: 'var(--color-text-3)',
                                        }}
                                      >
                                        <Calendar size={11} />
                                        {fmtDate(action.case_date)}
                                      </span>
                                    )}
                                    {action.source && (
                                      <span
                                        style={{
                                          fontFamily: 'var(--font-mono)',
                                          fontSize: '11px',
                                          color: 'var(--color-text-3)',
                                        }}
                                      >
                                        {action.source}
                                      </span>
                                    )}
                                    {action.case_url && (
                                      <a
                                        href={action.case_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          fontFamily: 'var(--font-mono)',
                                          fontSize: '11px',
                                          color: config.accent,
                                          textDecoration: 'none',
                                        }}
                                      >
                                        <ExternalLink size={11} />
                                        Source
                                      </a>
                                    )}
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

        {/* All actions list with severity filter */}
        {!loading && allActions.length > 0 && (
          <motion.div variants={itemVariants}>
            <h2 style={sectionTitle}>
              All enforcement <span style={{ color: config.accent, fontStyle: 'italic' }}>actions</span>
            </h2>
            <p style={sectionSubtitle}>Filter by severity to narrow the view.</p>

            {/* Severity pills */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {(['all', 'high', 'medium', 'low'] as const).map((level) => {
                const active = severityFilter === level;
                const count = level === 'all' ? totalActionsCount : severityCounts[level];
                const hex = level === 'all' ? '#EBE5D5' : SEVERITY_TOKEN[level].hex;
                const tokenColor = level === 'all' ? 'var(--color-text-1)' : SEVERITY_TOKEN[level].token;
                const label = level === 'all' ? 'All' : SEVERITY_TOKEN[level].label;
                return (
                  <button
                    key={level}
                    onClick={() => setSeverityFilter(level)}
                    style={filterPillStyles(active, hex, tokenColor)}
                  >
                    {label}
                    <span
                      style={{
                        padding: '1px 7px',
                        borderRadius: '999px',
                        background: active ? `${hex}33` : 'rgba(235,229,213,0.08)',
                        color: active ? tokenColor : 'var(--color-text-3)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 700,
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Action cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map((action) => {
                const sev = getSeverity(action.penalty_amount);
                const sevConfig = sevInfo(sev);
                const cardKey = `${action.entity_id}-${action.id}`;
                const isExpanded = expandedId === cardKey;

                return (
                  <motion.div
                    key={cardKey}
                    variants={itemVariants}
                    onClick={() => setExpandedId(isExpanded ? null : cardKey)}
                    style={{
                      padding: '16px 18px',
                      borderRadius: '14px',
                      border: `1px solid ${sevConfig.hex}22`,
                      background: `${sevConfig.hex}10`,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = `${sevConfig.hex}44`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = `${sevConfig.hex}22`;
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '14px',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            marginBottom: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              padding: '3px 10px',
                              borderRadius: '999px',
                              background: `${sevConfig.hex}22`,
                              color: sevConfig.token,
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10px',
                              fontWeight: 700,
                              letterSpacing: '0.1em',
                              textTransform: 'uppercase',
                            }}
                          >
                            {sevConfig.label}
                          </span>
                          <Link
                            to={config.profilePath(action.entity_id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '12px',
                              color: config.accent,
                              textDecoration: 'none',
                            }}
                          >
                            {action.entity_name}
                          </Link>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            marginBottom: '8px',
                          }}
                        >
                          <p
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '14px',
                              fontWeight: 500,
                              color: 'var(--color-text-1)',
                              margin: 0,
                              flex: 1,
                            }}
                          >
                            {action.case_title || 'Enforcement Action'}
                          </p>
                          {isExpanded ? (
                            <ChevronUp size={16} color="var(--color-text-3)" style={{ flexShrink: 0, marginTop: '3px' }} />
                          ) : (
                            <ChevronDown size={16} color="var(--color-text-3)" style={{ flexShrink: 0, marginTop: '3px' }} />
                          )}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            flexWrap: 'wrap',
                          }}
                        >
                          {action.penalty_amount != null && action.penalty_amount > 0 && (
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '13px',
                                fontWeight: 700,
                                color: sevConfig.token,
                              }}
                            >
                              {fmtDollar(action.penalty_amount)}
                            </span>
                          )}
                          {action.enforcement_type && (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '999px',
                                background: 'rgba(235,229,213,0.06)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '10px',
                                color: 'var(--color-text-3)',
                              }}
                            >
                              {action.enforcement_type}
                            </span>
                          )}
                          {action.case_date && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                color: 'var(--color-text-3)',
                              }}
                            >
                              <Calendar size={11} />
                              {fmtDate(action.case_date)}
                            </span>
                          )}
                          {action.source && (
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                color: 'var(--color-text-3)',
                              }}
                            >
                              {action.source}
                            </span>
                          )}
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              style={{ overflow: 'hidden' }}
                            >
                              <div
                                style={{
                                  marginTop: '12px',
                                  paddingTop: '12px',
                                  borderTop: '1px solid rgba(235,229,213,0.08)',
                                }}
                              >
                                {action.description && (
                                  <p
                                    style={{
                                      fontFamily: 'var(--font-body)',
                                      fontSize: '13px',
                                      color: 'var(--color-text-2)',
                                      margin: '0 0 12px',
                                      lineHeight: 1.55,
                                    }}
                                  >
                                    {action.description}
                                  </p>
                                )}
                                {action.ai_summary && (
                                  <div style={{ marginBottom: '12px' }}>
                                    <span
                                      style={{
                                        display: 'inline-block',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        letterSpacing: '0.14em',
                                        textTransform: 'uppercase',
                                        color: 'var(--color-text-3)',
                                        marginBottom: '4px',
                                      }}
                                    >
                                      AI analysis
                                    </span>
                                    <p
                                      style={{
                                        fontFamily: 'var(--font-body)',
                                        fontStyle: 'italic',
                                        fontSize: '13px',
                                        color: 'var(--color-text-2)',
                                        margin: 0,
                                        lineHeight: 1.55,
                                      }}
                                    >
                                      {action.ai_summary}
                                    </p>
                                  </div>
                                )}
                                {action.case_url && (
                                  <a
                                    href={action.case_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '12px',
                                      color: config.accent,
                                      textDecoration: 'none',
                                      transition: 'opacity 0.2s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                                  >
                                    <ExternalLink size={12} />
                                    View source document
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
                          style={{
                            display: 'flex',
                            width: '28px',
                            height: '28px',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '999px',
                            background: 'rgba(235,229,213,0.06)',
                            color: 'var(--color-text-2)',
                            flexShrink: 0,
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(235,229,213,0.14)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(235,229,213,0.06)';
                          }}
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ ...statCard, height: '112px' }} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && allActions.length === 0 && (
          <div style={emptyState}>
            <Shield size={40} color="var(--color-text-3)" style={{ opacity: 0.4, marginBottom: '16px' }} />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '16px',
                color: 'var(--color-text-3)',
                margin: 0,
              }}
            >
              No enforcement actions found
            </p>
          </div>
        )}
      </motion.div>
    </SectorTabLayout>
  );
}
