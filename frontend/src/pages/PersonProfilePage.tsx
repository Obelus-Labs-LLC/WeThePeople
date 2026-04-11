import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient, getApiBaseUrl } from '../api/client';
import Breadcrumbs from '../components/Breadcrumbs';
import { ExternalLink, Heart, Share2, FileText } from 'lucide-react';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import TradeTimeline from '../components/TradeTimeline';
import SanctionsBadge from '../components/SanctionsBadge';
import AnomalyBadge from '../components/AnomalyBadge';
import TrendChart from '../components/TrendChart';
import WatchlistButton from '../components/WatchlistButton';
import ShareButton from '../components/ShareButton';
import type { TradeMarker } from '../api/influence';
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

type TabKey = 'legislation' | 'votes' | 'finance' | 'donors' | 'trades';

const TABS: { key: TabKey; label: string }[] = [
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
    <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-white mb-4">
      {children}
    </h2>
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
  const [committees, setCommittees] = useState<Array<Record<string, unknown>>>([]);
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

  // ── State: donors tab ──
  const [donors, setDonors] = useState<DonorData | null>(null);
  const [donorsLoading, setDonorsLoading] = useState(false);

  // ── State: trades tab ──
  const [trades, setTrades] = useState<Array<Record<string, unknown>>>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  // ── State: trends (overview) ──
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  // ── Tabs ──
  const [tab, setTab] = useState<TabKey>('legislation');
  const [loadedTabs, setLoadedTabs] = useState<Set<TabKey>>(new Set(['legislation']));

  // ── Mark tab loaded ──
  const markLoaded = useCallback((t: TabKey) => {
    setLoadedTabs((prev) => new Set(prev).add(t));
  }, []);

  // ── Single combined fetch for all person data ──
  useEffect(() => {
    if (!person_id) return;
    let cancelled = false;
    setOverviewLoading(true);

    fetch(`${getApiBaseUrl()}/people/${person_id}/full`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;

        // Person basic info
        if (data.person) {
          setPerson(data.person);
        }

        // Profile
        if (data.profile) {
          setProfile(data.profile);
          setProfileError(false);
        } else {
          setProfileError(true);
        }

        // Performance
        if (data.performance) {
          setPerformance(data.performance);
          setPerformanceError(false);
        } else {
          setPerformanceError(true);
        }

        // Stats
        if (data.stats) setStats(data.stats);

        // Committees
        if (data.committees) setCommittees(data.committees.committees || []);

        // Activity
        if (data.activity) {
          setActivity(data.activity);
          setActivityEntries(data.activity.entries || []);
          markLoaded('legislation');
        }

        // Votes
        if (data.votes) {
          setVotesData(data.votes);
          setVoteEntries(data.votes.votes || []);
          markLoaded('votes');
        }

        // Trends
        if (data.trends) setTrends(data.trends);

        // Finance
        if (data.finance) {
          setFinance(data.finance);
          markLoaded('finance');
        }

        // Trades
        if (data.trades) {
          setTrades(data.trades.trades || []);
          markLoaded('trades');
        }

        // Donors
        if (data.donors) {
          setDonors(data.donors);
          markLoaded('donors');
        }

        // Graph
        if (data.graph) setGraph(data.graph);
      })
      .catch(() => {
        setProfileError(true);
        setPerformanceError(true);
      })
      .finally(() => { if (!cancelled) setOverviewLoading(false); });

    return () => { cancelled = true; };
  }, [person_id, markLoaded]);

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
    <div className="flex flex-col w-full h-screen relative">
      {/* Header area */}
      <div className="relative z-10 px-6 pt-4 shrink-0">
        <PoliticsSectorHeader />
        <div className="mb-2">
          <Breadcrumbs items={[
            { label: 'Politics', to: '/politics' },
            { label: 'People', to: '/politics/people' },
            { label: displayName || 'Profile' },
          ]} />
        </div>
      </div>

      {/* Colored accent top bar - uses PARTY COLOR */}
      <div
        className="w-full px-6 py-3 flex items-center justify-between shrink-0 z-10 shadow-md"
        style={{ background: pColor }}
      >
        <div className="flex items-center gap-6">
          {[
            ['MEMBER', displayName],
            ['PARTY', partyLabel(party) || '\u2014'],
            ...(chamber ? [['CHAMBER', chamberLabel(chamber)]] : []),
            ...(state ? [['STATE', state]] : []),
          ].map(([label, value]) => (
            <span key={label} className="text-sm tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span className="text-white/70">{label}: </span>
              <span className="text-white font-bold">{value}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <ShareButton url={window.location.href} title={`${displayName} — WeThePeople`} />
        </div>
      </div>

      {/* Main Content: Sidebar + Data */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar */}
        <div
          className="hidden md:flex flex-col w-[30%] lg:w-[25%] border-r p-8 overflow-y-auto shrink-0"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
        >
          {/* Avatar */}
          <div className="mb-6 flex justify-center">
            <div className="relative">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={displayName}
                  className="h-32 w-32 rounded-full border-2 border-white/10 object-cover"
                />
              ) : (
                <div
                  className="flex h-32 w-32 items-center justify-center rounded-full font-heading text-3xl font-bold text-white"
                  style={{ backgroundColor: pColor }}
                >
                  {initials(displayName)}
                </div>
              )}
              <span
                className={`absolute bottom-1 right-1 h-5 w-5 rounded-full border-2 ${isActive ? 'bg-emerald-500' : 'bg-gray-500'}`}
                style={{ borderColor: '#020617' }}
                title={isActive ? 'Active member' : 'Inactive member'}
              />
            </div>
          </div>

          {/* Name */}
          <div className="flex items-center justify-center gap-3 mb-1">
            <h1
              className="text-3xl font-bold leading-tight text-center"
              style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0' }}
            >
              {displayName}
            </h1>
            <WatchlistButton entityType="politician" entityId={person_id || ''} entityName={displayName} />
          </div>

          {/* Party + Chamber + State */}
          <div className="flex justify-center flex-wrap gap-2 mb-4">
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
            {state && (
              <span className="rounded-full bg-white/5 px-3 py-1 font-body text-xs font-bold uppercase text-white/70">
                {state}
              </span>
            )}
          </div>

          {/* Badges */}
          <div className="flex justify-center gap-2 mb-6">
            <SanctionsBadge status={person?.sanctions_status} />
            <AnomalyBadge entityType="person" entityId={person_id || ''} />
          </div>

          {/* AI Profile Summary */}
          {(profile as any)?.ai_profile_summary && (
            <div className="mb-6">
              <span className="text-zinc-500 text-xs uppercase tracking-wider">AI Analysis</span>
              <p className="text-zinc-400 text-sm mt-1">{(profile as any).ai_profile_summary}</p>
            </div>
          )}

          {/* About / Summary */}
          {profile?.summary && (
            <div className="mb-6">
              <span className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>About</span>
              <p className="text-sm text-white/60 mt-1 leading-relaxed">{profile.summary}</p>
              {profile.url && (
                <a
                  href={profile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block font-body text-xs text-blue-400 transition-colors hover:text-blue-300 no-underline"
                >
                  Read more on Wikipedia &rarr;
                </a>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-4">
            {[
              ['PARTY', partyLabel(party)],
              ['CHAMBER', chamber ? chamberLabel(chamber) : null],
              ['STATE', state],
              ['DISTRICT', (person as any)?.district || null],
              ['NEXT ELECTION', (person as any)?.next_election || null],
              ['BIOGUIDE ID', person?.bioguide_id || null],
            ].map(([label, value]) => value ? (
              <div key={label as string}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>{label}</p>
                <p className="text-sm font-medium" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E2E8F0' }}>{value}</p>
              </div>
            ) : null)}
          </div>

          {/* Quick Facts */}
          {profile?.infobox && Object.keys(profile.infobox).length > 0 && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-wider mb-3" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>Quick Facts</p>
              <div className="space-y-2">
                {Object.entries(profile.infobox).slice(0, 8).map(([key, val]) => (
                  <div key={key}>
                    <p className="font-mono text-[10px] uppercase text-white/30">{key.replace(/_/g, ' ')}</p>
                    <p className="text-sm text-white/80">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats overview */}
          <div className="mt-6 rounded-xl border p-4" style={{ background: `${pColor}10`, borderColor: `${pColor}30` }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={16} style={{ color: pColor }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: pColor }}>
                OVERVIEW
              </span>
            </div>
            <div className="space-y-2 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <div className="flex justify-between"><span className="text-white/50">Bills Sponsored</span><span className="text-white font-bold">{activity ? activity.sponsored_count : '\u2014'}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Votes Cast</span><span className="text-white font-bold">{votesData ? Object.values(votesData.position_summary).reduce((a, b) => a + (Number(b) || 0), 0) : '\u2014'}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Legislative Actions</span><span className="text-white font-bold">{performance ? performance.total_claims : '\u2014'}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Actions Scored</span><span className="text-white font-bold">{performance ? performance.total_scored : '\u2014'}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Last Active</span><span className="text-white font-bold">{formatDate(stats?.last_action_date)}</span></div>
              {committees.length > 0 && (
                <div className="flex justify-between"><span className="text-white/50">Committees</span><span className="text-white font-bold">{committees.filter((c) => !c.parent_thomas_id).length}</span></div>
              )}
            </div>
          </div>

          {/* Accountability tier */}
          {accountabilityTier && (
            <div className="mt-4 rounded-lg border border-white/5 p-3" style={{ backgroundColor: '#0F172A' }}>
              <p className="font-mono text-[10px] uppercase text-white/40 mb-1">Accountability</p>
              <span
                className="rounded-full px-2.5 py-0.5 font-mono text-xs font-bold uppercase"
                style={{ backgroundColor: `${TIER_COLORS[accountabilityTier]}20`, color: TIER_COLORS[accountabilityTier] }}
              >
                {tierLabel(accountabilityTier)}
              </span>
            </div>
          )}

          {/* Campaign Contribute link */}
          {displayName && (
            <a
              href={getCampaignUrl(displayName, party)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-body text-sm font-bold uppercase transition-colors no-underline"
              style={{
                backgroundColor: `${pColor}15`,
                color: pColor,
                borderWidth: 1,
                borderColor: `${pColor}30`,
              }}
            >
              <Heart className="w-4 h-4" />
              Contribute to Campaign
            </a>
          )}

          {/* View Network link */}
          <Link
            to={`/influence/network/person/${person_id}`}
            className="mt-3 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-body text-sm font-bold uppercase transition-colors no-underline bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25"
          >
            <Share2 className="w-4 h-4" />
            View Network
          </Link>

          {/* Top Policy Areas */}
          {sortedPolicyAreas.length > 0 && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-wider mb-3" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                Top Policy Areas
              </p>
              <div className="space-y-2">
                {sortedPolicyAreas.map(([area, count]) => {
                  const max = sortedPolicyAreas[0][1];
                  const pct = max > 0 ? (count / max) * 100 : 0;
                  return (
                    <div key={area}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-white/60 truncate max-w-[70%]">{area}</span>
                        <span className="font-mono text-[10px] text-white/40">{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ backgroundColor: '#020617' }}>
                        <div
                          className="h-1.5 rounded-full transition-all duration-1000"
                          style={{ width: `${pct}%`, backgroundColor: pColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity Over Time */}
          {trends && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-wider mb-3" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                Activity Over Time
              </p>
              <TrendChart data={trends} height={120} />
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col min-h-0" style={{ background: 'transparent' }}>
          {/* Tab Navigation */}
          <div className="relative flex gap-8 border-b px-8 pt-4 shrink-0" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="relative pb-4 cursor-pointer bg-transparent border-0"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '14px',
                  color: tab === t.key ? pColor : 'rgba(255,255,255,0.4)',
                  fontWeight: tab === t.key ? 700 : 400,
                }}
              >
                {t.label}
                {tab === t.key && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-1 rounded-full"
                    style={{ background: pColor }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-8" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >

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
            <IndustryDonorsTab loading={donorsLoading} donors={donors} />
          )}
          {tab === 'trades' && (
            <StockTradesTab
              loading={tradesLoading}
              trades={trades}
              bioguideId={person?.bioguide_id}
              personName={person?.display_name || ''}
              personId={person_id}
              party={person?.party}
            />
          )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
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
        {(vote as any).ai_summary && (
          <p className="text-zinc-400 text-sm mt-1">{(vote as any).ai_summary}</p>
        )}

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
//  INDUSTRY DONORS TAB
// ══════════════════════════════════════════════

interface DonorData {
  total?: number;
  total_amount?: number;
  by_sector?: Record<string, { total_amount?: number; donor_count?: number }>;
  donations?: Array<{
    id?: number;
    entity_type?: string;
    committee_name?: string;
    cycle?: string;
    amount?: number;
    donation_date?: string;
    source_url?: string;
  }>;
}

function IndustryDonorsTab({
  loading,
  donors,
}: {
  loading: boolean;
  donors: DonorData | null;
}) {
  if (loading) return <Spinner />;
  if (!donors || !donors.donations || donors.donations.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-white/40 text-sm">No industry donor data available for this member.</p>
      </div>
    );
  }

  const totalAmount = donors.total_amount || 0;
  const bySector = donors.by_sector || {};
  const donations = donors.donations || [];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <div className="text-center">
            <p className="font-heading text-[10px] font-semibold tracking-wider text-white/30 uppercase mb-1">Total Received</p>
            <p className="font-mono text-2xl font-bold text-white">{formatCurrency(totalAmount)}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="font-heading text-[10px] font-semibold tracking-wider text-white/30 uppercase mb-1">Donors</p>
            <p className="font-mono text-2xl font-bold text-white">{donors.total || 0}</p>
          </div>
        </Card>
        {Object.entries(bySector).map(([sector, data]: [string, { total_amount?: number; donor_count?: number }]) => (
          <Card key={sector}>
            <div className="text-center">
              <p className="font-heading text-[10px] font-semibold tracking-wider text-white/30 uppercase mb-1">
                {sector.charAt(0).toUpperCase() + sector.slice(1)} Sector
              </p>
              <p className="font-mono text-lg font-bold text-white">{formatCurrency(data.total_amount || 0)}</p>
              <p className="font-mono text-xs text-white/30">{data.donor_count || 0} donors</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Donations table */}
      <Card>
        <CardTitle>Industry Donations</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-2 text-left font-body text-xs uppercase text-white/30">Sector</th>
                <th className="py-2 text-left font-body text-xs uppercase text-white/30">Committee / PAC</th>
                <th className="py-2 text-left font-body text-xs uppercase text-white/30">Cycle</th>
                <th className="py-2 text-right font-body text-xs uppercase text-white/30">Amount</th>
                <th className="py-2 text-left font-body text-xs uppercase text-white/30">Date</th>
              </tr>
            </thead>
            <tbody>
              {donations.map((d, i: number) => (
                <tr key={d.id || i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-2.5">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                      d.entity_type === 'finance' ? 'bg-emerald-500/10 text-emerald-400' :
                      d.entity_type === 'health' ? 'bg-rose-500/10 text-rose-400' :
                      d.entity_type === 'tech' ? 'bg-violet-500/10 text-violet-400' :
                      d.entity_type === 'energy' ? 'bg-orange-500/10 text-orange-400' :
                      'bg-white/10 text-white/50'
                    }`}>
                      {d.entity_type || '—'}
                    </span>
                  </td>
                  <td className="py-2.5 font-body text-sm text-white">{d.committee_name || '—'}</td>
                  <td className="py-2.5 font-mono text-xs text-white/50">{d.cycle || '—'}</td>
                  <td className="py-2.5 font-mono text-sm font-semibold text-emerald-400 text-right">
                    {d.amount != null ? formatCurrency(d.amount) : '—'}
                  </td>
                  <td className="py-2.5 font-mono text-xs text-white/40">
                    {d.donation_date ? formatDate(d.donation_date) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-mono text-[10px] text-white/20">
          Source: FEC via sync_donations.py
        </p>
      </Card>
    </div>
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
  personId,
  party,
}: {
  loading: boolean;
  trades: Array<{
    id?: number;
    ticker?: string;
    transaction_date?: string | null;
    transaction_type?: string;
    amount_range?: string | null;
    reporting_gap?: string | number | null;
    asset_description?: string;
    asset_name?: string;
    source_url?: string;
  }>;
  bioguideId?: string;
  personName: string;
  personId?: string;
  party?: string;
}) {
  if (loading) return <Spinner />;

  // Build timeline markers from trade data
  const timelineMarkers: TradeMarker[] = useMemo(() => {
    return trades
      .filter((t) => t.transaction_date && t.ticker)
      .map((t) => ({
        date: t.transaction_date!, // non-null guaranteed by filter above
        person_id: personId || '',
        display_name: personName,
        party: party || null,
        transaction_type: t.transaction_type || 'unknown',
        amount_range: t.amount_range || null,
        reporting_gap: t.reporting_gap != null ? String(t.reporting_gap) : null,
      }));
  }, [trades, personId, personName, party]);

  // Get the most-traded ticker for the timeline display
  const topTicker = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of trades) {
      if (t.ticker) counts[t.ticker] = (counts[t.ticker] || 0) + 1;
    }
    let best = '';
    let bestCount = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (v > bestCount) { best = k; bestCount = v; }
    }
    return best;
  }, [trades]);

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

      {/* Trade Timeline visualization */}
      {timelineMarkers.length > 0 && topTicker && (
        <TradeTimeline trades={timelineMarkers} ticker={topTicker} />
      )}

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
          {trades.map((t, i: number) => (
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
