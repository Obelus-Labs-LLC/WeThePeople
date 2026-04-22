import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, Shield, Building2, Calendar, ExternalLink, TrendingUp } from 'lucide-react';
import { TechSectorHeader } from '../components/SectorHeader';
import {
  ResearchToolLayout,
  ResearchSection,
  ResearchRowCard,
  ResearchEmptyState,
} from '../components/research/ResearchToolLayout';
import {
  getTechCompanies,
  getTechCompanyEnforcement,
  type TechEnforcementItem,
} from '../api/tech';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';

interface EnforcementWithCompany extends TechEnforcementItem {
  company_id: string;
  company_name: string;
}

interface CompanyEnforcementStats {
  company_id: string;
  company_name: string;
  totalPenalties: number;
  actionCount: number;
}

type Severity = 'high' | 'medium' | 'low';

function getSeverity(penalty: number | null): Severity {
  if (penalty == null || penalty === 0) return 'low';
  if (penalty >= 1_000_000_000) return 'high';
  if (penalty >= 100_000_000) return 'medium';
  return 'low';
}

function severityColor(sev: Severity): string {
  if (sev === 'high') return 'var(--color-red)';
  if (sev === 'medium') return 'var(--color-accent)';
  return 'var(--color-green)';
}

function severityLabel(sev: Severity): string {
  if (sev === 'high') return 'SEVERE';
  if (sev === 'medium') return 'MODERATE';
  return 'MINOR';
}

export default function EnforcementTrackerPage() {
  const [allActions, setAllActions] = useState<EnforcementWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const compRes = await getTechCompanies({ limit: 200 });
        const comps = compRes.companies || [];
        if (cancelled) return;
        const results = await Promise.allSettled(
          comps.map((c) =>
            getTechCompanyEnforcement(c.company_id, { limit: 100 }).then((r) =>
              (r.actions || []).map((a) => ({ ...a, company_id: c.company_id, company_name: c.display_name })),
            ),
          ),
        );
        if (cancelled) return;
        const combined: EnforcementWithCompany[] = [];
        for (const result of results) if (result.status === 'fulfilled') combined.push(...result.value);
        combined.sort((a, b) => (b.penalty_amount || 0) - (a.penalty_amount || 0));
        setAllActions(combined);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load enforcement data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (severityFilter === 'all') return allActions;
    return allActions.filter((a) => getSeverity(a.penalty_amount) === severityFilter);
  }, [allActions, severityFilter]);

  const companyStats = useMemo(() => {
    const statsMap = new Map<string, CompanyEnforcementStats>();
    for (const a of allActions) {
      const existing = statsMap.get(a.company_id);
      if (existing) {
        existing.totalPenalties += a.penalty_amount || 0;
        existing.actionCount += 1;
      } else {
        statsMap.set(a.company_id, { company_id: a.company_id, company_name: a.company_name, totalPenalties: a.penalty_amount || 0, actionCount: 1 });
      }
    }
    return Array.from(statsMap.values()).sort((a, b) => b.totalPenalties - a.totalPenalties);
  }, [allActions]);

  const severityCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const a of allActions) counts[getSeverity(a.penalty_amount)] += 1;
    return counts;
  }, [allActions]);

  const totalPenalties = allActions.reduce((sum, a) => sum + (a.penalty_amount || 0), 0);
  const totalActions = allActions.length;
  const uniqueCompanies = new Set(allActions.map((a) => a.company_id)).size;
  const maxCompanyPenalty = companyStats.length > 0 ? companyStats[0].totalPenalties : 0;

  return (
    <ResearchToolLayout
      sectorHeader={<TechSectorHeader />}
      eyebrow={{ label: 'Enforcement Actions', color: 'var(--color-red)' }}
      title="Enforcement Tracker"
      description="Regulatory enforcement actions and penalties across all tracked technology companies, color-coded by severity."
      accent="var(--color-red)"
      loading={loading}
      error={error}
      stats={[
        { label: 'Total Penalties', value: fmtDollar(totalPenalties), icon: TrendingUp, accent: 'var(--color-red)' },
        { label: 'Actions', value: fmtNum(totalActions), icon: AlertTriangle },
        { label: 'Companies', value: fmtNum(uniqueCompanies), icon: Building2 },
        { label: 'Severe', value: fmtNum(severityCounts.high), icon: Shield, accent: 'var(--color-red)' },
      ]}
    >
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: '110px', borderRadius: '12px', background: 'var(--color-surface)', opacity: 0.6 }} />
          ))}
        </div>
      )}

      {!loading && companyStats.length > 0 && (
        <ResearchSection title="Penalties by Company" subtitle="Companies ranked by total penalty amounts.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {companyStats.slice(0, 10).map((comp, idx) => {
              const pct = maxCompanyPenalty > 0 ? (comp.totalPenalties / maxCompanyPenalty) * 100 : 0;
              const sev = getSeverity(comp.totalPenalties);
              const color = severityColor(sev);
              return (
                <ResearchRowCard key={comp.company_id} accent={color} hoverable={false}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', width: '24px', textAlign: 'right' }}>
                        {idx + 1}
                      </span>
                      <Link to={`/technology/${comp.company_id}`} style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-text-1)', textDecoration: 'none' }}>
                        {comp.company_name}
                      </Link>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>{comp.actionCount} actions</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color }}>{fmtDollar(comp.totalPenalties)}</span>
                    </div>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(235,229,213,0.06)', borderRadius: '999px', overflow: 'hidden', marginLeft: '36px' }}>
                    <motion.div
                      style={{ height: '100%', background: color, borderRadius: '999px' }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(pct, 1)}%` }}
                      transition={{ duration: 0.8, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </ResearchRowCard>
              );
            })}
          </div>
        </ResearchSection>
      )}

      {!loading && allActions.length === 0 && (
        <ResearchEmptyState icon={Shield} text="No enforcement actions found." />
      )}

      {!loading && allActions.length > 0 && (
        <ResearchSection title="All Enforcement Actions">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {(['all', 'high', 'medium', 'low'] as const).map((level) => {
              const active = severityFilter === level;
              const count = level === 'all' ? totalActions : severityCounts[level];
              const color = level === 'all' ? 'var(--color-text-1)' : severityColor(level);
              return (
                <button
                  key={level}
                  onClick={() => setSeverityFilter(level)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 14px',
                    borderRadius: '999px',
                    border: `1px solid ${active ? color : 'rgba(235,229,213,0.1)'}`,
                    background: active ? 'rgba(235,229,213,0.05)' : 'transparent',
                    color: active ? color : 'var(--color-text-3)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {level === 'all' ? 'All' : severityLabel(level)}
                  <span style={{ padding: '1px 6px', borderRadius: '999px', background: active ? `${color === 'var(--color-text-1)' ? 'rgba(235,229,213,0.15)' : 'rgba(235,229,213,0.1)'}` : 'rgba(235,229,213,0.06)', fontSize: '10px' }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map((action) => {
              const sev = getSeverity(action.penalty_amount);
              const color = severityColor(sev);
              const cardKey = `${action.company_id}-${action.id}`;
              const isExpanded = expandedId === cardKey;
              return (
                <ResearchRowCard key={cardKey} accent={color} onClick={() => setExpandedId(isExpanded ? null : cardKey)}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: `${color === 'var(--color-red)' ? 'rgba(230,57,70,0.15)' : color === 'var(--color-accent)' ? 'rgba(197,160,40,0.15)' : 'rgba(61,184,122,0.15)'}`, color, fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                          {severityLabel(sev)}
                        </span>
                        <Link to={`/technology/${action.company_id}`} onClick={(e) => e.stopPropagation()} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-ind)', textDecoration: 'none' }}>
                          {action.company_name}
                        </Link>
                      </div>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--color-text-1)', margin: '0 0 6px' }}>
                        {action.case_title || 'Enforcement Action'}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                        {action.penalty_amount != null && action.penalty_amount > 0 && (
                          <span style={{ fontSize: '13px', fontWeight: 700, color }}>{fmtDollar(action.penalty_amount)}</span>
                        )}
                        {action.enforcement_type && (
                          <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(235,229,213,0.06)', color: 'var(--color-text-3)' }}>
                            {action.enforcement_type}
                          </span>
                        )}
                        {action.case_date && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-3)' }}>
                            <Calendar size={12} />
                            {fmtDate(action.case_date)}
                          </span>
                        )}
                        {action.source && <span style={{ color: 'var(--color-text-3)' }}>{action.source}</span>}
                      </div>
                      {action.description && (
                        <p style={{ marginTop: '8px', fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-text-3)', display: '-webkit-box', WebkitLineClamp: isExpanded ? 999 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {action.description}
                        </p>
                      )}
                    </div>
                    {action.case_url && (
                      <a
                        href={action.case_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '999px', background: 'rgba(235,229,213,0.06)', color: 'var(--color-text-1)', flexShrink: 0 }}
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </ResearchRowCard>
              );
            })}
          </div>
        </ResearchSection>
      )}
    </ResearchToolLayout>
  );
}
