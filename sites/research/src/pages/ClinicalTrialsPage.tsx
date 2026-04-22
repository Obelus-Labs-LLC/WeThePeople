import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical, Search, ExternalLink, ChevronRight } from 'lucide-react';
import { apiFetch, mainSiteUrl } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface HealthCompany {
  company_id: string;
  display_name: string;
}

interface ClinicalTrialItem {
  id: number;
  nct_id: string | null;
  title: string | null;
  phase: string | null;
  overall_status: string | null;
  conditions: string | null;
  interventions: string | null;
  enrollment: number | null;
  start_date: string | null;
}

interface TrialWithCompany extends ClinicalTrialItem {
  companyId: string;
  companyName: string;
}

// ── Constants ──

const PHASES = [
  { key: 'Phase 1', label: 'Phase 1', subtitle: 'Safety & Dosage', color: '#F59E0B' },
  { key: 'Phase 2', label: 'Phase 2', subtitle: 'Efficacy & Side Effects', color: '#3B82F6' },
  { key: 'Phase 3', label: 'Phase 3', subtitle: 'Large-Scale Testing', color: '#8B5CF6' },
  { key: 'Phase 4', label: 'Phase 4', subtitle: 'Post-Market Surveillance', color: '#10B981' },
] as const;

// ── Helpers ──

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
  if (!status) return '#64748B';
  const lower = status.toLowerCase();
  if (lower.includes('recruit') && !lower.includes('not')) return '#10B981';
  if (lower.includes('active') || lower.includes('not yet')) return '#F59E0B';
  if (lower.includes('completed')) return '#3B82F6';
  return '#DC2626';
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

// ── Page ──

export default function ClinicalTrialsPage() {
  const [allTrials, setAllTrials] = useState<TrialWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  useEffect(() => {
    async function loadPipeline() {
      try {
        const companiesRes = await apiFetch<{ companies: HealthCompany[] }>('/health/companies', {
          params: { limit: 200 },
        });
        const companies = companiesRes.companies || [];

        // Load ALL companies in batches of 20
        const batchSize = 20;
        const allTrialSets: { company: HealthCompany; trials: ClinicalTrialItem[] }[] = [];
        for (let i = 0; i < companies.length; i += batchSize) {
          const batch = companies.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map((c) =>
              apiFetch<{ trials: ClinicalTrialItem[] }>(`/health/companies/${c.company_id}/trials`, {
                params: { limit: 100 },
              })
                .then((res) => ({
                  company: c,
                  trials: res.trials || [],
                }))
                .catch(() => ({ company: c, trials: [] as ClinicalTrialItem[] })),
            ),
          );
          allTrialSets.push(...batchResults);
        }

        const combined: TrialWithCompany[] = [];
        for (const { company, trials } of allTrialSets) {
          for (const trial of trials) {
            combined.push({
              ...trial,
              companyId: company.company_id,
              companyName: company.display_name,
            });
          }
        }

        setAllTrials(combined);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load trials');
      } finally {
        setLoading(false);
      }
    }

    loadPipeline();
  }, []);

  // Compute phase data
  const phaseData = useMemo(() => {
    const counts: Record<string, number> = {};
    const grouped: Record<string, TrialWithCompany[]> = {};
    PHASES.forEach((p) => { counts[p.key] = 0; grouped[p.key] = []; });

    for (const trial of allTrials) {
      for (const phase of PHASES) {
        if (matchPhase(trial.phase, phase.key)) {
          counts[phase.key]++;
          grouped[phase.key].push(trial);
          break;
        }
      }
    }

    return { counts, grouped };
  }, [allTrials]);

  // Search filter
  const searchedTrials = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return allTrials.filter(
      (t) =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.conditions && t.conditions.toLowerCase().includes(q)) ||
        (t.interventions && t.interventions.toLowerCase().includes(q)) ||
        t.companyName.toLowerCase().includes(q),
    );
  }, [allTrials, searchQuery]);

  const maxPhaseCount = Math.max(...Object.values(phaseData.counts), 1);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
          <p className="text-sm text-zinc-500">Aggregating clinical trial data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <FlaskConical size={40} className="text-zinc-700" />
          <p className="text-lg text-red-400">{error}</p>
          <button onClick={() => window.location.reload()} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 cursor-pointer">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Clinical Pipeline"
        title="Clinical Trial Tracker"
        description={<>{fmtNum(allTrials.length)} trials across tracked health companies, broken down by phase.</>}
        accent="var(--color-dem)"
      />

      {/* Search */}
      <div className="relative max-w-lg mb-8">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Search by condition, drug, or company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 pl-12 pr-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-red-500/50"
        />
      </div>

      {/* Search results or pipeline funnel */}
      {searchedTrials ? (
        <>
          <p className="text-sm text-zinc-500 mb-4">
            {searchedTrials.length} trials matching "{searchQuery}"
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {searchedTrials.slice(0, 50).map((t, idx) => (
              <TrialCard key={`${t.id}-${idx}`} trial={t} delay={idx * 0.02} />
            ))}
          </div>
          {searchedTrials.length > 50 && (
            <p className="text-center text-sm text-zinc-600 mt-4">
              Showing 50 of {searchedTrials.length} results. Narrow your search for more specific results.
            </p>
          )}
        </>
      ) : (
        <>
          {/* Pipeline Funnel */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8 mb-8">
            <h3 className="text-xs font-bold uppercase mb-8 text-zinc-500 tracking-[0.1em]">PIPELINE FUNNEL</h3>

            <div className="space-y-5">
              {PHASES.map((phase, idx) => {
                const count = phaseData.counts[phase.key] || 0;
                const widthPct = Math.max((count / maxPhaseCount) * 100, 4);
                const isExpanded = expandedPhase === phase.key;

                return (
                  <div key={phase.key}>
                    <button
                      onClick={() => setExpandedPhase(isExpanded ? null : phase.key)}
                      className="w-full cursor-pointer bg-transparent border-0 p-0 text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-white">
                            {phase.label}
                          </span>
                          <span className="text-xs text-zinc-600">{phase.subtitle}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-bold font-mono" style={{ color: phase.color }}>
                            {fmtNum(count)}
                          </span>
                          <ChevronRight
                            size={16}
                            className={`text-zinc-600 transition-transform ${isExpanded ? 'rotate-90' : 'rotate-0'}`}
                          />
                        </div>
                      </div>

                      <div className="w-full h-8 rounded-lg overflow-hidden bg-zinc-800/50">
                        <motion.div
                          className="h-full rounded-lg"
                          style={{ background: phase.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${widthPct}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.15, ease: 'easeOut' }}
                        />
                      </div>
                    </button>

                    {/* Expanded trials */}
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-4 ml-2 space-y-2 max-h-[400px] overflow-y-auto"
                        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
                      >
                        {(phaseData.grouped[phase.key] || []).slice(0, 20).map((t, tidx) => (
                          <TrialCard key={`${t.id}-${tidx}`} trial={t} delay={tidx * 0.02} compact />
                        ))}
                        {(phaseData.grouped[phase.key] || []).length > 20 && (
                          <p className="text-xs text-center py-2 text-zinc-600">
                            + {(phaseData.grouped[phase.key].length - 20).toLocaleString()} more trials
                          </p>
                        )}
                      </motion.div>
                    )}

                    {idx < PHASES.length - 1 && (
                      <div className="flex justify-center py-1">
                        <div className="w-px h-4 bg-zinc-800" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Trial Card ──

function TrialCard({ trial, delay, compact }: { trial: TrialWithCompany; delay: number; compact?: boolean }) {
  const statusColor = trialStatusColor(trial.overall_status);

  return (
    <div
      className={`flex flex-col border border-zinc-800/60 bg-zinc-900/40 rounded-xl ${compact ? 'p-4' : 'p-5'}`}
      style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${delay}s forwards` }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {trial.phase && (
            <span className="rounded px-2 py-0.5 text-xs font-bold text-zinc-400 bg-zinc-800 font-mono">
              {trial.phase}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
            <span className="text-xs text-zinc-500 font-mono">{trial.overall_status || 'Unknown'}</span>
          </div>
        </div>
        {trial.nct_id && (
          <a
            href={`https://clinicaltrials.gov/study/${trial.nct_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-400 hover:underline font-mono"
          >
            {trial.nct_id}
            <ExternalLink size={10} />
          </a>
        )}
      </div>

      <p className={`font-semibold leading-snug flex-1 mb-2 text-white ${compact ? 'text-sm line-clamp-2' : 'text-base line-clamp-3'}`}>
        {trial.title || 'Untitled Trial'}
      </p>

      {!compact && (
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-0.5 text-zinc-600">CONDITIONS</p>
            <p className="text-sm truncate text-zinc-400">{trial.conditions || '\u2014'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-0.5 text-zinc-600">INTERVENTIONS</p>
            <p className="text-sm truncate text-zinc-400">{trial.interventions || '\u2014'}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-zinc-800 pt-2 mt-auto">
        <a
          href={mainSiteUrl(`/health/${trial.companyId}`)}
          className="text-xs text-zinc-500 no-underline hover:text-red-300 transition-colors"
        >
          {trial.companyName}
        </a>
        {trial.enrollment != null && (
          <span className="text-xs text-zinc-600 font-mono">n={trial.enrollment.toLocaleString()}</span>
        )}
      </div>

      <style>{`
        @keyframes card-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
