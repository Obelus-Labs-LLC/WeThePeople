import React, { useEffect, useReducer, useCallback, useMemo, useRef, Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient, getApiBaseUrl } from '../api/client';
import Breadcrumbs from '../components/Breadcrumbs';
import { ExternalLink, Heart, Share2 } from 'lucide-react';
import CsvExportButton from '../components/CsvExportButton';
import ReportErrorButton from '../components/ReportErrorButton';
import { PoliticsSectorHeader } from '../components/SectorHeader';
// TradeTimeline ships its own SVG renderer + date utilities; pulling
// it into the main bundle adds bytes that most readers never see
// (scroll-below-fold). Lazy + Suspense keeps the page interactive.
const TradeTimeline = React.lazy(() => import('../components/TradeTimeline'));
import SanctionsBadge from '../components/SanctionsBadge';
import AnomalyBadge from '../components/AnomalyBadge';
// TrendChart pulls in recharts (~537 KB chunk). Lazy-load it so the
// main page can paint immediately and the chart appears once recharts
// downloads and parses. The chart sits below the fold so the late
// arrival is invisible to most readers.
const TrendChart = React.lazy(() => import('../components/TrendChart'));
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

// ─────────────────────────────────────────────────────────────────────
// Tokens & helpers
// ─────────────────────────────────────────────────────────────────────

const PARTY_TOKEN: Record<string, string> = {
  D: 'var(--color-dem)',
  R: 'var(--color-rep)',
  I: 'var(--color-ind)',
};

// Hex-ish fallbacks used only for `${color}18` / `${color}30` opacity suffixes
// (CSS custom properties can't have alpha suffixes appended). Kept to the
// exact shades used by the design tokens above so visuals stay consistent.
const PARTY_HEX: Record<string, string> = {
  D: '#4A7FDE',
  R: '#E05555',
  I: '#B06FD8',
};

const TIER_TOKEN: Record<string, { token: string; hex: string }> = {
  strong: { token: 'var(--color-verify)', hex: '#10B981' },
  moderate: { token: 'var(--color-dem)', hex: '#4A7FDE' },
  weak: { token: 'var(--color-accent)', hex: '#C5A028' },
  none: { token: 'var(--color-red)', hex: '#E63946' },
};

const STATUS_TOKEN: Record<string, { token: string; hex: string }> = {
  signed_into_law: { token: 'var(--color-green)', hex: '#3DB87A' },
  became_law: { token: 'var(--color-green)', hex: '#3DB87A' },
  signed: { token: 'var(--color-green)', hex: '#3DB87A' },
  passed_one_chamber: { token: 'var(--color-green)', hex: '#3DB87A' },
  passed_one: { token: 'var(--color-green)', hex: '#3DB87A' },
  passed_committee: { token: 'var(--color-green)', hex: '#3DB87A' },
  passed_both: { token: 'var(--color-green)', hex: '#3DB87A' },
  introduced: { token: 'var(--color-text-3)', hex: '#B4ADA0' },
  in_committee: { token: 'var(--color-dem)', hex: '#4A7FDE' },
  vetoed: { token: 'var(--color-red)', hex: '#E63946' },
};

/** Generate a campaign contribution link based on party affiliation. */
function getCampaignUrl(name: string, party: string): string {
  const q = encodeURIComponent(name);
  const p = party?.charAt(0);
  if (p === 'D') return `https://secure.actblue.com/search?q=${q}`;
  if (p === 'R') return `https://secure.winred.com/search?query=${q}`;
  return `https://www.fec.gov/data/candidates/?search=${q}`;
}

type TabKey = 'legislation' | 'votes' | 'finance' | 'donors' | 'trades';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'legislation', label: 'Legislation' },
  { key: 'votes', label: 'Votes' },
  { key: 'finance', label: 'Finance' },
  { key: 'donors', label: 'Donors' },
  { key: 'trades', label: 'Trades' },
];

function partyToken(party: string): string {
  return PARTY_TOKEN[party?.charAt(0)] || 'var(--color-text-3)';
}

function partyHex(party: string): string {
  return PARTY_HEX[party?.charAt(0)] || '#B4ADA0';
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

function statusTokenFor(status: string | null | undefined) {
  if (!status) return STATUS_TOKEN.introduced;
  const key = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_TOKEN[key] || STATUS_TOKEN.introduced;
}

// ─────────────────────────────────────────────────────────────────────
// Shared small components
// ─────────────────────────────────────────────────────────────────────

function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
        style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--color-text-3)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Card({
  children,
  className = '',
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        transition: 'border-color 0.2s',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-text-3)',
        marginBottom: 14,
      }}
    >
      {children}
    </h2>
  );
}

// ══════════════════════════════════════════════
//  PersonProfilePage — State
// ══════════════════════════════════════════════

interface ProfileState {
  person: Person | null;
  profile: PersonProfile | null;
  profileError: boolean;
  performance: PersonPerformance | null;
  performanceError: boolean;
  stats: PersonStats | null;
  graph: PersonGraphResponse | null;
  committees: Array<Record<string, unknown>>;
  overviewLoading: boolean;
  activity: PersonActivityResponse | null;
  activityEntries: PersonActivityEntry[];
  activityLoading: boolean;
  activityFilter: 'all' | 'sponsored' | 'cosponsored';
  votesData: PersonVotesResponse | null;
  voteEntries: PersonVoteEntry[];
  votesLoading: boolean;
  voteFilter: string;
  finance: PersonFinance | null;
  financeLoading: boolean;
  donors: DonorData | null;
  donorsLoading: boolean;
  trades: Array<Record<string, unknown>>;
  tradesLoading: boolean;
  trends: { years: number[]; series: Record<string, number[]> } | null;
  tab: TabKey;
  loadedTabs: Set<TabKey>;
}

const initialState: ProfileState = {
  person: null,
  profile: null,
  profileError: false,
  performance: null,
  performanceError: false,
  stats: null,
  graph: null,
  committees: [],
  overviewLoading: true,
  activity: null,
  activityEntries: [],
  activityLoading: false,
  activityFilter: 'all',
  votesData: null,
  voteEntries: [],
  votesLoading: false,
  voteFilter: 'all',
  finance: null,
  financeLoading: false,
  donors: null,
  donorsLoading: false,
  trades: [],
  tradesLoading: false,
  trends: null,
  tab: 'legislation',
  loadedTabs: new Set<TabKey>(['legislation']),
};

type ProfileAction =
  | { type: 'LOAD_FULL'; data: Record<string, unknown> }
  | { type: 'LOAD_FULL_ERROR' }
  | { type: 'SET_OVERVIEW_LOADING'; value: boolean }
  | { type: 'APPEND_ACTIVITY'; entries: PersonActivityEntry[] }
  | { type: 'SET_ACTIVITY_LOADING'; value: boolean }
  | { type: 'SET_ACTIVITY_FILTER'; value: 'all' | 'sponsored' | 'cosponsored' }
  | { type: 'APPEND_VOTES'; votes: PersonVoteEntry[] }
  | { type: 'SET_VOTES_LOADING'; value: boolean }
  | { type: 'SET_VOTE_FILTER'; value: string }
  | { type: 'SET_FINANCE_LOADING'; value: boolean }
  | { type: 'SET_DONORS_LOADING'; value: boolean }
  | { type: 'SET_TRADES_LOADING'; value: boolean }
  | { type: 'SET_TAB'; tab: TabKey };

function profileReducer(state: ProfileState, action: ProfileAction): ProfileState {
  switch (action.type) {
    case 'LOAD_FULL': {
      const d = action.data;
      const loadedTabs = new Set(state.loadedTabs);
      const patch: Partial<ProfileState> = { overviewLoading: false };

      if (d.person) patch.person = d.person as Person;
      // The combined /people/{id}/full endpoint may legitimately omit a
      // sub-field for an entity that doesn't have it yet (e.g. a freshly
      // tracked member with no photos/profile yet). The previous reducer
      // flipped *Error to true any time the field was missing, rendering
      // the whole section as "errored" instead of just unavailable.
      // Only set Error when LOAD_FULL_ERROR is dispatched (network-level
      // failure) — here we just preserve the prior value so partial
      // payloads stay neutral.
      if (d.profile) { patch.profile = d.profile as PersonProfile; patch.profileError = false; }
      if (d.performance) { patch.performance = d.performance as PersonPerformance; patch.performanceError = false; }
      if (d.stats) patch.stats = d.stats as PersonStats;
      if (d.committees) patch.committees = (d.committees as { committees?: unknown[] }).committees as Record<string, unknown>[] || [];
      if (d.activity) {
        const act = d.activity as PersonActivityResponse;
        patch.activity = act;
        patch.activityEntries = act.entries || [];
        loadedTabs.add('legislation');
      }
      if (d.votes) {
        const v = d.votes as PersonVotesResponse;
        patch.votesData = v;
        patch.voteEntries = v.votes || [];
        loadedTabs.add('votes');
      }
      if (d.trends) patch.trends = d.trends as ProfileState['trends'];
      if (d.finance) { patch.finance = d.finance as PersonFinance; loadedTabs.add('finance'); }
      if (d.trades) { patch.trades = (d.trades as { trades?: unknown[] }).trades as Record<string, unknown>[] || []; loadedTabs.add('trades'); }
      if (d.donors) { patch.donors = d.donors as DonorData; loadedTabs.add('donors'); }
      if (d.graph) patch.graph = d.graph as PersonGraphResponse;

      patch.loadedTabs = loadedTabs;
      return { ...state, ...patch };
    }
    case 'LOAD_FULL_ERROR':
      return { ...state, overviewLoading: false, profileError: true, performanceError: true };
    case 'SET_OVERVIEW_LOADING':
      return { ...state, overviewLoading: action.value };
    case 'APPEND_ACTIVITY':
      return { ...state, activityEntries: [...state.activityEntries, ...action.entries], activityLoading: false };
    case 'SET_ACTIVITY_LOADING':
      return { ...state, activityLoading: action.value };
    case 'SET_ACTIVITY_FILTER':
      return { ...state, activityFilter: action.value };
    case 'APPEND_VOTES':
      return { ...state, voteEntries: [...state.voteEntries, ...action.votes], votesLoading: false };
    case 'SET_VOTES_LOADING':
      return { ...state, votesLoading: action.value };
    case 'SET_VOTE_FILTER':
      return { ...state, voteFilter: action.value };
    case 'SET_FINANCE_LOADING':
      return { ...state, financeLoading: action.value };
    case 'SET_DONORS_LOADING':
      return { ...state, donorsLoading: action.value };
    case 'SET_TRADES_LOADING':
      return { ...state, tradesLoading: action.value };
    case 'SET_TAB':
      return { ...state, tab: action.tab };
    default:
      return state;
  }
}

// ══════════════════════════════════════════════
//  PersonProfilePage
// ══════════════════════════════════════════════

export default function PersonProfilePage() {
  const { person_id } = useParams<{ person_id: string }>();
  const [ps, dispatch] = useReducer(profileReducer, initialState);

  const {
    person, profile, performance,
    stats, committees, overviewLoading,
    activity, activityEntries, activityLoading, activityFilter,
    votesData, voteEntries, votesLoading, voteFilter,
    finance, financeLoading, donors, donorsLoading,
    trades, tradesLoading, trends, tab,
  } = ps;

  const setTab = useCallback((t: TabKey) => dispatch({ type: 'SET_TAB', tab: t }), []);
  const setActivityFilter = useCallback((v: 'all' | 'sponsored' | 'cosponsored') => dispatch({ type: 'SET_ACTIVITY_FILTER', value: v }), []);
  const setVoteFilter = useCallback((v: string) => dispatch({ type: 'SET_VOTE_FILTER', value: v }), []);

  // ── Single combined fetch for all person data ──
  // Tracks the active controller in a ref so loadMoreActivity / loadMoreVotes
  // can be cancelled if the component unmounts or person_id changes mid-flight.
  const activeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!person_id) return;
    const controller = new AbortController();
    activeAbortRef.current = controller;
    dispatch({ type: 'SET_OVERVIEW_LOADING', value: true });

    fetch(`${getApiBaseUrl()}/people/${encodeURIComponent(person_id)}/full`, {
      signal: controller.signal,
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        if (!controller.signal.aborted) dispatch({ type: 'LOAD_FULL', data });
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        // Log so transient backend failures are debuggable instead of just
        // collapsing to a generic LOAD_FULL_ERROR with no signal.
        console.warn('[PersonProfilePage] /people/{id}/full failed:', err);
        if (!controller.signal.aborted) dispatch({ type: 'LOAD_FULL_ERROR' });
      });

    return () => {
      controller.abort();
      if (activeAbortRef.current === controller) activeAbortRef.current = null;
    };
  }, [person_id]);

  // ── Load more: legislation ──
  const loadMoreActivity = useCallback(() => {
    if (!person_id || !activity) return;
    const nextOffset = activityEntries.length;
    if (nextOffset >= activity.total) return;
    const signal = activeAbortRef.current?.signal;
    dispatch({ type: 'SET_ACTIVITY_LOADING', value: true });
    apiClient
      .getPersonActivity(person_id, { limit: 50, offset: nextOffset })
      .then((res) => {
        if (signal?.aborted) return;
        dispatch({ type: 'APPEND_ACTIVITY', entries: res.entries || [] });
      })
      .catch(() => {
        if (signal?.aborted) return;
        dispatch({ type: 'SET_ACTIVITY_LOADING', value: false });
      });
  }, [person_id, activity, activityEntries.length]);

  // ── Load more: votes ──
  const loadMoreVotes = useCallback(() => {
    if (!person_id || !votesData) return;
    const nextOffset = voteEntries.length;
    if (nextOffset >= votesData.total) return;
    const signal = activeAbortRef.current?.signal;
    dispatch({ type: 'SET_VOTES_LOADING', value: true });
    apiClient
      .getPersonVotes(person_id, { limit: 50, offset: nextOffset })
      .then((res) => {
        if (signal?.aborted) return;
        dispatch({ type: 'APPEND_VOTES', votes: res.votes || [] });
      })
      .catch(() => {
        if (signal?.aborted) return;
        dispatch({ type: 'SET_VOTES_LOADING', value: false });
      });
  }, [person_id, votesData, voteEntries.length]);

  // ── Derived ──
  const displayName =
    person?.display_name || profile?.display_name || person_id?.replace(/_/g, ' ') || '';
  const photoUrl = person?.photo_url || profile?.thumbnail || null;
  const party = person?.party || '';
  const chamber = person?.chamber || '';
  const state = person?.state || '';
  const isActive = person?.is_active ?? true;
  const pToken = partyToken(party);
  const pHex = partyHex(party);

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

  const totalVotes = votesData
    ? Object.values(votesData.position_summary).reduce((a, b) => a + (Number(b) || 0), 0)
    : null;

  const tierInfo = accountabilityTier ? TIER_TOKEN[accountabilityTier] : null;

  // ── Early returns ──
  if (!person_id) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-3)' }}>
          Missing person_id in URL.
        </p>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  //  Render
  // ══════════════════════════════════════════════

  return (
    <div
      className="flex flex-col w-full h-screen relative"
      style={{ background: 'var(--color-bg)', color: 'var(--color-text-1)' }}
    >
      {/* Header area */}
      <div className="relative z-10 shrink-0" style={{ padding: '16px 24px 8px' }}>
        <PoliticsSectorHeader />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginTop: 4,
          }}
        >
          <Breadcrumbs
            items={[
              { label: 'Politics', to: '/politics' },
              { label: 'People', to: '/politics/people' },
              { label: displayName || 'Profile' },
            ]}
          />
          <ShareButton url={window.location.href} title={`${displayName} — WeThePeople`} />
        </div>
      </div>

      {/* Main Content: Sidebar + Data */}
      <div className="flex flex-1 min-h-0">
        {/* ─── Left Sidebar ─── */}
        <aside
          className="hidden md:flex flex-col overflow-y-auto shrink-0"
          style={{
            width: 256,
            borderRight: '1px solid var(--color-border)',
            padding: '24px 18px',
            gap: 18,
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.08) transparent',
          }}
        >
          {/* Avatar + name */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                position: 'relative',
                width: 76,
                height: 76,
                borderRadius: '50%',
                background: photoUrl ? 'transparent' : `${pHex}18`,
                border: `2px solid ${pHex}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 10px',
                overflow: 'hidden',
              }}
            >
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={displayName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontStyle: 'italic',
                    fontWeight: 900,
                    fontSize: 26,
                    color: pToken,
                  }}
                >
                  {initials(displayName)}
                </span>
              )}
              <span
                style={{
                  position: 'absolute',
                  bottom: 2,
                  right: 2,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid var(--color-bg)',
                  background: isActive ? 'var(--color-verify)' : 'var(--color-text-3)',
                }}
                title={isActive ? 'Active member' : 'Inactive member'}
              />
            </div>

            {/* Name + watchlist */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
              <h1
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontStyle: 'italic',
                  fontWeight: 700,
                  fontSize: 18,
                  lineHeight: 1.15,
                  color: 'var(--color-text-1)',
                  textAlign: 'center',
                  margin: 0,
                }}
              >
                {displayName}
              </h1>
              <WatchlistButton entityType="politician" entityId={person_id || ''} entityName={displayName} />
            </div>

            {/* Party / Chamber / State tags */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 5, flexWrap: 'wrap' }}>
              {party && (
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 20,
                    padding: '3px 8px',
                    background: `${pHex}18`,
                    color: pToken,
                    letterSpacing: '0.04em',
                  }}
                >
                  {partyLabel(party)}
                </span>
              )}
              {chamber && (
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 20,
                    padding: '3px 8px',
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text-2)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {chamberLabel(chamber)}
                </span>
              )}
              {state && (
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 20,
                    padding: '3px 8px',
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text-2)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {state}
                </span>
              )}
            </div>

            {/* Badges row */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <SanctionsBadge status={person?.sanctions_status} />
              <AnomalyBadge entityType="person" entityId={person_id || ''} />
            </div>
          </div>

          {/* Accountability tier */}
          {tierInfo && accountabilityTier && (
            <div
              style={{
                background: `${tierInfo.hex}14`,
                border: `1px solid ${tierInfo.hex}2E`,
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  color: `${tierInfo.hex}99`,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 3,
                }}
              >
                Accountability Tier
              </div>
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  color: tierInfo.token,
                }}
              >
                {tierLabel(accountabilityTier)}
              </div>
            </div>
          )}

          {/* AI summary */}
          {profile?.ai_profile_summary && (
            <div>
              <SectionLabel>AI Analysis</SectionLabel>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: 'var(--color-text-2)',
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                {profile.ai_profile_summary}
              </p>
            </div>
          )}

          {/* About */}
          {profile?.summary && (
            <div>
              <SectionLabel>About</SectionLabel>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: 'var(--color-text-2)',
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                {profile.summary}
              </p>
              {profile.url && (
                <a
                  href={profile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    marginTop: 6,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 11,
                    color: 'var(--color-accent-text)',
                    textDecoration: 'none',
                  }}
                >
                  Read more on Wikipedia →
                </a>
              )}
            </div>
          )}

          {/* Overview quick stats */}
          <div>
            <SectionLabel>Overview</SectionLabel>
            {[
              ['Bills Sponsored', activity ? activity.sponsored_count.toLocaleString() : '—'],
              ['Votes Cast', totalVotes != null ? totalVotes.toLocaleString() : '—'],
              ['Actions Scored', performance ? `${performance.total_scored}/${performance.total_claims}` : '—'],
              ['Committees', committees.length > 0 ? String(committees.filter((c) => !c.parent_thomas_id).length) : '—'],
              ['Last Active', formatDate(stats?.last_action_date)],
            ].map(([label, value]) => (
              <div
                key={label as string}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--color-text-2)' }}>
                  {label}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: 'var(--color-text-1)' }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Identity metadata */}
          {(state || (person as { district?: string } | null)?.district || person?.bioguide_id) && (
            <div>
              <SectionLabel>Identity</SectionLabel>
              {[
                ['District', (person as { district?: string } | null)?.district || null],
                ['Next Election', (person as { next_election?: string } | null)?.next_election || null],
                ['Bioguide ID', person?.bioguide_id || null],
              ].map(([label, value]) =>
                value ? (
                  <div
                    key={label as string}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 0',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--color-text-2)' }}>
                      {label}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--color-text-1)' }}>
                      {value}
                    </span>
                  </div>
                ) : null
              )}
            </div>
          )}

          {/* Policy areas */}
          {sortedPolicyAreas.length > 0 && (
            <div>
              <SectionLabel>Policy Areas</SectionLabel>
              {sortedPolicyAreas.map(([area, count]) => {
                const max = sortedPolicyAreas[0][1];
                const pct = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={area} style={{ marginBottom: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 11,
                          color: 'var(--color-text-2)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '70%',
                        }}
                      >
                        {area}
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--color-text-3)' }}>
                        {count}
                      </span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'var(--color-surface-2)' }}>
                      <div
                        style={{
                          height: 3,
                          borderRadius: 2,
                          background: pToken,
                          width: `${pct}%`,
                          transition: 'width 0.6s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Trend chart — lazy-loaded so recharts isn't on the
              initial-render critical path. Falls back to a small
              loading sentence; the chart slides in once the chunk
              arrives. */}
          {trends && (
            <div>
              <SectionLabel>Activity Over Time</SectionLabel>
              <Suspense
                fallback={
                  <div
                    style={{
                      height: 120,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-text-3)',
                      fontSize: 12,
                    }}
                  >
                    Loading chart…
                  </div>
                }
              >
                <TrendChart data={trends} height={120} />
              </Suspense>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {displayName && (
              <a
                href={getCampaignUrl(displayName, party)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '9px',
                  borderRadius: 8,
                  border: `1px solid ${pHex}30`,
                  background: `${pHex}10`,
                  color: pToken,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                <Heart size={13} />
                Contribute to Campaign
              </a>
            )}
            <Link
              to={`/influence/network/person/${person_id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '9px',
                borderRadius: 8,
                border: '1px solid rgba(74,127,222,0.3)',
                background: 'rgba(74,127,222,0.1)',
                color: 'var(--color-dem)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <Share2 size={13} />
              View Influence Network
            </Link>
          </div>
        </aside>

        {/* ─── Right Panel ─── */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tab Navigation */}
          <div
            className="flex shrink-0"
            style={{
              borderBottom: '1px solid var(--color-border)',
              padding: '0 24px',
              gap: 20,
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  position: 'relative',
                  padding: '12px 0',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: tab === t.key ? 600 : 400,
                  color: tab === t.key ? 'var(--color-text-1)' : 'var(--color-text-3)',
                  transition: 'color 0.15s',
                }}
              >
                {t.label}
                {tab === t.key && (
                  <motion.div
                    layoutId="activeTab"
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 1.5,
                      background: 'var(--color-accent)',
                    }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div
            className="flex-1 overflow-y-auto"
            style={{
              padding: '20px 24px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.08) transparent',
            }}
          >
            {overviewLoading ? (
              <Spinner />
            ) : (
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
                  {tab === 'finance' && <FinanceTab loading={financeLoading} finance={finance} />}
                  {tab === 'donors' && <IndustryDonorsTab loading={donorsLoading} donors={donors} />}
                  {tab === 'trades' && (
                    <StockTradesTab
                      loading={tradesLoading}
                      trades={trades}
                      bioguideId={person?.bioguide_id}
                      personName={person?.display_name || ''}
                      personId={person_id}
                      party={person?.party ?? undefined}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Filter pill (shared)
// ─────────────────────────────────────────────────────────────────────

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        borderRadius: 20,
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
        background: active ? 'var(--color-accent-dim)' : 'transparent',
        color: active ? 'var(--color-accent-text)' : 'var(--color-text-2)',
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function LoadMoreButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
      <button
        onClick={onClick}
        disabled={loading}
        style={{
          padding: '8px 20px',
          borderRadius: 8,
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          color: 'var(--color-text-2)',
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.5 : 1,
          transition: 'all 0.15s',
        }}
      >
        {loading ? 'Loading...' : 'Show more'}
      </button>
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {filters.map((f) => (
          <FilterPill key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </FilterPill>
        ))}
      </div>

      {entries.length === 0 ? (
        <p
          style={{
            padding: '48px 0',
            textAlign: 'center',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: 'var(--color-text-3)',
          }}
        >
          No legislation data available.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {entries.map((entry) => (
            <BillCard key={entry.bill_id} entry={entry} />
          ))}
        </div>
      )}

      {activity && totalEntries < activity.total && (
        <LoadMoreButton loading={loading} onClick={onLoadMore} />
      )}
    </div>
  );
}

function BillCard({ entry }: { entry: PersonActivityEntry }) {
  const st = statusTokenFor(entry.status);

  return (
    <Link to={`/politics/bill/${entry.bill_id}`} style={{ textDecoration: 'none' }}>
      <div
        className="group"
        style={{
          padding: '14px 18px',
          borderRadius: 10,
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border)';
        }}
      >
        {/* Badges row */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 7, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--color-dem)',
              background: 'rgba(74,127,222,0.12)',
              borderRadius: 5,
              padding: '2px 7px',
            }}
          >
            {entry.bill_id}
          </span>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--color-text-3)',
              background: 'var(--color-surface-2)',
              borderRadius: 5,
              padding: '2px 7px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {entry.role}
          </span>
          {entry.status && (
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                fontWeight: 600,
                color: st.token,
                background: `${st.hex}1F`,
                borderRadius: 5,
                padding: '2px 7px',
              }}
            >
              {entry.status}
            </span>
          )}
        </div>

        {/* Title */}
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text-1)',
            marginBottom: 6,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {entry.title}
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {entry.policy_area && (
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                color: 'var(--color-text-3)',
                background: 'var(--color-surface-2)',
                borderRadius: 4,
                padding: '2px 7px',
              }}
            >
              {entry.policy_area}
            </span>
          )}
          {entry.latest_action_date && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--color-text-3)' }}>
              {formatDate(entry.latest_action_date)}
            </span>
          )}
          {entry.latest_action && (
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                color: 'var(--color-text-3)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 320,
              }}
            >
              {entry.latest_action}
            </span>
          )}
        </div>
      </div>
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
  ];

  const summary: Array<[string, number]> = [
    ['Total Votes', total],
    ['Yea', yeaCount],
    ['Nay', nayCount],
    ['Not Voting', nvCount],
  ];
  if (presentCount > 0) summary.push(['Present', presentCount]);

  return (
    <div>
      {/* Summary grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${summary.length}, 1fr)`,
          gap: 10,
          marginBottom: 16,
        }}
      >
        {summary.map(([label, value]) => (
          <div
            key={label}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--color-text-1)',
                marginBottom: 4,
                lineHeight: 1,
              }}
            >
              {value.toLocaleString()}
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--color-text-3)' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {filterOptions.map((f) => (
          <FilterPill key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </FilterPill>
        ))}
      </div>

      {entries.length === 0 ? (
        <p
          style={{
            padding: '48px 0',
            textAlign: 'center',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: 'var(--color-text-3)',
          }}
        >
          No voting record data available.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {entries.map((vote) => (
            <VoteCard key={vote.vote_id} vote={vote} />
          ))}
        </div>
      )}

      {votesData && totalEntries < votesData.total && (
        <LoadMoreButton loading={loading} onClick={onLoadMore} />
      )}
    </div>
  );
}

function positionTokenFor(pos: string): { token: string; hex: string } {
  if (pos === 'Yea') return { token: 'var(--color-green)', hex: '#3DB87A' };
  if (pos === 'Nay') return { token: 'var(--color-red)', hex: '#E63946' };
  if (pos === 'Present') return { token: 'var(--color-accent)', hex: '#C5A028' };
  return { token: 'var(--color-text-3)', hex: '#B4ADA0' };
}

function resultTokenFor(result: string): { token: string; hex: string } {
  const lower = (result || '').toLowerCase();
  if (lower.includes('passed') || lower.includes('agreed')) return { token: 'var(--color-green)', hex: '#3DB87A' };
  if (lower.includes('failed') || lower.includes('rejected')) return { token: 'var(--color-red)', hex: '#E63946' };
  return { token: 'var(--color-text-3)', hex: '#B4ADA0' };
}

function VoteCard({ vote }: { vote: PersonVoteEntry }) {
  const ps = positionTokenFor(vote.position);
  const rs = resultTokenFor(vote.result);

  const billId =
    vote.related_bill_congress && vote.related_bill_type && vote.related_bill_number
      ? `${vote.related_bill_congress}-${vote.related_bill_type}-${vote.related_bill_number}`
      : null;

  return (
    <Link to={`/politics/vote/${vote.vote_id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          padding: '14px 18px',
          borderRadius: 10,
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          cursor: 'pointer',
          transition: 'border-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border)';
        }}
      >
        {/* Question */}
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-text-1)',
            marginBottom: 8,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {vote.question}
        </div>

        {(vote as { ai_summary?: string }).ai_summary && (
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              color: 'var(--color-text-2)',
              margin: '0 0 8px 0',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {(vote as { ai_summary?: string }).ai_summary}
          </p>
        )}

        {/* Badges */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10,
              fontWeight: 700,
              color: ps.token,
              background: `${ps.hex}1F`,
              borderRadius: 5,
              padding: '2px 8px',
            }}
          >
            {vote.position}
          </span>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              color: rs.token,
              background: `${rs.hex}1F`,
              borderRadius: 5,
              padding: '2px 8px',
            }}
          >
            {vote.result}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: 'var(--color-text-3)',
              marginLeft: 'auto',
            }}
          >
            Roll #{vote.roll_number}
            {vote.vote_date && ` · ${formatDate(vote.vote_date)}`}
          </span>
        </div>

        {/* Bill context */}
        {vote.bill_title && (
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-text-2)',
              margin: '8px 0 0 0',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {vote.bill_title}
          </p>
        )}

        {billId && (
          <div style={{ marginTop: 8 }}>
            {(() => {
              const [bCongress, bType, bNum] = billId.split('-');
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
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: 'var(--color-dem)',
                    background: 'rgba(74,127,222,0.10)',
                    borderRadius: 4,
                    padding: '2px 7px',
                    textDecoration: 'none',
                  }}
                >
                  {billId} →
                </a>
              );
            })()}
          </div>
        )}
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

const SECTOR_TINTS: Record<string, { token: string; hex: string }> = {
  finance: { token: 'var(--color-green)', hex: '#3DB87A' },
  health: { token: 'var(--color-red)', hex: '#E63946' },
  tech: { token: 'var(--color-ind)', hex: '#B06FD8' },
  energy: { token: 'var(--color-accent)', hex: '#C5A028' },
  defense: { token: 'var(--color-rep)', hex: '#E05555' },
};

function sectorTintFor(s: string | undefined): { token: string; hex: string } {
  if (!s) return { token: 'var(--color-text-3)', hex: '#B4ADA0' };
  return SECTOR_TINTS[s.toLowerCase()] || { token: 'var(--color-text-3)', hex: '#B4ADA0' };
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
      <p
        style={{
          padding: '48px 0',
          textAlign: 'center',
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: 'var(--color-text-3)',
        }}
      >
        No industry donor data available for this member.
      </p>
    );
  }

  const totalAmount = donors.total_amount || 0;
  const bySector = donors.by_sector || {};
  const donations = donors.donations || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
        }}
      >
        <SummaryStat label="Total Received" value={formatCurrency(totalAmount)} />
        <SummaryStat label="Donors" value={String(donors.total || 0)} />
        {Object.entries(bySector).map(([sector, data]) => (
          <SummaryStat
            key={sector}
            label={`${sector.charAt(0).toUpperCase() + sector.slice(1)} Sector`}
            value={formatCurrency(data.total_amount || 0)}
            sub={`${data.donor_count || 0} donors`}
            valueColor={sectorTintFor(sector).token}
          />
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardTitle>Industry Donations</CardTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Sector', 'Committee / PAC', 'Cycle', 'Amount', 'Date'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 10px',
                      textAlign: i === 3 ? 'right' : 'left',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-3)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {donations.map((d, i) => {
                const tint = sectorTintFor(d.entity_type);
                return (
                  <tr key={d.id || i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 10,
                          fontWeight: 700,
                          color: tint.token,
                          background: `${tint.hex}1F`,
                          borderRadius: 5,
                          padding: '2px 7px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {d.entity_type || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-1)' }}>
                      {d.committee_name || '—'}
                    </td>
                    <td style={{ padding: '10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--color-text-2)' }}>
                      {d.cycle || '—'}
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        textAlign: 'right',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-green)',
                      }}
                    >
                      {d.amount != null ? formatCurrency(d.amount) : '—'}
                    </td>
                    <td style={{ padding: '10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--color-text-3)' }}>
                      {d.donation_date ? formatDate(d.donation_date) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p
          style={{
            marginTop: 10,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: 'var(--color-text-3)',
          }}
        >
          Source: FEC via sync_donations.py
        </p>
      </Card>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-3)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 22,
          fontWeight: 700,
          color: valueColor || 'var(--color-text-1)',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 4,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: 'var(--color-text-3)',
          }}
        >
          {sub}
        </div>
      )}
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
      <p
        style={{
          padding: '48px 0',
          textAlign: 'center',
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: 'var(--color-text-3)',
        }}
      >
        No finance data available.
      </p>
    );
  }

  const totals = (finance.totals ?? {}) as Record<string, number>;
  const top_donors = finance.top_donors || [];
  const committees = finance.committees || [];
  const candidate_id = finance.candidate_id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hero stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
        }}
      >
        <SummaryStat label="Total Raised" value={totals.receipts != null ? formatCurrency(totals.receipts) : '—'} valueColor="var(--color-green)" />
        <SummaryStat label="Total Spent" value={totals.disbursements != null ? formatCurrency(totals.disbursements) : '—'} />
        <SummaryStat label="Cash on Hand" value={totals.cash_on_hand != null ? formatCurrency(totals.cash_on_hand) : '—'} valueColor="var(--color-accent-text)" />
        <SummaryStat label="Debt" value={totals.debt != null ? formatCurrency(totals.debt) : '—'} valueColor={(totals.debt || 0) > 0 ? 'var(--color-red)' : 'var(--color-text-1)'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Top Donors */}
        <Card>
          <CardTitle>Top Donors</CardTitle>
          {top_donors.length === 0 ? (
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-3)', margin: 0 }}>
              No donor data.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {['Donor', 'Employer', 'Amount'].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 10px',
                          textAlign: i === 2 ? 'right' : 'left',
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'var(--color-text-3)',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {top_donors.map((donor, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px', fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-1)' }}>
                        {donor.name}
                      </td>
                      <td style={{ padding: '10px', fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--color-text-2)' }}>
                        {donor.employer || '—'}
                      </td>
                      <td
                        style={{
                          padding: '10px',
                          textAlign: 'right',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--color-green)',
                        }}
                      >
                        ${(donor.amount ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Committees */}
        <Card>
          <CardTitle>Committees</CardTitle>
          {committees.length === 0 ? (
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-3)', margin: 0 }}>
              No committee data.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {committees.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-1)' }}>
                    {c.name}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--color-text-3)',
                      background: 'var(--color-surface-2)',
                      borderRadius: 5,
                      padding: '2px 7px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {c.designation}
                  </span>
                </div>
              ))}
            </div>
          )}

          {candidate_id && (
            <div style={{ marginTop: 12 }}>
              <a
                href={`https://www.fec.gov/data/candidate/${candidate_id}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: 'var(--color-accent-text)',
                  textDecoration: 'none',
                }}
              >
                View on FEC →
              </a>
            </div>
          )}
        </Card>
      </div>
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
  // Build timeline markers from trade data
  const timelineMarkers: TradeMarker[] = useMemo(() => {
    return trades
      .filter((t) => t.transaction_date && t.ticker)
      .map((t) => ({
        date: t.transaction_date!,
        person_id: personId || '',
        display_name: personName,
        party: party || null,
        transaction_type: t.transaction_type || 'unknown',
        amount_range: t.amount_range || null,
        reporting_gap: t.reporting_gap != null ? String(t.reporting_gap) : null,
      }));
  }, [trades, personId, personName, party]);

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

  if (loading) return <Spinner />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h3
          style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: 20,
            color: 'var(--color-text-1)',
            margin: 0,
          }}
        >
          Stock Trades
        </h3>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* CSV export — Audit item #8. Fetches the full filtered
              trades dataset for this politician via /export, not just
              the in-memory paginated slice the user is currently
              viewing. */}
          {personId && (
            <CsvExportButton
              table="congressional_trades"
              filters={{ person_id: personId }}
              filename={`${personId}-trades.csv`}
              compact
            />
          )}
          <a
            href={capitolTradesUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
            }}
          >
            View full history on Capitol Trades
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Timeline — lazy so the SVG renderer doesn't sit on the
          critical path for politicians who don't trade. */}
      {timelineMarkers.length > 0 && topTicker && (
        <Suspense
          fallback={
            <div
              style={{
                height: 80,
                color: 'var(--color-text-3)',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Loading trade timeline…
            </div>
          }
        >
          <TradeTimeline trades={timelineMarkers} ticker={topTicker} />
        </Suspense>
      )}

      {trades.length === 0 ? (
        <div
          style={{
            padding: '48px 0',
            textAlign: 'center',
          }}
        >
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-3)' }}>
            No stock trades found for this member.
          </p>
          <a
            href={capitolTradesUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 8,
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
            }}
          >
            Check Capitol Trades <ExternalLink size={12} />
          </a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {trades.map((t, i) => {
            const isBuy = (t.transaction_type || '').toLowerCase().includes('purchase');
            const isSell = (t.transaction_type || '').toLowerCase().includes('sale');
            const typeColor = isBuy
              ? { token: 'var(--color-green)', hex: '#3DB87A' }
              : isSell
              ? { token: 'var(--color-red)', hex: '#E63946' }
              : { token: 'var(--color-text-3)', hex: '#B4ADA0' };
            return (
              <div
                key={t.id || i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                }}
              >
                {/* Ticker */}
                <div style={{ width: 64, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: 'var(--color-text-1)' }}>
                  {t.ticker || '—'}
                </div>

                {/* Type badge */}
                <div style={{ width: 88, flexShrink: 0 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 10,
                      fontWeight: 700,
                      color: typeColor.token,
                      background: `${typeColor.hex}1F`,
                      borderRadius: 5,
                      padding: '2px 8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {t.transaction_type || 'unknown'}
                  </span>
                </div>

                {/* Asset name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      color: 'var(--color-text-2)',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.asset_name || t.ticker || '—'}
                  </p>
                </div>

                {/* Amount */}
                <div style={{ width: 120, flexShrink: 0, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--color-text-2)' }}>
                  {t.amount_range || '—'}
                </div>

                {/* Date */}
                <div style={{ width: 90, flexShrink: 0, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--color-text-3)' }}>
                  {t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                </div>

                {/* Source link */}
                {t.source_url && (
                  <a
                    href={t.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ flexShrink: 0, color: 'var(--color-text-3)' }}
                  >
                    <ExternalLink size={13} />
                  </a>
                )}

                {/* Per-row "report error" affordance. Audit item #9.
                    Tiny flag icon; click opens an inline form. */}
                {t.id != null && (
                  <ReportErrorButton
                    recordKind="trade"
                    recordId={t.id}
                    context={{
                      ticker: t.ticker,
                      transaction_type: t.transaction_type,
                      transaction_date: t.transaction_date,
                      amount_range: t.amount_range,
                      person_id: personId,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
