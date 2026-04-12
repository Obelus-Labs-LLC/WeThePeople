import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FlaskConical, Building2, ExternalLink, ChevronRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { HealthSectorHeader } from '../components/SectorHeader';
import {
  getHealthCompanies,
  getHealthCompanyTrials,
  type CompanyListItem,
  type ClinicalTrialItem,
} from '../api/health';
import { fmtNum } from '../utils/format';

// ── Phase definitions ──

const PHASES = [
  { key: 'Phase 1', label: 'Phase 1', subtitle: 'Safety & Dosage', color: '#F59E0B' },
  { key: 'Phase 2', label: 'Phase 2', subtitle: 'Efficacy & Side Effects', color: '#3B82F6' },
  { key: 'Phase 3', label: 'Phase 3', subtitle: 'Large-Scale Testing', color: '#8B5CF6' },
  { key: 'Phase 4', label: 'Phase 4', subtitle: 'Post-Market Surveillance', color: '#10B981' },
] as const;

// ── Types ──

interface PipelineData {
  phaseCounts: Record<string, number>;
  phaseTrials: Record<string, (ClinicalTrialItem & { companyId: string; companyName: string })[]>;
  companyBreakdown: { companyId: string; companyName: string; logoUrl: string | null; phases: Record<string, number>; total: number }[];
  totalTrials: number;
}

// ── Helpers ──

function matchPhase(phase: string | null, phaseKey: string): boolean {
  if (!phase) return false;
  // Normalize: lowercase, insert space between "phase" and digit if missing (e.g. "phase1" → "phase 1")
  const p = phase.toLowerCase().replace(/\s+/g, ' ').replace(/phase(\d)/g, 'phase $1');
  // Normalize Roman numerals to Arabic
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
  if (!status) return '#64748B';
  const lower = status.toLowerCase();
  if (lower.includes('recruit') && !lower.includes('not')) return '#10B981';
  if (lower.includes('active') || lower.includes('not yet')) return '#F59E0B';
  if (lower.includes('completed')) return '#3B82F6';
  return '#DC2626';
}

// ── Page ──

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

        // Fetch trials for all companies in parallel (up to 100)
        const companySlice = companies.slice(0, 100);
        const allTrialSets = await Promise.all(
          companySlice.map((c) =>
            getHealthCompanyTrials(c.company_id, { limit: 100 })
              .then((res) => ({
                company: c,
                trials: res.trials || [],
              }))
              .catch(() => ({ company: c, trials: [] as ClinicalTrialItem[] }))
          )
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
                phaseTrials[phase.key].push({
                  ...trial,
                  companyId: company.company_id,
                  companyName: company.display_name,
                });
                compEntry.phases[phase.key] = (compEntry.phases[phase.key] || 0) + 1;
                compEntry.total++;
                break;
              }
            }
          }

          if (compEntry.total > 0) {
            companyMap.set(company.company_id, compEntry);
          }
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DC2626] border-t-transparent" />
          <p className="text-sm text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            Aggregating clinical trial data...
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col w-full min-h-screen">
        <div className="mx-auto w-full max-w-[1400px] px-8 py-8 md:px-12 md:py-10">
          <HealthSectorHeader />
          <div className="flex flex-col items-center justify-center mt-32 gap-4">
            <FlaskConical size={40} className="text-white/20" />
            <p className="text-lg text-red-400">{error || 'No pipeline data available'}</p>
            <button onClick={() => window.location.reload()} className="mt-2 rounded bg-[#DC2626] px-4 py-2 text-sm text-white hover:bg-[#B91C1C]">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const maxPhaseCount = Math.max(...Object.values(data.phaseCounts), 1);

  return (
    <div className="flex flex-col w-full min-h-screen">
      <div className="mx-auto w-full max-w-[1400px] flex flex-col px-8 py-8 md:px-12 md:py-10">
        <HealthSectorHeader />

        {/* Header */}
        <div className="flex items-end justify-between pb-6 mb-8 shrink-0 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical size={16} style={{ color: '#DC2626' }} />
              <span
                className="text-sm uppercase text-white/40"
                style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.2em' }}
              >
                CLINICAL PIPELINE
              </span>
            </div>
            <h1
              className="text-4xl md:text-5xl font-bold text-white"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Trial Pipeline
            </h1>
            <p className="text-sm mt-2 text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtNum(data.totalTrials)} total trials across {data.companyBreakdown.length} companies
            </p>
          </div>
        </div>

        {/* Funnel Visualization */}
        <div className="bg-white/[0.05] backdrop-blur-sm rounded-xl border border-white/10 p-8 mb-8">
          <h3
            className="text-sm font-bold uppercase mb-8 text-white/50"
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}
          >
            PIPELINE FUNNEL
          </h3>

          <div className="space-y-4">
            {PHASES.map((phase, idx) => {
              const count = data.phaseCounts[phase.key] || 0;
              const widthPct = Math.max((count / maxPhaseCount) * 100, 4);
              const isExpanded = expandedPhase === phase.key;

              return (
                <div key={phase.key}>
                  <button
                    onClick={() => setExpandedPhase(isExpanded ? null : phase.key)}
                    className="w-full cursor-pointer bg-transparent border-0 p-0 text-left"
                  >
                    {/* Phase label */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span
                          className="text-lg font-bold text-white"
                          style={{ fontFamily: "'Syne', sans-serif" }}
                        >
                          {phase.label}
                        </span>
                        <span
                          className="text-xs text-white/30"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {phase.subtitle}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className="text-2xl font-bold"
                          style={{ fontFamily: "'JetBrains Mono', monospace", color: phase.color }}
                        >
                          {fmtNum(count)}
                        </span>
                        <ChevronRight
                          size={16}
                          className="text-white/30 transition-transform"
                          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        />
                      </div>
                    </div>

                    {/* Bar */}
                    <div className="w-full h-10 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <motion.div
                        className="h-full rounded-lg flex items-center px-4"
                        style={{ background: phase.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${widthPct}%` }}
                        transition={{ duration: 0.8, delay: idx * 0.15, ease: 'easeOut' }}
                      >
                        {widthPct > 15 && (
                          <span className="text-xs font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {count} trials
                          </span>
                        )}
                      </motion.div>
                    </div>
                  </button>

                  {/* Expanded trials list */}
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 ml-4 space-y-2 max-h-[400px] overflow-y-auto"
                      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
                    >
                      {(data.phaseTrials[phase.key] || []).slice(0, 20).map((t, tidx) => {
                        const statusColor = trialStatusColor(t.overall_status);
                        return (
                          <div
                            key={`${t.id}-${tidx}`}
                            className="flex items-start gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white line-clamp-2 mb-1" style={{ fontFamily: "'Syne', sans-serif" }}>
                                {t.title || 'Untitled Trial'}
                              </p>
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
                                  <span className="text-xs text-white/50" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                    {t.overall_status || 'Unknown'}
                                  </span>
                                </div>
                                {t.nct_id && (
                                  <a
                                    href={`https://clinicaltrials.gov/study/${t.nct_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs hover:underline"
                                    style={{ fontFamily: "'JetBrains Mono', monospace", color: '#93C5FD' }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {t.nct_id}
                                  </a>
                                )}
                                <Link
                                  to={`/health/${t.companyId}`}
                                  className="flex items-center gap-1 text-xs no-underline hover:text-[#FCA5A5]"
                                  style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Building2 size={11} />
                                  {t.companyName}
                                </Link>
                              </div>
                            </div>
                            {t.enrollment != null && (
                              <span className="text-xs shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.3)' }}>
                                n={t.enrollment.toLocaleString()}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {(data.phaseTrials[phase.key] || []).length > 20 && (
                        <p className="text-xs text-center py-2 text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          + {(data.phaseTrials[phase.key].length - 20).toLocaleString()} more trials
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* Connector arrow between phases */}
                  {idx < PHASES.length - 1 && (
                    <div className="flex justify-center py-1">
                      <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.1)' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Company Breakdown */}
        <div className="bg-white/[0.05] backdrop-blur-sm rounded-xl border border-white/10 p-8">
          <h3
            className="text-sm font-bold uppercase mb-6 text-white/50"
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}
          >
            COMPANY BREAKDOWN
          </h3>

          <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            <table className="w-full border-collapse" style={{ minWidth: '700px' }}>
              <thead>
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    COMPANY
                  </th>
                  {PHASES.map((p) => (
                    <th key={p.key} className="text-right p-3 text-xs font-medium" style={{ fontFamily: "'JetBrains Mono', monospace", color: p.color }}>
                      {p.label.toUpperCase()}
                    </th>
                  ))}
                  <th className="text-right p-3 text-xs font-medium text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.companyBreakdown.map((comp, idx) => (
                  <tr
                    key={comp.companyId}
                    className="transition-colors hover:bg-white/[0.03]"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      opacity: 0,
                      animation: `row-fade 0.3s ease-out ${idx * 0.05}s forwards`,
                    }}
                  >
                    <td className="p-3">
                      <Link
                        to={`/health/${comp.companyId}`}
                        className="flex items-center gap-3 no-underline group"
                      >
                        <div className="w-8 h-8 rounded border border-white/10 bg-white/[0.05] flex items-center justify-center shrink-0 p-1">
                          {comp.logoUrl ? (
                            <img src={comp.logoUrl} alt={comp.companyName} className="w-full h-full object-contain" />
                          ) : (
                            <Building2 size={14} className="text-white/30" />
                          )}
                        </div>
                        <span className="text-sm font-medium text-white group-hover:text-[#FCA5A5] transition-colors" style={{ fontFamily: "'Syne', sans-serif" }}>
                          {comp.companyName}
                        </span>
                      </Link>
                    </td>
                    {PHASES.map((p) => (
                      <td key={p.key} className="p-3 text-right">
                        <span
                          className="text-sm font-bold"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            color: (comp.phases[p.key] || 0) > 0 ? p.color : 'rgba(255,255,255,0.15)',
                          }}
                        >
                          {comp.phases[p.key] || 0}
                        </span>
                      </td>
                    ))}
                    <td className="p-3 text-right">
                      <span className="text-sm font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {comp.total}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes row-fade {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
