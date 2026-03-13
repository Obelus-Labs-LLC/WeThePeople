import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, FileText, Vote, Scale, ArrowRight, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { apiClient } from '../api/client';
import type { DashboardStats, Person, RecentAction } from '../api/types';
import BackButton from '../components/BackButton';

// ── Helpers ──

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const PARTY_COLORS: Record<string, string> = {
  D: '#3B82F6',
  R: '#EF4444',
  I: '#A855F7',
};

function partyColor(party: string): string {
  return PARTY_COLORS[party?.charAt(0)] || '#6B7280';
}

function partyLabel(party: string): string {
  const p = party?.charAt(0);
  if (p === 'D') return 'Democrat';
  if (p === 'R') return 'Republican';
  if (p === 'I') return 'Independent';
  return party;
}

// ── Page ──

export default function PoliticsDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAction, setExpandedAction] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      apiClient.getDashboardStats(),
      apiClient.getPeople({ limit: 6, has_ledger: true }),
      apiClient.getRecentActions(5),
      apiClient.getPeople({ limit: 600 }),
    ])
      .then(([s, p, a, all]) => {
        setStats(s);
        setPeople(p.people || []);
        setActions(a || []);
        setAllPeople(all.people || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Compute party counts from all people
  const partyCounts = React.useMemo(() => {
    const counts: Record<string, number> = { D: 0, R: 0, I: 0 };
    allPeople.forEach((p) => {
      const key = p.party?.charAt(0);
      if (key && counts[key] !== undefined) counts[key]++;
    });
    return counts;
  }, [allPeople]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: '#020617' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const statCards = [
    { label: 'Members Tracked', value: fmtNum(stats?.total_people || 0), icon: Users, color: '#3B82F6', to: '/politics/people' },
    { label: 'Legislative Actions', value: fmtNum(stats?.total_claims || 0), icon: Activity, color: '#F59E0B', to: '/politics/activity' },
    { label: 'Actions Monitored', value: fmtNum(stats?.total_actions || 0), icon: FileText, color: '#10B981', to: '/politics/activity' },
    { label: 'Bills Tracked', value: fmtNum(stats?.total_bills || 0), icon: Scale, color: '#EF4444', to: '/politics/activity' },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#020617' }}>
      {/* Neon glow background effect */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,0.12) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Navigation bar */}
        <nav className="flex items-center justify-between mb-10 animate-fade-up">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 no-underline">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500 font-heading text-sm font-black text-white">
                WP
              </div>
              <span className="font-heading text-lg font-bold text-white tracking-wide">POLITICS</span>
            </Link>
          </div>
          <div className="flex items-center gap-1">
            {[
              { label: 'Sectors', to: '/' },
              { label: 'Dashboard', to: '/politics', active: true },
              { label: 'People', to: '/politics/people' },
              { label: 'Activity', to: '/politics/activity' },
              { label: 'Power', to: '/politics/power' },
              { label: 'Compare', to: '/politics/compare' },
            ].map((link) => (
              <Link
                key={link.label}
                to={link.to}
                className={`rounded-lg px-3 py-1.5 font-body text-sm font-medium transition-colors no-underline ${
                  link.active
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Hero Section — 2 columns */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mb-12">
          {/* Left: Headline */}
          <div className="flex flex-col justify-center animate-fade-up" style={{ animationDelay: '100ms' }}>
            <p className="font-heading text-xs font-semibold tracking-[0.3em] text-blue-400 uppercase mb-4">
              Congressional Transparency
            </p>
            <h1 className="font-heading text-5xl font-bold leading-[1.1] tracking-tight text-white lg:text-6xl">
              Tracking What
              <br />
              Politicians{' '}
              <span className="text-blue-400">Do</span>
            </h1>
            <p className="mt-4 max-w-lg font-body text-lg text-white/50 leading-relaxed">
              Real voting records, legislative actions, and financial data for every member of Congress.
              Real votes. Real data. No spin.
            </p>
            <div className="mt-8 flex gap-3">
              <Link
                to="/politics/people"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-blue-600 no-underline"
              >
                Browse Members
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/politics/power"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2.5 font-body text-sm font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white no-underline"
              >
                Balance of Power
              </Link>
            </div>
          </div>

          {/* Right: 2x2 Stat Cards — CLICKABLE */}
          <div className="grid grid-cols-2 gap-4">
            {statCards.map((stat, idx) => (
              <button
                key={stat.label}
                onClick={() => navigate(stat.to)}
                className="group relative overflow-hidden rounded-xl border border-white/5 p-6 transition-all duration-300 hover:border-white/10 animate-scale-in cursor-pointer text-left"
                style={{ backgroundColor: '#0F172A', animationDelay: `${200 + idx * 100}ms` }}
              >
                <div className="absolute left-0 top-0 h-full w-[3px] opacity-0 transition-opacity group-hover:opacity-100" style={{ backgroundColor: stat.color }} />
                <div className="flex items-center justify-between mb-3">
                  <span className="font-heading text-[10px] font-semibold tracking-wider text-white/40 uppercase">
                    {stat.label}
                  </span>
                  <stat.icon size={18} style={{ color: stat.color }} className="opacity-60" />
                </div>
                <span className="font-mono text-3xl font-bold text-white tracking-tight">
                  {stat.value}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Party Distribution Bar */}
        {allPeople.length > 0 && (
          <div
            className="rounded-xl border border-white/5 p-6 mb-12 animate-fade-up"
            style={{ backgroundColor: '#0F172A', animationDelay: '600ms' }}
          >
            <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white mb-4">
              Party Distribution
            </h2>
            <div className="flex h-8 overflow-hidden rounded-lg">
              {[
                { key: 'D', label: 'Dem', color: '#3B82F6' },
                { key: 'I', label: 'Ind', color: '#A855F7' },
                { key: 'R', label: 'Rep', color: '#EF4444' },
              ].map(({ key, label, color }) => {
                const count = partyCounts[key] || 0;
                const total = allPeople.length || 1;
                const pct = (count / total) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-center transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  >
                    {pct > 8 && (
                      <span className="font-mono text-[10px] font-bold text-white/90 uppercase">
                        {label} {count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sub-dashboard links */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-12 animate-fade-up" style={{ animationDelay: '700ms' }}>
          {[
            { to: '/politics/people', label: 'Representatives', desc: 'Full member directory', color: '#3B82F6', borderColor: 'rgba(59,130,246,0.3)' },
            { to: '/politics/activity', label: 'Activity Feed', desc: 'Latest legislative actions', color: '#F59E0B', borderColor: 'rgba(245,158,11,0.3)' },
            { to: '/politics/power', label: 'Balance of Power', desc: 'Party analytics & breakdown', color: '#10B981', borderColor: 'rgba(16,185,129,0.3)' },
            { to: '/politics/compare', label: 'Compare', desc: 'Side-by-side member analysis', color: '#A855F7', borderColor: 'rgba(168,85,247,0.3)' },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group rounded-xl border p-4 transition-all no-underline"
              style={{ borderColor: link.borderColor, backgroundColor: `${link.color}08` }}
            >
              <p className="font-heading text-sm font-bold uppercase tracking-wider" style={{ color: link.color }}>
                {link.label}
              </p>
              <p className="font-body text-xs text-white/30 mt-1">{link.desc}</p>
            </Link>
          ))}
        </div>

        {/* Two columns: Featured Members + Recent Activity */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Featured Members */}
          <div className="animate-fade-up" style={{ animationDelay: '800ms' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white">
                Featured Members
              </h2>
              <Link
                to="/politics/people"
                className="font-body text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors no-underline"
              >
                View all &rarr;
              </Link>
            </div>
            <div className="space-y-3">
              {people.map((person, idx) => (
                <Link
                  key={person.person_id}
                  to={`/politics/people/${person.person_id}`}
                  className="group flex items-center gap-4 rounded-xl border border-white/5 p-4 transition-all hover:border-white/10 no-underline animate-fade-up"
                  style={{ backgroundColor: '#0F172A', animationDelay: `${850 + idx * 60}ms` }}
                >
                  {person.photo_url ? (
                    <img
                      src={person.photo_url}
                      alt={person.display_name}
                      className="h-11 w-11 rounded-full object-cover grayscale transition-all group-hover:grayscale-0"
                    />
                  ) : (
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full font-heading text-sm font-bold text-white"
                      style={{ backgroundColor: partyColor(person.party) + '33' }}
                    >
                      {person.display_name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-sm font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
                      {person.display_name}
                    </p>
                    <p className="font-mono text-[11px] text-white/30">{person.state}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                      style={{
                        backgroundColor: partyColor(person.party) + '22',
                        color: partyColor(person.party),
                      }}
                    >
                      {partyLabel(person.party)}
                    </span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/40">
                      {person.chamber?.toLowerCase().includes('senate') ? 'Senate' : 'House'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity — expandable items */}
          <div className="animate-fade-up" style={{ animationDelay: '900ms' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white">
                Recent Activity
              </h2>
              <Link
                to="/politics/activity"
                className="font-body text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors no-underline"
              >
                Full feed &rarr;
              </Link>
            </div>
            <div
              className="rounded-xl border border-white/5 divide-y divide-white/5"
              style={{ backgroundColor: '#0F172A' }}
            >
              {actions.map((action) => {
                const isExpanded = expandedAction === action.id;
                const billUrl = action.bill_type && action.bill_number && action.bill_congress
                  ? `https://www.congress.gov/bill/${action.bill_congress}th-congress/${action.bill_type === 'hr' ? 'house-bill' : action.bill_type === 's' ? 'senate-bill' : action.bill_type}/${action.bill_number}`
                  : null;

                return (
                  <button
                    key={action.id}
                    onClick={() => setExpandedAction(isExpanded ? null : action.id)}
                    className="w-full p-4 text-left cursor-pointer transition-colors hover:bg-white/[0.02]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={`font-body text-sm font-medium text-white/90 ${isExpanded ? '' : 'truncate'}`}>
                          {action.title}
                        </p>
                        {action.summary && (
                          <p className={`mt-1 font-body text-xs text-white/40 leading-relaxed ${isExpanded ? '' : 'line-clamp-1'}`}>
                            {action.summary}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[10px] text-white/20">
                            {action.person_id.replace(/_/g, ' ')}
                          </span>
                          {action.bill_type && action.bill_number && (
                            billUrl ? (
                              <a
                                href={billUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-400 hover:bg-blue-500/20 transition-colors no-underline"
                              >
                                {action.bill_type.toUpperCase()} {action.bill_number} &rarr;
                              </a>
                            ) : (
                              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-400">
                                {action.bill_type.toUpperCase()} {action.bill_number}
                              </span>
                            )
                          )}
                          {isExpanded && action.source_url && (
                            <a
                              href={action.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/40 hover:text-white/60 transition-colors no-underline"
                            >
                              Source &rarr;
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {action.date && (
                          <span className="font-mono text-[10px] text-white/20 tabular-nums">
                            {new Date(action.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp size={12} className="text-white/20" />
                        ) : (
                          <ChevronDown size={12} className="text-white/20" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <BackButton to="/" label="All Sectors" />
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}
