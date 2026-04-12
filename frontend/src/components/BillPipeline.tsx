import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

// ── Types ──

interface BillEntry {
  bill_id: string;
  status_bucket: string | null;
  title?: string;
  congress?: number;
  bill_type?: string;
  bill_number?: number | string;
  policy_area?: string | null;
  latest_action_text?: string | null;
  latest_action_date?: string | null;
}

interface BillPipelineProps {
  bills: BillEntry[];
  onStageClick: (stage: string) => void;
  activeStage?: string;
}

// ── Stage config ──

const STAGES = [
  { key: 'introduced', label: 'Introduced', color: '#6B7280', bgAlpha: 'rgba(107,114,128,0.15)' },
  { key: 'in_committee', label: 'Committee', color: '#F59E0B', bgAlpha: 'rgba(245,158,11,0.15)' },
  { key: 'passed_one', label: 'Floor Vote', color: '#3B82F6', bgAlpha: 'rgba(59,130,246,0.15)' },
  { key: 'passed_both', label: 'Other Chamber', color: '#8B5CF6', bgAlpha: 'rgba(139,92,246,0.15)' },
  { key: 'president', label: 'President', color: '#EC4899', bgAlpha: 'rgba(236,72,153,0.15)' },
  { key: 'became_law', label: 'Law', color: '#10B981', bgAlpha: 'rgba(16,185,129,0.15)' },
] as const;

/** Map a status_bucket string to one of our pipeline stage keys. */
function bucketToStageKey(status: string | null): string {
  if (!status) return 'introduced';
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  const map: Record<string, string> = {
    introduced: 'introduced',
    in_committee: 'in_committee',
    passed_one: 'passed_one',
    passed_house: 'passed_one',
    passed_senate: 'passed_one',
    passed_both: 'passed_both',
    enacted: 'became_law',
    became_law: 'became_law',
    signed: 'became_law',
    vetoed: 'president',
    failed: 'introduced',
  };
  return map[normalized] || 'introduced';
}

// ── Component ──

export default function BillPipeline({ bills, onStageClick, activeStage }: BillPipelineProps) {
  // Count bills per stage
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stage of STAGES) counts[stage.key] = 0;
    for (const bill of bills) {
      const key = bucketToStageKey(bill.status_bucket);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [bills]);

  const totalBills = bills.length;
  if (totalBills === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
    >
      <h3 className="font-heading text-sm font-bold text-white tracking-wide mb-4">
        Bill Pipeline
      </h3>

      {/* Pipeline stages */}
      <div className="flex items-stretch gap-1">
        {STAGES.map((stage, idx) => {
          const count = stageCounts[stage.key] || 0;
          const pct = totalBills > 0 ? Math.round((count / totalBills) * 100) : 0;
          const isActive = activeStage === stage.key;

          return (
            <React.Fragment key={stage.key}>
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: idx * 0.06 }}
                onClick={() => onStageClick(isActive ? '' : stage.key)}
                className={`flex-1 min-w-0 rounded-lg p-3 transition-all duration-200 text-center cursor-pointer border ${
                  isActive
                    ? 'border-opacity-60 ring-1'
                    : 'border-white/5 hover:border-white/15'
                }`}
                style={{
                  backgroundColor: isActive ? stage.bgAlpha : 'rgba(255,255,255,0.02)',
                  borderColor: isActive ? stage.color : undefined,
                  boxShadow: isActive ? `0 0 0 1px ${stage.color}` : undefined,
                }}
              >
                {/* Stage name */}
                <p
                  className="font-mono text-[10px] uppercase tracking-wider mb-1.5 truncate"
                  style={{ color: isActive ? stage.color : 'rgba(255,255,255,0.35)' }}
                >
                  {stage.label}
                </p>

                {/* Count */}
                <motion.p
                  className="font-heading text-2xl font-bold"
                  style={{ color: count > 0 ? stage.color : 'rgba(255,255,255,0.1)' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: idx * 0.06 + 0.2 }}
                >
                  <CountUp target={count} />
                </motion.p>

                {/* Percentage */}
                <p className="font-mono text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  {pct}%
                </p>
              </motion.button>

              {/* Arrow connector (not after last) */}
              {idx < STAGES.length - 1 && (
                <div className="flex items-center shrink-0 px-0.5">
                  <ChevronRight size={14} className="text-white/10" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Animated count ──

function CountUp({ target }: { target: number }) {
  const [value, setValue] = React.useState(0);

  React.useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const duration = 600; // ms
    const steps = Math.min(target, 30);
    const interval = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += Math.ceil(target / steps);
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      setValue(current);
    }, interval);
    return () => clearInterval(timer);
  }, [target]);

  return <>{value}</>;
}
