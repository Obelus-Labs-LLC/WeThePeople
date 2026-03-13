import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, Scale, Activity, FileText } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Person, DashboardStats } from '../api/types';
import BackButton from '../components/BackButton';

// ── Helpers ──

interface ChamberBreakdown {
  total: number;
  democrat: number;
  republican: number;
  independent: number;
}

function computeBreakdown(people: Person[], chamber: 'house' | 'senate'): ChamberBreakdown {
  const filtered = people.filter((p) =>
    chamber === 'house'
      ? p.chamber.toLowerCase().includes('house') || p.chamber.toLowerCase() === 'lower'
      : p.chamber.toLowerCase().includes('senate') || p.chamber.toLowerCase() === 'upper'
  );
  let democrat = 0, republican = 0, independent = 0;
  filtered.forEach((p) => {
    const party = p.party?.charAt(0);
    if (party === 'D') democrat++;
    else if (party === 'R') republican++;
    else independent++;
  });
  return { total: filtered.length, democrat, republican, independent };
}

function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

// ── Bar Chart Component ──

function PartyBar({ label, breakdown }: { label: string; breakdown: ChamberBreakdown }) {
  const majority = Math.ceil(breakdown.total / 2) + 1;
  const dPct = pct(breakdown.democrat, breakdown.total);
  const rPct = pct(breakdown.republican, breakdown.total);
  const iPct = pct(breakdown.independent, breakdown.total);
  const leading = breakdown.democrat > breakdown.republican ? 'D' : breakdown.republican > breakdown.democrat ? 'R' : 'Tied';

  return (
    <div
      className="rounded-xl border border-white/5 p-6"
      style={{ backgroundColor: '#0F172A' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-lg font-bold uppercase tracking-wider text-white">
          {label}
        </h3>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-white/30">{breakdown.total} seats</span>
          <span className="font-mono text-xs text-white/20">|</span>
          <span className="font-mono text-xs text-white/30">{majority} for majority</span>
        </div>
      </div>

      {/* Stacked horizontal bar */}
      <div className="flex h-12 overflow-hidden rounded-lg mb-4">
        {breakdown.democrat > 0 && (
          <div
            className="flex items-center justify-center transition-all duration-500"
            style={{ width: `${dPct}%`, backgroundColor: '#3B82F6' }}
          >
            {dPct > 12 && (
              <span className="font-mono text-sm font-bold text-white">{breakdown.democrat}</span>
            )}
          </div>
        )}
        {breakdown.independent > 0 && (
          <div
            className="flex items-center justify-center transition-all duration-500"
            style={{ width: `${iPct}%`, backgroundColor: '#A855F7' }}
          >
            {iPct > 5 && (
              <span className="font-mono text-sm font-bold text-white">{breakdown.independent}</span>
            )}
          </div>
        )}
        {breakdown.republican > 0 && (
          <div
            className="flex items-center justify-center transition-all duration-500"
            style={{ width: `${rPct}%`, backgroundColor: '#EF4444' }}
          >
            {rPct > 12 && (
              <span className="font-mono text-sm font-bold text-white">{breakdown.republican}</span>
            )}
          </div>
        )}
      </div>

      {/* Majority line indicator */}
      <div className="relative h-1 rounded-full bg-white/5 mb-4">
        <div
          className="absolute top-[-4px] h-[12px] w-px bg-white/40"
          style={{ left: '50%' }}
        />
        <span
          className="absolute top-3 font-mono text-[9px] text-white/20 -translate-x-1/2"
          style={{ left: '50%' }}
        >
          MAJORITY
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-6">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: '#3B82F6' }} />
          <span className="font-body text-xs text-white/50">Democrat</span>
          <span className="font-mono text-xs font-bold text-white">{breakdown.democrat}</span>
          <span className="font-mono text-[10px] text-white/20">({dPct.toFixed(1)}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: '#EF4444' }} />
          <span className="font-body text-xs text-white/50">Republican</span>
          <span className="font-mono text-xs font-bold text-white">{breakdown.republican}</span>
          <span className="font-mono text-[10px] text-white/20">({rPct.toFixed(1)}%)</span>
        </div>
        {breakdown.independent > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#A855F7' }} />
            <span className="font-body text-xs text-white/50">Independent</span>
            <span className="font-mono text-xs font-bold text-white">{breakdown.independent}</span>
          </div>
        )}
        <span
          className={`ml-auto rounded-full px-3 py-1 font-mono text-xs font-bold ${
            leading === 'D'
              ? 'bg-blue-500/15 text-blue-400'
              : leading === 'R'
                ? 'bg-red-500/15 text-red-400'
                : 'bg-white/10 text-white/50'
          }`}
        >
          {leading === 'D' ? 'DEM MAJORITY' : leading === 'R' ? 'GOP MAJORITY' : 'SPLIT'}
        </span>
      </div>
    </div>
  );
}

// ── Page ──

export default function BalanceOfPowerPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.getPeople({ limit: 600 }),
      apiClient.getDashboardStats(),
    ])
      .then(([pRes, sRes]) => {
        setPeople(pRes.people || []);
        setStats(sRes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const house = useMemo(() => computeBreakdown(people, 'house'), [people]);
  const senate = useMemo(() => computeBreakdown(people, 'senate'), [people]);
  const total = useMemo(() => ({
    total: people.length,
    democrat: house.democrat + senate.democrat,
    republican: house.republican + senate.republican,
    independent: house.independent + senate.independent,
  }), [people, house, senate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: '#020617' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#020617' }}>
      {/* Subtle glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(16,185,129,0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Header */}
        <div className="mb-10 animate-fade-up">
          <div className="mb-3">
            <BackButton to="/politics" label="Dashboard" />
          </div>
          <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white">
            Balance of Power
          </h1>
          <p className="mt-1 font-body text-sm text-white/40">
            Party composition across the 119th Congress
          </p>
        </div>

        {/* Overall stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-10">
          {[
            { label: 'Total Members', value: total.total.toString(), icon: Users, color: '#3B82F6' },
            { label: 'Democrats', value: total.democrat.toString(), icon: Scale, color: '#3B82F6' },
            { label: 'Republicans', value: total.republican.toString(), icon: Scale, color: '#EF4444' },
            { label: 'Independent', value: total.independent.toString(), icon: Scale, color: '#A855F7' },
          ].map((stat, idx) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/5 p-5 animate-scale-in"
              style={{ backgroundColor: '#0F172A', animationDelay: `${100 + idx * 80}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-heading text-[10px] font-semibold tracking-wider text-white/30 uppercase">
                  {stat.label}
                </span>
                <stat.icon size={16} style={{ color: stat.color }} className="opacity-40" />
              </div>
              <span className="font-mono text-3xl font-bold text-white">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Chamber breakdowns */}
        <div className="space-y-6 mb-12">
          <div className="animate-fade-up" style={{ animationDelay: '400ms' }}>
            <PartyBar label="House of Representatives" breakdown={house} />
          </div>
          <div className="animate-fade-up" style={{ animationDelay: '500ms' }}>
            <PartyBar label="Senate" breakdown={senate} />
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 animate-fade-up" style={{ animationDelay: '700ms' }}>
          {[
            { to: '/politics/people', label: 'Browse All Members', desc: 'Full directory with search and filters', icon: Users, color: '#3B82F6' },
            { to: '/politics/activity', label: 'Activity Feed', desc: 'Latest legislative actions and votes', icon: Activity, color: '#F59E0B' },
            { to: '/politics/compare', label: 'Compare Members', desc: 'Side-by-side accountability analysis', icon: FileText, color: '#A855F7' },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group flex items-start gap-4 rounded-xl border border-white/5 p-5 transition-all hover:border-white/15 no-underline"
              style={{ backgroundColor: '#0F172A' }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
                style={{ backgroundColor: `${link.color}15` }}
              >
                <link.icon size={18} style={{ color: link.color }} />
              </div>
              <div>
                <p className="font-body text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                  {link.label}
                </p>
                <p className="mt-0.5 font-body text-xs text-white/30">{link.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <Link to="/politics" className="font-body text-xs text-white/20 hover:text-white/40 transition-colors no-underline">
            &larr; Dashboard
          </Link>
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}
