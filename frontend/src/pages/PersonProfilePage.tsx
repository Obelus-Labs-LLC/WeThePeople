import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import BackButton from '../components/BackButton';
import { ExternalLink, Heart } from 'lucide-react';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import type {
  Person,
  PersonProfile,
  PersonPerformance,
  PersonStats,
  PersonActivityResponse,
  PersonActivityEntry,
  PersonVotesResponse,
  PersonVoteEntry,
  PersonFinance,
  PersonGraphResponse,
  GraphConnection,
} from '../api/types';

// ── Constants ──

const PARTY_COLORS: Record<string, string> = { D: '#3B82F6', R: '#EF4444', I: '#A855F7' };

/**
 * Generate a campaign contribution link based on party affiliation.
 * Democrats → ActBlue search, Republicans → WinRed search, Others → FEC candidate page.
 */
function getCampaignUrl(name: string, party: string): string {
  const q = encodeURIComponent(name);
  const p = party?.charAt(0);
  if (p === 'D') return `https://secure.actblue.com/search?q=${q}`;
  if (p === 'R') return `https://secure.winred.com/search?query=${q}`;
  return `https://www.fec.gov/data/candidates/?search=${q}`;
}

const TIER_COLORS: Record<string, string> = {
  strong: '#10B981',
  moderate: '#3B82F6',
  weak: '#F59E0B',
  none: '#EF4444',
};

type TabKey = 'overview' | 'legislation' | 'votes' | 'finance' | 'donors' | 'trades';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'legislation', label: 'Legislation' },
  { key: 'votes', label: 'Voting Record' },
  { key: 'finance', label: 'Finance' },
  { key: 'donors', label: 'Industry Donors' },
  { key: 'trades', label: 'Stock Trades' },
];

// ── Helpers ──

function partyColor(party: string): string {
  return PARTY_COLORS[party?.charAt(0)] || '#6B7280';
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function chamberLabel(chamber: string): string {
  if (!chamber) return '';
  const c = chamber.toLowerCase();
  if (c.includes('senate') || c === 'upper') return 'Senate';
  return 'House';
}

function partyLabel(party: string): string {
  const map: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };
  return map[party?.charAt(0)] || party;
}

function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

// ── Loading Spinner ──

function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  );
}

// ── Section Error ──

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
      {message}
    </div>
  );
}

// ── Card wrapper ──

function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[rgba(255,255,255,0.05)] p-6 transition-all duration-300 hover:border-[rgba(255,255,255,0.1)] ${className}`}
      style={{ backgroundColor: '#0F172A' }}
    >
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-heading text-xl font-bold uppercase tracking-wide text-white mb-4">
      {children}
    </h3>
  );
}

// ══════════════════════════════════════════════
//  PersonProfilePage
// ══════════════════════════════════════════════

export default function PersonProfilePage() {
  const { person_id } = useParams<{ person_id: string }>();

  // ── State: basic person info ──
  const [person, setPerson] = useState<Person | null>(null);

  // ── State: overview data (loaded on mount) ──
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [performance, setPerformance] = useState<PersonPerformance | null>(null);
  const [performanceError, setPerformanceError] = useState(false);
  const [stats, setStats] = useState<PersonStats | null>(null);
  const [graph, setGraph] = useState<PersonGraphResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // ── State: legislation tab ──
  const [activity, setActivity] = useState<PersonActivityResponse | null>(null);
  const [activityEntries, setActivityEntries] = useState<PersonActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'sponsored' | 'cosponsored'>('all');

  // ── State: votes tab ──
  const [votesData, setVotesData] = useState<PersonVotesResponse | null>(null);
  const [voteEntries, setVoteEntries] = useState<PersonVoteEntry[]>([]);
  const [votesLoading, setVotesLoading] = useState(false);
  const [voteFilter, setVoteFilter] = useState<string>('all');

  // ── State: finance tab ──
  const [finance, setFinance] = useState<PersonFinance | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);

  // ── State: trades tab ──
  const [trades, setTrades] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  // ── Tabs ──
  const [tab, setTab] = useState<TabKey>('overview');
  const [loadedTabs, setLoadedTabs] = useState<Set<TabKey>>(new Set(['overview']));

  // ── Mark tab loaded ──
  const markLoaded = useCallback((t: TabKey) => {
    setLoadedTabs((prev) => new Set(prev).add(t));
  }, []);

  // ── Load basic person info ──
  useEffect(() => {
    if (!person_id) return;
    apiClient
      .getPeople({ q: person_id, limit: 10 })
      .then((res) => {
        const match = res.people.find((p) => p.person_id === person_id);
        if (match) setPerson(match);
        else if (res.people.length > 0) setPerson(res.people[0]);
      })
      .catch(() => {});
  }, [person_id]);

  // ── Load overview data on mount ──
  useEffect(() => {
    if (!person_id) return;
    setOverviewLoading(true);

    const profileP = apiClient
      .getPersonProfile(person_id)
      .then((r) => {
        setProfile(r);
        setProfileError(false);
      })
      .catch(() => setProfileError(true));

    const perfP = apiClient
      .getPersonPerformance(person_id)
      .then((r) => {
        setPerformance(r);
        setPerformanceError(false);
      })
      .catch(() => setPerformanceError(true));

    const statsP = apiClient.getPersonStats(person_id).then(setStats).catch(() => {});

    const graphP = apiClient.getPersonGraph(person_id, 5).then(setGraph).catch(() => {});

    // Eagerly load activity + votes for stat pills in header
    const actP = apiClient
      .getPersonActivity(person_id, { limit: 50 })
      .then((res) => {
        setActivity(res);
        setActivityEntries(res.entries || []);
        markLoaded('legislation');
      })
      .catch(() => {});

    const votesP = apiClient
      .getPersonVotes(person_id, { limit: 50 })
      .then((res) => {
        setVotesData(res);
        setVoteEntries(res.votes || []);
        markLoaded('votes');
      })
      .catch(() => {});

    Promise.all([profileP, perfP, statsP, graphP, actP, votesP]).finally(() => setOverviewLoading(false));
  }, [person_id]);

  // ── Lazy load: legislation ──
  useEffect(() => {
    if (tab !== 'legislation' || !person_id || loadedTabs.has('legislation')) return;
    setActivityLoading(true);
    apiClient
      .getPersonActivity(person_id, { limit: 50 })
      .then((res) => {
        setActivity(res);
        setActivityEntries(res.entries || []);
        markLoaded('legislation');
      })
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  }, [tab, person_id, loadedTabs, markLoaded]);

  // ── Lazy load: votes ──
  useEffect(() => {
    if (tab !== 'votes' || !person_id || loadedTabs.has('votes')) return;
    setVotesLoading(true);
    apiClient
      .getPersonVotes(person_id, { limit: 50 })
      .then((res) => {
        setVotesData(res);
        setVoteEntries(res.votes || []);
        markLoaded('votes');
      })
      .catch(() => {})
      .finally(() => setVotesLoading(false));
  }, [tab, person_id, loadedTabs, markLoaded]);

  // ── Lazy load: finance ──
  useEffect(() => {
    if (tab !== 'finance' || !person_id || loadedTabs.has('finance')) return;
    setFinanceLoading(true);
    apiClient
      .getPersonFinance(person_id)
      .then((res) => {
        setFinance(res);
        markLoaded('finance');
      })
      .catch(() => {})
      .finally(() => setFinanceLoading(false));
  }, [tab, person_id, loadedTabs, markLoaded]);

  // ── Lazy load: trades ──
  useEffect(() => {
    if (tab !== 'trades' || !person_id || loadedTabs.has('trades')) return;
    setTradesLoading(true);
    fetch(`/api/people/${person_id}/trades?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setTrades(data.trades || []);
        markLoaded('trades');
      })
      .catch(() => setTrades([]))
      .finally(() => setTradesLoading(false));
  }, [tab, person_id, loadedTabs, markLoaded]);

  // ── Load more: legislation ──
  const loadMoreActivity = useCallback(() => {
    if (!person_id || !activity) return;
    const nextOffset = activityEntries.length;
    if (nextOffset >= activity.total) return;
    setActivityLoading(true);
    apiClient
      .getPersonActivity(person_id, { limit: 50, offset: nextOffset })
      .then((res) => {
        setActivityEntries((prev) => [...prev, ...(res.entries || [])]);
      })
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  }, [person_id, activity, activityEntries.length]);

  // ── Load more: votes ──
  const loadMoreVotes = useCallback(() => {
    if (!person_id || !votesData) return;
    const nextOffset = voteEntries.length;
    if (nextOffset >= votesData.total) return;
    setVotesLoading(true);
    apiClient
      .getPersonVotes(person_id, { limit: 50, offset: nextOffset })
      .then((res) => {
        setVoteEntries((prev) => [...prev, ...(res.votes || [])]);
      })
      .catch(() => {})
      .finally(() => setVotesLoading(false));
  }, [person_id, votesData, voteEntries.length]);

  // ── Derived ──
  const displayName =
    person?.display_name || profile?.display_name || person_id?.replace(/_/g, ' ') || '';
  const photoUrl = person?.photo_url || profile?.thumbnail || null;
  const party = person?.party || '';
  const chamber = person?.chamber || '';
  const state = person?.state || '';
  const isActive = person?.is_active ?? true;
  const pColor = partyColor(party);

  const matchRate =
    performance && performance.total_claims > 0
      ? Math.round((performance.total_scored / performance.total_claims) * 100)
      : null;

  // Accountability tier
  const accountabilityTier = useMemo(() => {
    if (!performance || !performance.by_tier) return null;
    const { strong = 0, moderate = 0, weak = 0, none = 0 } = performance.by_tier;
    const total = strong + moderate + weak + none;
    if (total === 0) return null;
    if (strong / total >= 0.5) return 'strong';
    if ((strong + moderate) / total >= 0.5) return 'moderate';
    if (weak / total >= 0.4) return 'weak';
    return 'none';
  }, [performance]);

  // Policy areas sorted
  const sortedPolicyAreas = useMemo(() => {
    if (!activity?.policy_areas) return [];
    return Object.entries(activity.policy_areas)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
  }, [activity]);

  // Filtered legislation
  const filteredActivity = useMemo(() => {
    if (activityFilter === 'all') return activityEntries;
    // Backend returns 'sponsored'/'cosponsored' OR 'sponsor'/'cosponsor' — match both
    return activityEntries.filter((e) => {
      const role = e.role?.toLowerCase();
      if (activityFilter === 'sponsored') return role === 'sponsored' || role === 'sponsor';
      if (activityFilter === 'cosponsored') return role === 'cosponsored' || role === 'cosponsor';
      return true;
    });
  }, [activityEntries, activityFilter]);

  // Filtered votes
  const filteredVotes = useMemo(() => {
    if (voteFilter === 'all') return voteEntries;
    return voteEntries.filter((v) => v.position === voteFilter);
  }, [voteEntries, voteFilter]);

  // ── Early returns ──
  if (!person_id) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-body text-sm text-white/40">Missing person_id in URL.</p>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  //  Render
  // ══════════════════════════════════════════════

  return (
    <div className="min-h-screen overflow-y-auto">
      {/* ── HEADER ── */}
      <header className="px-6 pt-6 pb-0 lg:px-16 lg:pt-14 lg:pb-0">
        <PoliticsSectorHeader />
        <div className="mb-6">
          <BackButton to="/politics/people" label="Representatives" />
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={displayName}
                className="h-24 w-24 rounded-full border-2 border-white/10 object-cover"
              />
            ) : (
              <div
                className="flex h-24 w-24 items-center justify-center rounded-full font-heading text-2xl font-bold text-white"
                style={{ backgroundColor: pColor }}
              >
                {initials(displayName)}
              </div>
            )}
            <span
              className={`absolute bottom-0 right-0 h-5 w-5 rounded-full border-2 ${isActive ? 'bg-emerald-500' : 'bg-gray-500'}`}
              style={{ borderColor: '#020617' }}
              title={isActive ? 'Active member' : 'Inactive member'}
            />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white">
              {displayName}
            </h1>
            <p className="mt-1 font-mono text-sm text-white/40">
              {state}{chamber ? ` \u00B7 ${chamberLabel(chamber)}` : ''}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {party && (
                <span
                  className="rounded-full px-3 py-1 font-body text-xs font-bold uppercase"
                  style={{ backgroundColor: `${pColor}20`, color: pColor }}
                >
                  {partyLabel(party)}
                </span>
              )}
              {chamber && (
                <span className="rounded-full bg-white/5 px-3 py-1 font-body text-xs font-bold uppercase text-white/70">
                  {chamberLabel(chamber)}
                </span>
              )}
              {/* Contribute to campaign */}
              {displayName && (
                <a
                  href={getCampaignUrl(displayName, party)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-body text-xs font-bold uppercase transition-colors"
                  style={{
                    backgroundColor: `${pColor}15`,
                    color: pColor,
                    borderWidth: 1,
                    borderColor: `${pColor}30`,
                  }}
                >
                  <Heart className="w-3 h-3" />
                  Contribute
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stat pills */}
        <div className="mt-4 flex flex-wrap gap-3">
          <StatPill
            label="Bills Sponsored"
            value={activity ? String(activity.sponsored_count) : '...'}
          />
          <StatPill
            label="Votes Cast"
            value={
              votesData
                ? String(
                    Object.values(votesData.position_summary).reduce((a, b) => a + (Number(b) || 0), 0)
                  )
                : '...'
            }
          />
          <StatPill
            label="Legislative Actions"
            value={performance ? String(performance.total_claims) : '...'}
          />
        </div>
      </header>

      {/* ── TAB NAVIGATION ── */}
      <nav className="mt-8 flex gap-2 overflow-x-auto border-b border-white/10 px-6 lg:px-16" style={{ scrollbarWidth: 'none' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`cursor-pointer whitespace-nowrap pb-4 px-2 font-body text-lg font-medium transition-colors ${
              tab === t.key
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-white/30 hover:text-white/50 border-b-2 border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── TAB CONTENT ── */}
      <main className="flex-1 min-h-0 px-6 py-8 lg:px-16 lg:py-10">
        {tab === 'overview' && (
          <OverviewTab
            loading={overviewLoading}
            profile={profile}
            profileError={profileError}
            performance={performance}
            performanceError={performanceError}
            stats={stats}
            graph={graph}
            activity={activity}
            sortedPolicyAreas={sortedPolicyAreas}
            accountabilityTier={accountabilityTier}
            matchRate={matchRate}
          />
        )}
        {tab === 'legislation' && (
          <LegislationTab
            loading={activityLoading}
            activity={activity}
            entries={filteredActivity}
            totalEntries={activityEntries.length}
            filter={activityFilter}
            setFilter={setActivityFilter}
            onLoadMore={loadMoreActivity}
          />
        )}
        {tab === 'votes' && (
          <VotingRecordTab
            loading={votesLoading}
            votesData={votesData}
            entries={filteredVotes}
            totalEntries={voteEntries.length}
            filter={voteFilter}
            setFilter={setVoteFilter}
            onLoadMore={loadMoreVotes}
          />
        )}
        {tab === 'finance' && (
          <FinanceTab loading={financeLoading} finance={finance} />
        )}
        {tab === 'donors' && (
          <div className="py-12 text-center">
            <p className="text-white/40 text-sm">Industry donor data coming soon.</p>
          </div>
        )}
        {tab === 'trades' && (
          <StockTradesTab
            loading={tradesLoading}
            trades={trades}
            bioguideId={person?.bioguide_id}
            personName={person?.display_name || ''}
          />
        )}
      </main>
    </div>
  );
}

// ── Stat Pill (header) ──

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg border border-white/5 px-3 py-1.5 font-body text-sm text-white/70"
      style={{ backgroundColor: '#0F172A' }}
    >
      <span className="font-mono font-semibold text-white">{value}</span>{' '}
      <span className="text-white/40">{label}</span>
    </div>
  );
}

// ══════════════════════════════════════════════
//  OVERVIEW TAB
// ══════════════════════════════════════════════

function OverviewTab({
  loading,
  profile,
  profileError,
  performance,
  performanceError,
  stats,
  graph,
  activity,
  sortedPolicyAreas,
  accountabilityTier,
  matchRate,
}: {
  loading: boolean;
  profile: PersonProfile | null;
  profileError: boolean;
  performance: PersonPerformance | null;
  performanceError: boolean;
  stats: PersonStats | null;
  graph: PersonGraphResponse | null;
  activity: PersonActivityResponse | null;
  sortedPolicyAreas: [string, number][];
  accountabilityTier: string | null;
  matchRate: number | null;
}) {
  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col 2xl:flex-row gap-8">
      {/* LEFT COLUMN (60%) */}
      <div className="flex-1 2xl:w-[60%] space-y-8">
        {/* ABOUT */}
        <Card>
          <CardTitle>About</CardTitle>
          {profileError ? (
            <SectionError message="Failed to load profile." />
          ) : profile?.summary ? (
            <>
              <p className="font-body text-base leading-relaxed text-white/60">{profile.summary}</p>
              {profile.url && (
                <a
                  href={profile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block font-body text-sm text-blue-400 transition-colors hover:text-blue-300 no-underline"
                >
                  Read more on Wikipedia &rarr;
                </a>
              )}
            </>
          ) : (
            <p className="font-body text-sm text-white/30">No profile available.</p>
          )}
        </Card>

        {/* QUICK FACTS */}
        {profile?.infobox && Object.keys(profile.infobox).length > 0 && (
          <Card>
            <CardTitle>Quick Facts</CardTitle>
            <div className="grid grid-cols-2 gap-y-3">
              {Object.entries(profile.infobox)
                .slice(0, 12)
                .map(([key, val]) => (
                  <div key={key}>
                    <dt className="font-mono text-xs uppercase text-white/30">
                      {key.replace(/_/g, ' ')}
                    </dt>
                    <dd className="mt-0.5 text-sm text-white/80">{val}</dd>
                  </div>
                ))}
            </div>
          </Card>
        )}

        {/* TOP POLICY AREAS */}
        {sortedPolicyAreas.length > 0 && (
          <Card>
            <CardTitle>Top Policy Areas</CardTitle>
            <div className="space-y-3">
              {sortedPolicyAreas.map(([area, count]) => {
                const max = sortedPolicyAreas[0][1];
                const pct = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={area} className="flex items-center gap-3">
                    <span className="w-32 truncate text-sm text-white/70">{area}</span>
                    <div className="flex-1 h-3 rounded-full" style={{ backgroundColor: '#020617' }}>
                      <div
                        className="h-3 rounded-full bg-blue-500 transition-all duration-1000"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-white/50 w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* RIGHT COLUMN (40%) */}
      <div className="2xl:w-[40%] space-y-8">
        {/* LEGISLATIVE SUMMARY */}
        <Card>
          <CardTitle>Legislative Summary</CardTitle>
          {performanceError ? (
            <SectionError message="Performance data unavailable." />
          ) : performance ? (
            <>
              <div className="font-mono text-4xl font-bold text-white">
                {performance.total_claims}
              </div>
              <p className="mt-1 font-body text-xs text-white/30">
                Total legislative actions tracked
              </p>
              <div className="mt-2 font-mono text-lg text-white/60">
                {performance.total_scored} scored &middot; {performance.total_actions} official actions
              </div>
            </>
          ) : (
            <p className="font-body text-sm text-white/30">No legislative data available.</p>
          )}
        </Card>

        {/* AT A GLANCE */}
        <div>
          <h3 className="font-heading text-xl font-bold uppercase tracking-wide text-white mb-4">
            At a Glance
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <GlanceCard label="Actions Count" value={stats?.actions_count ?? '—'} />
            <GlanceCard label="Last Active" value={formatDate(stats?.last_action_date)} small />
            <GlanceCard label="Legislative Actions" value={performance?.total_claims ?? '—'} />
            <GlanceCard
              label="Actions Scored"
              value={performance?.total_scored ?? '—'}
            />
          </div>
        </div>

        {/* NETWORK */}
        <Card>
          <CardTitle>Network</CardTitle>
          {graph && graph.connections.length > 0 ? (
            <div className="space-y-3">
              {graph.connections.slice(0, 5).map((conn) => (
                <NetworkRow key={conn.person_id} conn={conn} />
              ))}
            </div>
          ) : (
            <p className="font-body text-sm text-white/30">No connection data.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function GlanceCard({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div
      className="rounded-xl border border-white/5 p-4"
      style={{ backgroundColor: '#0F172A' }}
    >
      <div className={`font-mono font-bold text-white ${small ? 'text-lg' : 'text-2xl'}`}>
        {value}
      </div>
      <div className="mt-1 font-body text-xs uppercase text-white/40">{label}</div>
    </div>
  );
}

function NetworkRow({ conn }: { conn: GraphConnection }) {
  const color = partyColor(conn.party);
  return (
    <Link
      to={`/politics/people/${conn.person_id}`}
      className="flex items-center gap-3 group no-underline"
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 font-heading text-xs font-bold text-white"
        style={{ borderColor: color, backgroundColor: `${color}15` }}
      >
        {initials(conn.display_name)}
      </div>
      <div className="min-w-0 flex-1">
        <span className="font-body text-sm text-white group-hover:text-blue-400 transition-colors">
          {conn.display_name}
        </span>
        <span
          className="ml-2 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {conn.party}
        </span>
      </div>
      <span className="font-mono text-xs text-white/40">{conn.shared_bills} shared bills</span>
    </Link>
  );
}

// ══════════════════════════════════════════════
//  LEGISLATION TAB
// ══════════════════════════════════════════════

function LegislationTab({
  loading,
  activity,
  entries,
  totalEntries,
  filter,
  setFilter,
  onLoadMore,
}: {
  loading: boolean;
  activity: PersonActivityResponse | null;
  entries: PersonActivityEntry[];
  totalEntries: number;
  filter: 'all' | 'sponsored' | 'cosponsored';
  setFilter: (f: 'all' | 'sponsored' | 'cosponsored') => void;
  onLoadMore: () => void;
}) {
  if (loading && !activity) return <Spinner />;

  const filters: { key: 'all' | 'sponsored' | 'cosponsored'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'sponsored', label: 'Sponsored' },
    { key: 'cosponsored', label: 'Cosponsored' },
  ];

  return (
    <div>
      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-2 font-body text-sm transition-all ${
              filter === f.key
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-white/5 text-white/40 border border-white/5 hover:text-white/60'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="py-12 text-center font-body text-sm text-white/40">
          No legislation data available.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry) => (
            <BillCard key={entry.bill_id} entry={entry} />
          ))}
        </div>
      )}

      {/* Show More */}
      {activity && totalEntries < activity.total && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 font-body text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Show More'}
          </button>
        </div>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  introduced: { bg: 'rgba(107,114,128,0.2)', text: '#9CA3AF' },
  in_committee: { bg: 'rgba(245,158,11,0.2)', text: '#F59E0B' },
  passed_one: { bg: 'rgba(59,130,246,0.2)', text: '#3B82F6' },
  passed_both: { bg: 'rgba(16,185,129,0.2)', text: '#10B981' },
  signed: { bg: 'rgba(16,185,129,0.2)', text: '#10B981' },
  vetoed: { bg: 'rgba(239,68,68,0.2)', text: '#EF4444' },
  became_law: { bg: 'rgba(16,185,129,0.2)', text: '#10B981' },
};

function statusStyle(status: string | null) {
  if (!status) return { bg: 'rgba(107,114,128,0.2)', text: '#9CA3AF' };
  return STATUS_COLORS[status.toLowerCase().replace(/\s+/g, '_')] || STATUS_COLORS.introduced;
}

function BillCard({ entry }: { entry: PersonActivityEntry }) {
  const st = statusStyle(entry.status);

  const content = (
    <div
      className="group rounded-xl border border-white/5 p-6 transition-all duration-300 hover:border-white/10"
      style={{ backgroundColor: '#0F172A' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Top row: bill ID + role */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/20 px-2 py-0.5 font-mono text-xs font-bold text-blue-400">
              {entry.bill_id}
            </span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase text-white/40">
              {entry.role}
            </span>
            {entry.status && (
              <span
                className="rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase"
                style={{ backgroundColor: st.bg, color: st.text }}
              >
                {entry.status}
              </span>
            )}
          </div>

          {/* Title */}
          <h4 className="font-body text-lg font-medium text-white line-clamp-2 group-hover:text-blue-400 transition-colors">
            {entry.title}
          </h4>

          {/* Meta */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/30">
            {entry.policy_area && (
              <span className="rounded bg-white/5 px-1.5 py-0.5">{entry.policy_area}</span>
            )}
            {entry.latest_action_date && <span>{formatDate(entry.latest_action_date)}</span>}
            {entry.latest_action && (
              <span className="truncate max-w-xs">{entry.latest_action}</span>
            )}
          </div>
        </div>

        {entry.congress_url && (
          <span className="flex-shrink-0 text-white/20 group-hover:text-blue-400 transition-colors text-lg">
            &rarr;
          </span>
        )}
      </div>
    </div>
  );

  return (
    <Link
      to={`/politics/bill/${entry.bill_id}`}
      className="no-underline block"
    >
      {content}
    </Link>
  );
}

// ══════════════════════════════════════════════
//  VOTING RECORD TAB
// ══════════════════════════════════════════════

function VotingRecordTab({
  loading,
  votesData,
  entries,
  totalEntries,
  filter,
  setFilter,
  onLoadMore,
}: {
  loading: boolean;
  votesData: PersonVotesResponse | null;
  entries: PersonVoteEntry[];
  totalEntries: number;
  filter: string;
  setFilter: (f: string) => void;
  onLoadMore: () => void;
}) {
  if (loading && !votesData) return <Spinner />;

  const positionSummary = votesData?.position_summary || {};
  const total = votesData?.total || 0;
  const yeaCount = positionSummary['Yea'] || 0;
  const nayCount = positionSummary['Nay'] || 0;
  const nvCount = positionSummary['Not Voting'] || 0;
  const presentCount = positionSummary['Present'] || 0;

  const filterOptions = [
    { key: 'all', label: 'All' },
    { key: 'Yea', label: 'Yea' },
    { key: 'Nay', label: 'Nay' },
    { key: 'Not Voting', label: 'Not Voting' },
    { key: 'Present', label: 'Present' },
  ];

  return (
    <div>
      {/* Summary row */}
      <div className="flex flex-wrap gap-4 mb-6">
        <VoteSummaryPill label="Total" value={total} />
        <VoteSummaryPill label="Yea" value={yeaCount} />
        <VoteSummaryPill label="Nay" value={nayCount} />
        <VoteSummaryPill label="Not Voting" value={nvCount} />
        {presentCount > 0 && <VoteSummaryPill label="Present" value={presentCount} />}
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {filterOptions.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-2 font-body text-sm transition-all ${
              filter === f.key
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-white/5 text-white/40 border border-white/5 hover:text-white/60'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="py-12 text-center font-body text-sm text-white/40">
          No voting record data available.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((vote) => (
            <VoteCard key={vote.vote_id} vote={vote} />
          ))}
        </div>
      )}

      {/* Show More */}
      {votesData && totalEntries < votesData.total && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 font-body text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Show More'}
          </button>
        </div>
      )}
    </div>
  );
}

function VoteSummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-xl border border-white/5 px-4 py-3"
      style={{ backgroundColor: '#0F172A' }}
    >
      <div className="font-mono text-lg font-bold text-white">{value.toLocaleString()}</div>
      <div className="font-body text-xs text-white/40">{label}</div>
    </div>
  );
}

const POSITION_COLORS: Record<string, { bg: string; text: string }> = {
  Yea: { bg: 'rgba(16,185,129,0.2)', text: '#10B981' },
  Nay: { bg: 'rgba(239,68,68,0.2)', text: '#EF4444' },
  'Not Voting': { bg: 'rgba(107,114,128,0.2)', text: '#9CA3AF' },
  Present: { bg: 'rgba(234,179,8,0.2)', text: '#EAB308' },
};

function positionStyle(position: string) {
  return POSITION_COLORS[position] || POSITION_COLORS['Not Voting'];
}

function resultStyle(result: string) {
  const lower = result.toLowerCase();
  if (lower.includes('passed') || lower.includes('agreed'))
    return { bg: 'rgba(16,185,129,0.2)', text: '#10B981' };
  if (lower.includes('failed') || lower.includes('rejected'))
    return { bg: 'rgba(239,68,68,0.2)', text: '#EF4444' };
  return { bg: 'rgba(107,114,128,0.2)', text: '#9CA3AF' };
}

function VoteCard({ vote }: { vote: PersonVoteEntry }) {
  const ps = positionStyle(vote.position);
  const rs = resultStyle(vote.result);

  const billId =
    vote.related_bill_congress && vote.related_bill_type && vote.related_bill_number
      ? `${vote.related_bill_congress}-${vote.related_bill_type}-${vote.related_bill_number}`
      : null;

  // Mini bar proportions (approximate: use position as indicator)
  const yeaFrac = vote.position === 'Yea' ? 60 : 40;
  const nayFrac = 100 - yeaFrac;

  return (
    <Link
      to={`/politics/vote/${vote.vote_id}`}
      className="no-underline block"
    >
      <div
        className="group rounded-xl border border-white/5 p-6 transition-all duration-300 hover:border-white/10"
        style={{ backgroundColor: '#0F172A' }}
      >
        {/* Question */}
        <h4 className="font-body text-base text-white line-clamp-2 group-hover:text-blue-400 transition-colors">
          {vote.question}
        </h4>

        {/* Badges */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 font-body text-xs font-bold uppercase"
            style={{ backgroundColor: ps.bg, color: ps.text }}
          >
            {vote.position}
          </span>
          <span
            className="rounded-full px-2 py-0.5 font-body text-xs font-bold uppercase"
            style={{ backgroundColor: rs.bg, color: rs.text }}
          >
            {vote.result}
          </span>

          {/* Mini bar */}
          <div className="flex h-1.5 w-48 rounded-full overflow-hidden bg-white/5">
            <div className="h-full bg-emerald-500" style={{ width: `${yeaFrac}%` }} />
            <div className="h-full bg-red-500" style={{ width: `${nayFrac}%` }} />
          </div>
        </div>

        {/* Bill title & summary */}
        {vote.bill_title && (
          <p className="mt-2 text-sm font-semibold text-white/80 line-clamp-2">{vote.bill_title}</p>
        )}
        {vote.bill_summary && (
          <p className="mt-1 text-xs text-white/40 line-clamp-3 leading-relaxed">{vote.bill_summary}</p>
        )}

        {/* Meta */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/30">
          <span className="font-mono">Roll #{vote.roll_number}</span>
          {vote.vote_date && <span>{formatDate(vote.vote_date)}</span>}
          {billId && (() => {
            const bParts = billId.split('-');
            const bCongress = bParts[0];
            const bType = bParts[1];
            const bNum = bParts[2];
            const bTypeMap: Record<string, string> = {
              hr: 'house-bill', s: 'senate-bill', hjres: 'house-joint-resolution',
              sjres: 'senate-joint-resolution', hres: 'house-resolution', sres: 'senate-resolution',
            };
            const bUrl = `https://www.congress.gov/bill/${bCongress}th-congress/${bTypeMap[bType] || bType}/${bNum}`;
            return (
              <a
                href={bUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-400 font-mono hover:bg-blue-500/20 transition-colors no-underline"
              >
                {billId} &rarr;
              </a>
            );
          })()}
        </div>
      </div>
    </Link>
  );
}

// ══════════════════════════════════════════════
//  FINANCE TAB
// ══════════════════════════════════════════════

function FinanceTab({
  loading,
  finance,
}: {
  loading: boolean;
  finance: PersonFinance | null;
}) {
  if (loading) return <Spinner />;

  if (!finance || !finance.totals) {
    return (
      <p className="py-12 text-center font-body text-sm text-white/40">
        No finance data available.
      </p>
    );
  }

  const totals = finance.totals || {} as any;
  const top_donors = finance.top_donors || [];
  const committees = finance.committees || [];
  const candidate_id = finance.candidate_id;

  return (
    <div>
      {/* Hero stats */}
      <div className="grid grid-cols-2 2xl:grid-cols-4 gap-4 mb-8">
        <FinanceStatCard label="Total Raised" value={totals.receipts} />
        <FinanceStatCard label="Total Spent" value={totals.disbursements} />
        <FinanceStatCard label="Cash on Hand" value={totals.cash_on_hand} />
        <FinanceStatCard label="Debt" value={totals.debt} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* LEFT: Top Donors */}
        <div className="flex-1">
          <Card>
            <CardTitle>Top Donors</CardTitle>
            {top_donors.length === 0 ? (
              <p className="font-body text-sm text-white/30">No donor data.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40">
                      <th className="py-2 text-left font-body text-xs uppercase">Donor Name</th>
                      <th className="py-2 text-left font-body text-xs uppercase">Employer</th>
                      <th className="py-2 text-right font-body text-xs uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top_donors.map((donor, i) => (
                      <tr
                        key={i}
                        className={`border-b border-white/5 last:border-0 ${
                          i % 2 === 1 ? 'bg-white/[0.02]' : ''
                        }`}
                      >
                        <td className="py-2.5 font-body font-medium text-white">{donor.name}</td>
                        <td className="py-2.5 font-body text-white/50">{donor.employer}</td>
                        <td className="py-2.5 text-right font-mono text-pink-400">
                          ${(donor.amount ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT: Committees */}
        <div className="lg:w-[40%]">
          <Card>
            <CardTitle>Committees</CardTitle>
            {committees.length === 0 ? (
              <p className="font-body text-sm text-white/30">No committee data.</p>
            ) : (
              <div className="space-y-2">
                {committees.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span className="font-body text-sm text-white/80">{c.name}</span>
                    <span className="rounded bg-white/5 px-2 py-0.5 font-body text-[10px] uppercase text-white/40">
                      {c.designation}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {candidate_id && (
            <div className="mt-4">
              <a
                href={`https://www.fec.gov/data/candidate/${candidate_id}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-sm text-blue-400 transition-colors hover:text-blue-300 no-underline"
              >
                View on FEC &rarr;
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FinanceStatCard({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div
      className="rounded-xl border border-white/5 p-6"
      style={{ backgroundColor: '#0F172A' }}
    >
      <div className="font-mono text-3xl font-bold text-white">
        {value != null ? formatCurrency(value) : '—'}
      </div>
      <div className="mt-1 font-body text-xs uppercase text-white/40">{label}</div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  STOCK TRADES TAB
// ══════════════════════════════════════════════

function StockTradesTab({
  loading,
  trades,
  bioguideId,
  personName,
}: {
  loading: boolean;
  trades: any[];
  bioguideId?: string;
  personName: string;
}) {
  if (loading) return <Spinner />;

  const capitolTradesUrl = bioguideId
    ? `https://www.capitoltrades.com/politicians/${bioguideId}`
    : 'https://www.capitoltrades.com/trades';

  return (
    <div className="space-y-6">
      {/* Header with Capitol Trades link */}
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg font-bold text-white">Stock Trades</h3>
        <a
          href={capitolTradesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          View full history on Capitol Trades
          <ExternalLink size={14} />
        </a>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-white/40 text-sm">No stock trades found for this member.</p>
          <a
            href={capitolTradesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
          >
            Check Capitol Trades <ExternalLink size={12} />
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map((t: any, i: number) => (
            <div
              key={t.id || i}
              className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              {/* Ticker */}
              <div className="w-16 shrink-0">
                <span className="font-mono text-sm font-bold text-white">{t.ticker || '—'}</span>
              </div>

              {/* Type badge */}
              <div className="w-20 shrink-0">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                    t.transaction_type?.includes('purchase')
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : t.transaction_type?.includes('sale')
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-white/10 text-white/50'
                  }`}
                >
                  {t.transaction_type || 'unknown'}
                </span>
              </div>

              {/* Asset name */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/70 truncate">{t.asset_name || t.ticker || '—'}</p>
              </div>

              {/* Amount */}
              <div className="w-32 shrink-0 text-right">
                <span className="font-mono text-sm text-white/50">{t.amount_range || '—'}</span>
              </div>

              {/* Date */}
              <div className="w-24 shrink-0 text-right">
                <span className="font-mono text-[11px] text-white/30">
                  {t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                </span>
              </div>

              {/* Source link */}
              {t.source_url && (
                <a
                  href={t.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-white/20 hover:text-white/50 transition-colors"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
