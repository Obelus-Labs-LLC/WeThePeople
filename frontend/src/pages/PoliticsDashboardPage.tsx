import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, FileText, Scale, ArrowRight, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { apiClient } from '../api/client';
import type { DashboardStats, Person, RecentAction } from '../api/types';
import SpotlightCard from '../components/SpotlightCard';
import DataFreshness from '../components/DataFreshness';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import { fmtNum } from '../utils/format';

// ── Helpers ──

const PARTY_COLORS: Record<string, string> = {
  D: '#3B82F6',
  R: '#EF4444',
  I: '#A855F7',
};

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

function chamberPct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

function ChamberBar({ label, breakdown }: { label: string; breakdown: ChamberBreakdown }) {
  const majority = Math.ceil(breakdown.total / 2) + 1;
  const dPct = chamberPct(breakdown.democrat, breakdown.total);
  const rPct = chamberPct(breakdown.republican, breakdown.total);
  const iPct = chamberPct(breakdown.independent, breakdown.total);
  const leading = breakdown.democrat > breakdown.republican ? 'D' : breakdown.republican > breakdown.democrat ? 'R' : 'Tied';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-white/70">
          {label}
        </h3>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-white/30">{breakdown.total} seats</span>
          <span className="font-mono text-[10px] text-white/20">|</span>
          <span className="font-mono text-[10px] text-white/30">{majority} for majority</span>
        </div>
      </div>
      <div className="flex h-8 overflow-hidden rounded-lg mb-2">
        {breakdown.democrat > 0 && (
          <div
            className="flex items-center justify-center transition-all duration-500"
            style={{ width: `${dPct}%`, backgroundColor: '#3B82F6' }}
          >
            {dPct > 12 && (
              <span className="font-mono text-[10px] font-bold text-white">{breakdown.democrat}</span>
            )}
          </div>
        )}
        {breakdown.independent > 0 && (
          <div
            className="flex items-center justify-center transition-all duration-500"
            style={{ width: `${iPct}%`, backgroundColor: '#A855F7' }}
          >
            {iPct > 5 && (
              <span className="font-mono text-[10px] font-bold text-white">{breakdown.independent}</span>
            )}
          </div>
        )}
        {breakdown.republican > 0 && (
          <div
            className="flex items-center justify-center transition-all duration-500"
            style={{ width: `${rPct}%`, backgroundColor: '#EF4444' }}
          >
            {rPct > 12 && (
              <span className="font-mono text-[10px] font-bold text-white">{breakdown.republican}</span>
            )}
          </div>
        )}
      </div>
      {/* Majority line + legend */}
      <div className="flex items-center gap-4 text-[10px]">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded" style={{ backgroundColor: '#3B82F6' }} />
          <span className="font-mono text-white/40">D {breakdown.democrat}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded" style={{ backgroundColor: '#EF4444' }} />
          <span className="font-mono text-white/40">R {breakdown.republican}</span>
        </div>
        {breakdown.independent > 0 && (
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded" style={{ backgroundColor: '#A855F7' }} />
            <span className="font-mono text-white/40">I {breakdown.independent}</span>
          </div>
        )}
        <span
          className={`ml-auto rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
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

  const headerRef = React.useRef<HTMLDivElement>(null);
  useInView(headerRef, { once: true, amount: 0.1 });

  useEffect(() => {
    Promise.all([
      apiClient.getDashboardStats(),
      apiClient.getPeople({ limit: 6, has_ledger: true }),
      apiClient.getRecentActions(5),
      // TODO: Use aggregate endpoint for party counts instead of fetching all people
      apiClient.getPeople({ limit: 600 }),
    ])
      .then(([s, p, a, all]) => {
        setStats(s);
        setPeople(p.people || []);
        setActions(a || []);
        setAllPeople(all.people || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const partyCounts = React.useMemo(() => {
    const counts: Record<string, number> = { D: 0, R: 0, I: 0 };
    allPeople.forEach((p) => {
      const key = p.party?.charAt(0);
      if (key && counts[key] !== undefined) counts[key]++;
    });
    return counts;
  }, [allPeople]);

  const house = useMemo(() => computeBreakdown(allPeople, 'house'), [allPeople]);
  const senate = useMemo(() => computeBreakdown(allPeople, 'senate'), [allPeople]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
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
    <div className="min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        {/* Navigation bar */}
        <motion.nav
          ref={headerRef}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <PoliticsSectorHeader />
        </motion.nav>

        {/* Hero Section — 2 columns */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mb-12">
          {/* Left: Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col justify-center"
          >
            <p className="font-heading text-xs font-semibold tracking-[0.3em] text-blue-400 uppercase mb-4">
              Congressional Transparency
            </p>
            <h1 className="font-heading text-3xl sm:text-5xl font-bold leading-[1.1] tracking-tight text-white lg:text-6xl">
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
              <a
                href="#balance-of-power"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('balance-of-power')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2.5 font-body text-sm font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white no-underline cursor-pointer"
              >
                Balance of Power
              </a>
            </div>
          </motion.div>

          {/* Right: 2x2 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {statCards.map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.2 + idx * 0.1 }}
              >
                <button
                  onClick={() => navigate(stat.to)}
                  className="group relative w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-all duration-300 hover:border-white/20 cursor-pointer text-left"
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
              </motion.div>
            ))}
          </div>
        </div>

        {/* Data Freshness */}
        <DataFreshness />

        {/* Balance of Power — Party Distribution */}
        {allPeople.length > 0 && (
          <motion.div
            id="balance-of-power"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <SpotlightCard
              className="rounded-xl border border-white/10 bg-white/[0.03] mb-12"
              spotlightColor="rgba(59, 130, 246, 0.10)"
            >
              <div className="p-6 space-y-6">
                {/* Total */}
                <div>
                  <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white mb-4">
                    Balance of Power
                  </h2>
                  <div className="flex h-8 overflow-hidden rounded-lg">
                    {[
                      { key: 'D', label: 'Dem', color: '#3B82F6' },
                      { key: 'I', label: 'Ind', color: '#A855F7' },
                      { key: 'R', label: 'Rep', color: '#EF4444' },
                    ].map(({ key, label, color }) => {
                      const count = partyCounts[key] || 0;
                      const total = allPeople.length || 1;
                      const pctVal = (count / total) * 100;
                      if (pctVal === 0) return null;
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-center transition-all"
                          style={{ width: `${pctVal}%`, backgroundColor: color }}
                        >
                          {pctVal > 8 && (
                            <span className="font-mono text-[10px] font-bold text-white/90 uppercase">
                              {label} {count}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="font-mono text-[10px] text-white/20 mt-2">
                    Total Congress &mdash; {allPeople.length} members
                  </p>
                </div>

                {/* Divider */}
                <div className="border-t border-white/5" />

                {/* House */}
                <ChamberBar label="House of Representatives" breakdown={house} />

                {/* Divider */}
                <div className="border-t border-white/5" />

                {/* Senate */}
                <ChamberBar label="Senate" breakdown={senate} />
              </div>
            </SpotlightCard>
          </motion.div>
        )}

        {/* Sub-dashboard links */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-12"
        >
          {[
            { to: '/politics/people', label: 'Representatives', desc: 'Full member directory', color: '#3B82F6' },
            { to: '/politics/activity', label: 'Activity Feed', desc: 'Latest legislative actions', color: '#F59E0B' },
            { to: '/politics/legislation', label: 'Legislation', desc: 'Bills & voting tracker', color: '#10B981' },
            { to: '/politics/compare', label: 'Compare', desc: 'Side-by-side member analysis', color: '#A855F7' },
            { to: '/politics/states', label: 'Explore by State', desc: 'State legislatures & bills', color: '#06B6D4' },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-white/20 no-underline"
            >
              <p className="font-heading text-sm font-bold uppercase tracking-wider" style={{ color: link.color }}>
                {link.label}
              </p>
              <p className="font-body text-xs text-white/30 mt-1">{link.desc}</p>
            </Link>
          ))}
        </motion.div>

        {/* Two columns: Featured Members + Recent Activity */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Featured Members */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
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
                <motion.div
                  key={person.person_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.85 + idx * 0.06 }}
                >
                  <Link
                    to={`/politics/people/${person.person_id}`}
                    className="block no-underline"
                  >
                    <SpotlightCard
                      className="rounded-xl border border-white/10 bg-white/[0.03]"
                      spotlightColor="rgba(255, 255, 255, 0.10)"
                    >
                      <div className="flex items-center gap-4 p-4">
                        {person.photo_url ? (
                          <img
                            src={person.photo_url}
                            alt={person.display_name}
                            className="h-11 w-11 rounded-full object-cover ring-2 ring-white/10"
                          />
                        ) : (
                          <div
                            className="flex h-11 w-11 items-center justify-center rounded-full font-heading text-sm font-bold text-white ring-2 ring-white/10"
                            style={{ backgroundColor: partyColor(person.party) + '33' }}
                          >
                            {person.display_name.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-sm font-semibold text-white truncate">
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
                      </div>
                    </SpotlightCard>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
          >
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
            <SpotlightCard
              className="rounded-xl border border-white/10 bg-white/[0.03]"
              spotlightColor="rgba(245, 158, 11, 0.10)"
            >
              <div className="divide-y divide-white/5">
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
            </SpotlightCard>
          </motion.div>
        </div>

        {/* Data Sources */}
        <div className="border-t border-white/10 pt-6 mt-8">
          <span className="font-mono text-xs font-bold tracking-[0.2em] uppercase text-white/30">Data Sources</span>
          <div className="flex flex-wrap gap-x-8 gap-y-3 mt-4">
            {['Congress.gov (Bills, Votes, Actions)', 'Senate LDA (Lobbying Disclosures)', 'USASpending.gov (Gov Contracts)', 'FEC (Donations, PAC Data)', 'House Clerk Disclosures (Financial Disclosures)', 'Quiver Quantitative (Congressional Trades)', 'Federal Register (Enforcement, Rulemaking)', 'Google Civic API (Rep Lookup)', 'OpenStates (State Legislators)', 'Senate.gov (Roll Call Votes)', 'Wikipedia (Politician Profiles)', 'SAM.gov (Contractor Exclusions)', 'Regulations.gov (Regulatory Comments)'].map((source) => (
              <div key={source} className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
                <span className="w-1.5 h-1.5 rounded-sm bg-zinc-600" />
                <span className="font-mono text-xs font-semibold tracking-wider uppercase text-zinc-300">{source}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <Link to="/" className="font-body text-sm text-white/50 hover:text-white transition-colors no-underline">
            &larr; All Sectors
          </Link>
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}
