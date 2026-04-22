import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, Building2, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { HealthSectorHeader } from '../components/SectorHeader';
import {
  ResearchToolLayout,
  ResearchSection,
  ResearchEmptyState,
} from '../components/research/ResearchToolLayout';
import {
  getHealthCompanies,
  getHealthCompanyTrials,
  type ClinicalTrialItem,
} from '../api/health';
import { fmtNum } from '../utils/format';

const PHASES = [
  { key: 'Phase 1', label: 'Phase 1', subtitle: 'Safety & Dosage', color: 'var(--color-accent)' },
  { key: 'Phase 2', label: 'Phase 2', subtitle: 'Efficacy & Side Effects', color: 'var(--color-dem)' },
  { key: 'Phase 3', label: 'Phase 3', subtitle: 'Large-Scale Testing', color: 'var(--color-ind)' },
  { key: 'Phase 4', label: 'Phase 4', subtitle: 'Post-Market Surveillance', color: 'var(--color-green)' },
] as const;

interface PipelineData {
  phaseCounts: Record<string, number>;
  phaseTrials: Record<string, (ClinicalTrialItem & { companyId: string; companyName: string })[]>;
  companyBreakdown: { companyId: string; companyName: string; logoUrl: string | null; phases: Record<string, number>; total: number }[];
  totalTrials: number;
}

function matchPhase(phase: string | null, phaseKey: string): boolean {
  if (!phase) return false;
  const p = phase.toLowerCase().replace(/\s+/g, ' ').replace(/phase(\d)/g, 'phase $1');
  const normalized = p
    .replace(/phase iv/g, 'phase 4')
    .replace(/phase iii/g, 'phase 3')
    .replace(/phase ii/g, 'phase 2')
    .replace(/phase i/g, 'phase 1');
  const key = phaseKey.toLowerCase();
  if (key === 'phase 1') return normalized.includes('phase 1') && !normalized.includes('phase 2') && !normalized.includes('phase 3') && !normalized.includes('phase 4');
  if (key === 'phase 2') return normalized.includes('phase 2') && !normalized.includes('phase 3');
  if (key === 'phase 3') return normalized.includes('phase 3');
  if (key === 'phase 4') return normalized.includes('phase 4');
  return false;
}

function trialStatusColor(status: string | null): string {
  if (!status) return 'var(--color-text-3)';
  const lower = status.toLowerCase();
  if (lower.includes('recruit') && !lower.includes('not')) return 'var(--color-green)';
  if (lower.includes('active') || lower.includes('not yet')) return 'var(--color-accent)';
  if (lower.includes('completed')) return 'var(--color-dem)';
  return 'var(--color-red)';
}

export default function ClinicalTrialPipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  useEffect(() => {
    async function loadPipeline() {
      try {
        const companiesRes = await getHealthCompanies({ limit: 200 });
        const companies = companiesRes.companies || [];
        const companySlice = companies.slice(0, 100);
        const allTrialSets = await Promise.all(
          companySlice.map((c) =>
            getHealthCompanyTrials(c.company_id, { limit: 100 })
              .then((res) => ({ company: c, trials: res.trials || [] }))
              .catch(() => ({ company: c, trials: [] as ClinicalTrialItem[] })),
          ),
        );

        const phaseCounts: Record<string, number> = {};
        const phaseTrials: Record<string, (ClinicalTrialItem & { companyId: string; companyName: string })[]> = {};
        const companyMap = new Map<string, { companyId: string; companyName: string; logoUrl: string | null; phases: Record<string, number>; total: number }>();
        let totalTrials = 0;

        PHASES.forEach((p) => {
          phaseCounts[p.key] = 0;
          phaseTrials[p.key] = [];
        });

        for (const { company, trials } of allTrialSets) {
          const compEntry = {
            companyId: company.company_id,
            companyName: company.display_name,
            logoUrl: company.logo_url,
            phases: {} as Record<string, number>,
            total: 0,
          };

          for (const trial of trials) {
            totalTrials++;
            for (const phase of PHASES) {
              if (matchPhase(trial.phase, phase.key)) {
                phaseCounts[phase.key]++;
                phaseTrials[phase.key].push({ ...trial, companyId: company.company_id, companyName: company.display_name });
                compEntry.phases[phase.key] = (compEntry.phases[phase.key] || 0) + 1;
                compEntry.total++;
                break;
              }
            }
          }

          if (compEntry.total > 0) companyMap.set(company.company_id, compEntry);
        }

        const companyBreakdown = Array.from(companyMap.values()).sort((a, b) => b.total - a.total);
        setData({ phaseCounts, phaseTrials, companyBreakdown, totalTrials });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load pipeline data');
      } finally {
        setLoading(false);
      }
    }
    loadPipeline();
  }, []);

  const maxPhaseCount = data ? Math.max(...Object.values(data.phaseCounts), 1) : 1;

  return (
    <ResearchToolLayout
      sectorHeader={<HealthSectorHeader />}
      eyebrow={{ label: 'Clinical Pipeline', color: 'var(--color-red)' }}
      title="Trial Pipeline"
      description="Clinical trials across all tracked pharmaceutical and biotech companies, grouped by development phase."
      accent="var(--color-red)"
      loading={loading}
      error={error}
      stats={[
        { label: 'Total Trials', value: fmtNum(data?.totalTrials ?? 0), icon: FlaskConical, accent: 'var(--color-red)' },
        { label: 'Companies', value: fmtNum(data?.companyBreakdown.length ?? 0), icon: Building2 },
        { label: 'Phase 3+', value: fmtNum((data?.phaseCounts['Phase 3'] ?? 0) + (data?.phaseCounts['Phase 4'] ?? 0)), icon: ChevronRight },
      ]}
    >
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ height: '360px', borderRadius: '14px', background: 'var(--color-surface)', opacity: 0.6 }} />
          <div style={{ height: '400px', borderRadius: '14px', background: 'var(--color-surface)', opacity: 0.6 }} />
        </div>
      ) : !data || data.totalTrials === 0 ? (
        <ResearchEmptyState icon={FlaskConical} text="No clinical trial data available." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <ResearchSection
            title="Pipeline Funnel"
            subtitle="Trial counts by development phase. Click a phase to inspect individual trials."
          >
            <div
              style={{
                padding: '24px',
                borderRadius: '14px',
                border: '1px solid rgba(235,229,213,0.08)',
                background: 'var(--color-surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
              }}
            >
              {PHASES.map((phase, idx) => {
                const count = data.phaseCounts[phase.key] || 0;
                const widthPct = Math.max((count / maxPhaseCount) * 100, 4);
                const isExpanded = expandedPhase === phase.key;
                return (
                  <div key={phase.key}>
                    <button
                      onClick={() => setExpandedPhase(isExpanded ? null : phase.key)}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 900, fontSize: '18px', color: 'var(--color-text-1)' }}>
                            {phase.label}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>{phase.subtitle}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: phase.color }}>
                            {fmtNum(count)}
                          </span>
                          <ChevronRight
                            size={14}
                            color="var(--color-text-3)"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                          />
                        </div>
                      </div>
                      <div style={{ width: '100%', height: '36px', borderRadius: '8px', background: 'rgba(235,229,213,0.04)', overflow: 'hidden' }}>
                        <motion.div
                          style={{ height: '100%', borderRadius: '8px', background: phase.color, display: 'flex', alignItems: 'center', padding: '0 14px' }}
                          initial={{ width: 0 }}
                          animate={{ width: `${widthPct}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.15, ease: 'easeOut' }}
                        >
                          {widthPct > 15 && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#0A0A0F' }}>
                              {count} trials
                            </span>
                          )}
                        </motion.div>
                      </div>
                    </button>

                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '400px', overflowY: 'auto' }}
                      >
                        {(data.phaseTrials[phase.key] || []).slice(0, 20).map((t, tidx) => {
                          const statusColor = trialStatusColor(t.overall_status);
                          return (
                            <div
                              key={`${t.id}-${tidx}`}
                              style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '12px', borderRadius: '10px', border: '1px solid rgba(235,229,213,0.06)', background: 'rgba(235,229,213,0.03)' }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-1)', margin: '0 0 4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                  {t.title || 'Untitled Trial'}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: statusColor }} />
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                                      {t.overall_status || 'Unknown'}
                                    </span>
                                  </div>
                                  {t.nct_id && (
                                    <a
                                      href={`https://clinicaltrials.gov/study/${t.nct_id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-dem)', textDecoration: 'none' }}
                                    >
                                      {t.nct_id}
                                    </a>
                                  )}
                                  <Link
                                    to={`/health/${t.companyId}`}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', textDecoration: 'none' }}
                                  >
                                    <Building2 size={11} />
                                    {t.companyName}
                                  </Link>
                                </div>
                              </div>
                              {t.enrollment != null && (
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', flexShrink: 0 }}>
                                  n={t.enrollment.toLocaleString()}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {(data.phaseTrials[phase.key] || []).length > 20 && (
                          <p style={{ textAlign: 'center', padding: '8px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                            + {(data.phaseTrials[phase.key].length - 20).toLocaleString()} more trials
                          </p>
                        )}
                      </motion.div>
                    )}

                    {idx < PHASES.length - 1 && (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                        <div style={{ width: '1px', height: '14px', background: 'rgba(235,229,213,0.1)' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ResearchSection>

          <ResearchSection
            title="Company Breakdown"
            subtitle="Per-company trial counts across each development phase."
          >
            <div style={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid rgba(235,229,213,0.08)', background: 'var(--color-surface)' }}>
              <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(235,229,213,0.08)' }}>
                    <th style={{ padding: '14px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-3)' }}>
                      Company
                    </th>
                    {PHASES.map((p) => (
                      <th key={p.key} style={{ padding: '14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: p.color }}>
                        {p.label}
                      </th>
                    ))}
                    <th style={{ padding: '14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-3)' }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.companyBreakdown.map((comp) => (
                    <tr key={comp.companyId} style={{ borderBottom: '1px solid rgba(235,229,213,0.04)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <Link to={`/health/${comp.companyId}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none', color: 'inherit' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid rgba(235,229,213,0.08)', background: 'rgba(235,229,213,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px', flexShrink: 0 }}>
                            {comp.logoUrl ? (
                              <img src={comp.logoUrl} alt={comp.companyName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              <Building2 size={12} color="var(--color-text-3)" />
                            )}
                          </div>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-1)' }}>
                            {comp.companyName}
                          </span>
                        </Link>
                      </td>
                      {PHASES.map((p) => (
                        <td key={p.key} style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: (comp.phases[p.key] || 0) > 0 ? p.color : 'rgba(235,229,213,0.2)',
                            }}
                          >
                            {comp.phases[p.key] || 0}
                          </span>
                        </td>
                      ))}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-1)' }}>
                          {comp.total}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ResearchSection>
        </div>
      )}
    </ResearchToolLayout>
  );
}
