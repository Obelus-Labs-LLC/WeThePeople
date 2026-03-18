import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, X } from 'lucide-react';
import type { TradeMarker } from '../api/influence';

// ── Helpers ──

const PARTY_COLORS: Record<string, string> = { D: '#3B82F6', R: '#EF4444', I: '#A855F7' };

function partyColor(party: string | null): string {
  return PARTY_COLORS[party?.charAt(0) || ''] || '#6B7280';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Group trades by month for the timeline axis labels. */
function monthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Component ──

interface TradeTimelineProps {
  trades: TradeMarker[];
  ticker: string;
}

export default function TradeTimeline({ trades, ticker }: TradeTimelineProps) {
  const [selected, setSelected] = useState<TradeMarker | null>(null);

  // Filter to only trades with valid dates and sort
  const sortedTrades = useMemo(() => {
    return trades
      .filter((t) => t.date)
      .sort((a, b) => a.date!.localeCompare(b.date!));
  }, [trades]);

  // Compute date range for positioning
  const { minTime, maxTime, months } = useMemo(() => {
    if (sortedTrades.length === 0) return { minTime: 0, maxTime: 1, months: [] };
    const times = sortedTrades.map((t) => new Date(t.date! + 'T00:00:00').getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    // Pad by 5% on each side
    const padding = Math.max((max - min) * 0.05, 86400000); // at least 1 day
    const paddedMin = min - padding;
    const paddedMax = max + padding;

    // Generate month labels
    const monthSet: { label: string; position: number }[] = [];
    const seen = new Set<string>();
    for (const t of sortedTrades) {
      const label = monthLabel(t.date!);
      if (!seen.has(label)) {
        seen.add(label);
        const time = new Date(t.date! + 'T00:00:00').getTime();
        const pos = ((time - paddedMin) / (paddedMax - paddedMin)) * 100;
        monthSet.push({ label, position: pos });
      }
    }
    return { minTime: paddedMin, maxTime: paddedMax, months: monthSet };
  }, [sortedTrades]);

  if (sortedTrades.length === 0) return null;

  // Summary counts
  const purchases = sortedTrades.filter((t) => t.transaction_type === 'purchase').length;
  const sales = sortedTrades.filter((t) => t.transaction_type === 'sale').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-heading text-sm font-bold text-white tracking-wide">
            Trade Timeline
          </h3>
          <span className="font-mono text-xs text-white/30">{ticker}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            {purchases} Buy{purchases !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-red-400">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            {sales} Sale{sales !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Timeline track */}
      <div className="relative h-20">
        {/* Center line */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-white/10" />

        {/* Month labels */}
        <div className="absolute left-0 right-0 bottom-0">
          {months.map((m) => (
            <span
              key={m.label}
              className="absolute font-mono text-[9px] text-white/20 -translate-x-1/2"
              style={{ left: `${m.position}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {/* Trade dots */}
        {sortedTrades.map((trade, idx) => {
          const time = new Date(trade.date! + 'T00:00:00').getTime();
          const pos = ((time - minTime) / (maxTime - minTime)) * 100;
          const isBuy = trade.transaction_type === 'purchase';
          const isSelected = selected === trade;

          return (
            <motion.button
              key={`${trade.date}-${trade.person_id}-${trade.transaction_type}-${idx}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: idx * 0.03 }}
              onClick={() => setSelected(isSelected ? null : trade)}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 group focus:outline-none"
              style={{ left: `${pos}%` }}
              title={`${trade.display_name} — ${trade.transaction_type} ${trade.amount_range || ''}`}
            >
              {/* Glow ring on hover/select */}
              <span
                className={`absolute inset-0 rounded-full transition-all duration-200 ${
                  isSelected
                    ? isBuy
                      ? 'ring-2 ring-emerald-500/50'
                      : 'ring-2 ring-red-500/50'
                    : ''
                }`}
              />
              {/* Dot */}
              <span
                className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full transition-transform group-hover:scale-125 ${
                  isBuy
                    ? 'bg-emerald-500/90 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                    : 'bg-red-500/90 shadow-[0_0_6px_rgba(239,68,68,0.4)]'
                }`}
              >
                {isBuy ? (
                  <TrendingUp className="w-2.5 h-2.5 text-white" />
                ) : (
                  <TrendingDown className="w-2.5 h-2.5 text-white" />
                )}
              </span>
              {/* Party dot */}
              {trade.party && (
                <span
                  className="absolute -top-1 -right-1 h-2 w-2 rounded-full border border-black/40"
                  style={{ backgroundColor: partyColor(trade.party) }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Detail popover */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: partyColor(selected.party) }}
                  />
                  <span className="text-sm font-medium text-white">{selected.display_name}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      selected.transaction_type === 'purchase'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {selected.transaction_type === 'purchase' ? (
                      <TrendingUp className="w-2.5 h-2.5" />
                    ) : (
                      <TrendingDown className="w-2.5 h-2.5" />
                    )}
                    {selected.transaction_type}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/40">
                  <span>{selected.date ? formatDateFull(selected.date) : '—'}</span>
                  {selected.amount_range && (
                    <span className="font-mono text-white/50">{selected.amount_range}</span>
                  )}
                  {selected.reporting_gap && (
                    <span className="text-yellow-400/80">
                      Filed {selected.reporting_gap} later
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-white/20 hover:text-white/50 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
