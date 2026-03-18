import React, { useEffect, useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Users, FileText, Search, ChevronDown, ChevronUp, ExternalLink, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import SpotlightCard from '../components/SpotlightCard';
import { fetchStateDashboard, fetchStateLegislators, fetchStateBills } from '../api/state';
import type { StateDashboardData, StateLegislator, StateBill } from '../api/state';
import { fmtNum } from '../utils/format';

// ── Constants ──

const PARTY_COLORS: Record<string, string> = {
  D: '#3B82F6',
  R: '#EF4444',
  I: '#A855F7',
};

const PARTY_LABELS: Record<string, string> = {
  D: 'Democrat',
  R: 'Republican',
  I: 'Independent',
};

const CHAMBER_LABELS: Record<string, string> = {
  upper: 'Senate',
  lower: 'House',
};

// ── Page ──

export default function StateDashboardPage() {
  const { stateCode } = useParams<{ stateCode: string }>();
  const code = (stateCode || '').toUpperCase();

  const [dashboard, setDashboard] = useState<StateDashboardData | null>(null);
  const [legislators, setLegislators] = useState<StateLegislator[]>([]);
  const [loading, setLoading] = useState(true);

  // Legislator filters
  const [legSearch, setLegSearch] = useState('');
  const [chamberFilter, setChamberFilter] = useState<string>('');
  const [partyFilter, setPartyFilter] = useState<string>('');
  const [legOffset, setLegOffset] = useState(0);
  const [legTotal, setLegTotal] = useState(0);

  // Bill state
  const [billSearch, setBillSearch] = useState('');
  const [expandedBill, setExpandedBill] = useState<number | null>(null);

  // Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'legislators' | 'bills'>('overview');

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    Promise.all([
      fetchStateDashboard(code),
      fetchStateLegislators(code, { limit: 50 }),
    ])
      .then(([dash, legs]) => {
        setDashboard(dash);
        setLegislators(legs.legislators);
        setLegTotal(legs.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [code]);

  // Refetch legislators when filters change
  useEffect(() => {
    if (!code || loading) return;
    fetchStateLegislators(code, {
      chamber: chamberFilter || undefined,
      party: partyFilter || undefined,
      search: legSearch || undefined,
      limit: 50,
      offset: legOffset,
    })
      .then((data) => {
        setLegislators(data.legislators);
        setLegTotal(data.total);
      })
      .catch(console.error);
  }, [code, chamberFilter, partyFilter, legSearch, legOffset]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-body text-sm text-white/40">State not found.</p>
      </div>
    );
  }

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'legislators' as const, label: `Legislators (${fmtNum(dashboard.total_legislators)})` },
    { key: 'bills' as const, label: `Bills (${fmtNum(dashboard.total_bills)})` },
  ];

  return (
    <div className="min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        {/* Nav */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <PoliticsSectorHeader />
        </motion.nav>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-8"
        >
          <Link
            to="/politics/states"
            className="inline-flex items-center gap-1.5 font-body text-xs text-white/40 hover:text-white/60 transition-colors no-underline mb-4"
          >
            <ArrowLeft size={14} />
            All States
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="font-heading text-4xl font-bold tracking-tight text-white lg:text-5xl">
              {dashboard.name}
            </h1>
            <span className="font-mono text-2xl text-blue-400 font-bold">{dashboard.code}</span>
          </div>
          <div className="mt-3 flex items-center gap-6">
            <span className="font-mono text-sm text-white/40">
              <Users size={14} className="inline mr-1.5" />
              {fmtNum(dashboard.total_legislators)} legislators
            </span>
            <span className="font-mono text-sm text-white/40">
              <FileText size={14} className="inline mr-1.5" />
              {fmtNum(dashboard.total_bills)} bills
            </span>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex gap-1 mb-8 border-b border-white/10"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 font-body text-sm font-medium transition-colors border-b-2 -mb-[1px] cursor-pointer ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-white/40 hover:text-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <OverviewTab dashboard={dashboard} />
        )}
        {activeTab === 'legislators' && (
          <LegislatorsTab
            legislators={legislators}
            total={legTotal}
            search={legSearch}
            onSearchChange={setLegSearch}
            chamberFilter={chamberFilter}
            onChamberChange={setChamberFilter}
            partyFilter={partyFilter}
            onPartyChange={setPartyFilter}
            offset={legOffset}
            onOffsetChange={setLegOffset}
          />
        )}
        {activeTab === 'bills' && (
          <BillsTab
            stateCode={code}
            recentBills={dashboard.recent_bills}
          />
        )}

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <Link to="/politics/states" className="font-body text-sm text-white/50 hover:text-white transition-colors no-underline">
            &larr; State Explorer
          </Link>
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}

// ── Overview Tab ──

function OverviewTab({ dashboard }: { dashboard: StateDashboardData }) {
  const chambers = Object.keys(dashboard.party_by_chamber);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      {/* Party Breakdown */}
      <SpotlightCard
        className="rounded-xl border border-white/10 bg-white/[0.03]"
        spotlightColor="rgba(59, 130, 246, 0.08)"
      >
        <div className="p-6">
          <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white mb-5">
            Party Breakdown
          </h2>

          {/* Overall bar */}
          <div className="mb-6">
            <p className="font-mono text-xs text-white/30 mb-2">Overall</p>
            <PartyBar parties={dashboard.by_party} total={dashboard.total_legislators} />
          </div>

          {/* Per-chamber bars */}
          {chambers.map((chamber) => (
            <div key={chamber} className="mb-4">
              <p className="font-mono text-xs text-white/30 mb-2">
                {CHAMBER_LABELS[chamber] || chamber}
                <span className="ml-2 text-white/20">
                  ({Object.values(dashboard.party_by_chamber[chamber]).reduce((s, v) => s + v, 0)} members)
                </span>
              </p>
              <PartyBar
                parties={dashboard.party_by_chamber[chamber]}
                total={Object.values(dashboard.party_by_chamber[chamber]).reduce((s, v) => s + v, 0)}
              />
            </div>
          ))}
        </div>
      </SpotlightCard>

      {/* Recent Bills */}
      {dashboard.recent_bills.length > 0 && (
        <SpotlightCard
          className="rounded-xl border border-white/10 bg-white/[0.03]"
          spotlightColor="rgba(245, 158, 11, 0.08)"
        >
          <div className="p-6">
            <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white mb-4">
              Recent Bills
            </h2>
            <div className="space-y-3">
              {dashboard.recent_bills.map((bill) => (
                <BillRow key={bill.bill_id} bill={bill} />
              ))}
            </div>
          </div>
        </SpotlightCard>
      )}
    </motion.div>
  );
}

// ── Party Bar ──

function PartyBar({ parties, total }: { parties: Record<string, number>; total: number }) {
  if (total === 0) return null;

  // Sort: D first, then R, then others
  const order = ['D', 'R', 'I'];
  const sorted = Object.entries(parties).sort(([a], [b]) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="flex h-8 overflow-hidden rounded-lg">
      {sorted.map(([party, count]) => {
        const pct = (count / total) * 100;
        if (pct === 0) return null;
        const color = PARTY_COLORS[party] || '#6B7280';
        const label = PARTY_LABELS[party] || party;

        return (
          <div
            key={party}
            className="flex items-center justify-center transition-all"
            style={{ width: `${pct}%`, backgroundColor: color }}
            title={`${label}: ${count} (${pct.toFixed(1)}%)`}
          >
            {pct > 10 && (
              <span className="font-mono text-[10px] font-bold text-white/90">
                {party} {count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Bill Row ──

function BillRow({ bill }: { bill: StateBill }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left p-3 rounded-lg hover:bg-white/[0.02] transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-400">
              {bill.identifier}
            </span>
            {bill.session && (
              <span className="font-mono text-[10px] text-white/20">
                Session {bill.session}
              </span>
            )}
          </div>
          <p className={`font-body text-sm text-white/80 ${expanded ? '' : 'line-clamp-2'}`}>
            {bill.title}
          </p>
          {expanded && (
            <div className="mt-2 space-y-1">
              {bill.sponsor_name && (
                <p className="font-mono text-xs text-white/30">
                  Sponsor: {bill.sponsor_name}
                </p>
              )}
              {bill.latest_action && (
                <p className="font-mono text-xs text-white/30">
                  Latest: {bill.latest_action}
                </p>
              )}
              {bill.source_url && (
                <a
                  href={bill.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300 no-underline"
                >
                  View Source <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {bill.latest_action_date && (
            <span className="font-mono text-[10px] text-white/20 tabular-nums">
              {new Date(bill.latest_action_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
          {expanded ? (
            <ChevronUp size={12} className="text-white/20" />
          ) : (
            <ChevronDown size={12} className="text-white/20" />
          )}
        </div>
      </div>
    </button>
  );
}

// ── Legislators Tab ──

function LegislatorsTab({
  legislators,
  total,
  search,
  onSearchChange,
  chamberFilter,
  onChamberChange,
  partyFilter,
  onPartyChange,
  offset,
  onOffsetChange,
}: {
  legislators: StateLegislator[];
  total: number;
  search: string;
  onSearchChange: (v: string) => void;
  chamberFilter: string;
  onChamberChange: (v: string) => void;
  partyFilter: string;
  onPartyChange: (v: string) => void;
  offset: number;
  onOffsetChange: (v: number) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => { onSearchChange(e.target.value); onOffsetChange(0); }}
            placeholder="Search legislators..."
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-10 py-2.5 font-body text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none transition-colors"
          />
        </div>
        <select
          value={chamberFilter}
          onChange={(e) => { onChamberChange(e.target.value); onOffsetChange(0); }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 font-body text-sm text-white/60 focus:border-blue-500/50 focus:outline-none"
        >
          <option value="">All Chambers</option>
          <option value="upper">Senate</option>
          <option value="lower">House</option>
        </select>
        <select
          value={partyFilter}
          onChange={(e) => { onPartyChange(e.target.value); onOffsetChange(0); }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 font-body text-sm text-white/60 focus:border-blue-500/50 focus:outline-none"
        >
          <option value="">All Parties</option>
          <option value="D">Democrat</option>
          <option value="R">Republican</option>
          <option value="I">Independent</option>
        </select>
      </div>

      {/* Results count */}
      <p className="font-mono text-xs text-white/30 mb-4">
        {fmtNum(total)} legislator{total !== 1 ? 's' : ''}
        {offset > 0 && ` (showing ${offset + 1}-${Math.min(offset + 50, total)})`}
      </p>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {legislators.map((leg, idx) => (
          <motion.div
            key={leg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.3) }}
          >
            <LegislatorCard legislator={leg} />
          </motion.div>
        ))}
      </div>

      {legislators.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-body text-sm text-white/30">No legislators found.</p>
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => onOffsetChange(Math.max(0, offset - 50))}
            disabled={offset === 0}
            className="rounded-lg border border-white/10 px-4 py-2 font-body text-xs text-white/50 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Previous
          </button>
          <span className="font-mono text-xs text-white/30">
            Page {Math.floor(offset / 50) + 1} of {Math.ceil(total / 50)}
          </span>
          <button
            onClick={() => onOffsetChange(offset + 50)}
            disabled={offset + 50 >= total}
            className="rounded-lg border border-white/10 px-4 py-2 font-body text-xs text-white/50 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ── Legislator Card ──

function LegislatorCard({ legislator }: { legislator: StateLegislator }) {
  const color = PARTY_COLORS[legislator.party || ''] || '#6B7280';
  const initials = legislator.name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-white/20">
      <div className="flex items-center gap-3">
        {legislator.photo_url ? (
          <img
            src={legislator.photo_url}
            alt={legislator.name}
            className="h-10 w-10 rounded-full object-cover ring-2 ring-white/10"
          />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full font-heading text-sm font-bold text-white ring-2 ring-white/10"
            style={{ backgroundColor: `${color}33` }}
          >
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm font-semibold text-white truncate">
            {legislator.name}
          </p>
          <p className="font-mono text-[10px] text-white/30">
            {legislator.district ? `District ${legislator.district}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {PARTY_LABELS[legislator.party || ''] || legislator.party || 'Unknown'}
        </span>
        {legislator.chamber && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/40">
            {CHAMBER_LABELS[legislator.chamber] || legislator.chamber}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Bills Tab ──

function BillsTab({ stateCode, recentBills }: { stateCode: string; recentBills: StateBill[] }) {
  const [bills, setBills] = useState<StateBill[]>(recentBills);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!search.trim() && offset === 0) {
      setBills(recentBills);
      return;
    }
    setSearching(true);
    fetchStateBills(stateCode, {
      search: search || undefined,
      limit: 50,
      offset,
    })
      .then((data) => {
        setBills(data.bills);
        setTotal(data.total);
      })
      .catch(console.error)
      .finally(() => setSearching(false));
  }, [stateCode, search, offset]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Search */}
      <div className="relative max-w-md mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          placeholder="Search bills..."
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-10 py-2.5 font-body text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none transition-colors"
        />
      </div>

      {searching && (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      )}

      {!searching && (
        <div className="space-y-2">
          {bills.map((bill) => (
            <BillRow key={bill.bill_id} bill={bill} />
          ))}
        </div>
      )}

      {!searching && bills.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-body text-sm text-white/30">No bills found.</p>
        </div>
      )}

      {/* Pagination for search results */}
      {search.trim() && total > 50 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setOffset(Math.max(0, offset - 50))}
            disabled={offset === 0}
            className="rounded-lg border border-white/10 px-4 py-2 font-body text-xs text-white/50 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Previous
          </button>
          <span className="font-mono text-xs text-white/30">
            Page {Math.floor(offset / 50) + 1} of {Math.ceil(total / 50)}
          </span>
          <button
            onClick={() => setOffset(offset + 50)}
            disabled={offset + 50 >= total}
            className="rounded-lg border border-white/10 px-4 py-2 font-body text-xs text-white/50 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </motion.div>
  );
}
