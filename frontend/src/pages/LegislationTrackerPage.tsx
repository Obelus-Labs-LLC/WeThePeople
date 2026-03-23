import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, ChevronDown, FileText, Users } from 'lucide-react';
import CSVExport from '../components/CSVExport';
import { motion } from 'framer-motion';
import { getApiBaseUrl } from '../api/client';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import BillPipeline from '../components/BillPipeline';

// ── Types ──

interface BillEntry {
  bill_id: string;
  congress: number;
  bill_type: string;
  bill_number: number;
  title: string;
  policy_area: string | null;
  status_bucket: string | null;
  latest_action_text: string | null;
  latest_action_date: string | null;
  introduced_date: string | null;
  sponsors: Array<{
    bioguide_id: string;
    role: string;
    person_id: string | null;
    display_name: string;
    party: string | null;
    state: string | null;
    photo_url: string | null;
  }>;
}

interface BillsResponse {
  total: number;
  limit: number;
  offset: number;
  bills: BillEntry[];
}

// ── Constants ──

const STATUS_OPTIONS = [
  { key: 'all', label: 'All Statuses' },
  { key: 'introduced', label: 'Introduced' },
  { key: 'in_committee', label: 'In Committee' },
  { key: 'passed_one', label: 'Passed One Chamber' },
  { key: 'passed_both', label: 'Passed Both' },
  { key: 'became_law', label: 'Became Law' },
  { key: 'vetoed', label: 'Vetoed' },
];

const CHAMBER_OPTIONS = [
  { key: 'all', label: 'All Chambers' },
  { key: 'house', label: 'House' },
  { key: 'senate', label: 'Senate' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  introduced: { bg: 'rgba(107,114,128,0.2)', text: '#9CA3AF' },
  in_committee: { bg: 'rgba(245,158,11,0.2)', text: '#F59E0B' },
  passed_one: { bg: 'rgba(59,130,246,0.2)', text: '#3B82F6' },
  passed_house: { bg: 'rgba(59,130,246,0.2)', text: '#3B82F6' },
  passed_senate: { bg: 'rgba(59,130,246,0.2)', text: '#3B82F6' },
  passed_both: { bg: 'rgba(139,92,246,0.2)', text: '#8B5CF6' },
  enacted: { bg: 'rgba(16,185,129,0.2)', text: '#10B981' },
  became_law: { bg: 'rgba(16,185,129,0.2)', text: '#10B981' },
  signed: { bg: 'rgba(16,185,129,0.2)', text: '#10B981' },
  vetoed: { bg: 'rgba(239,68,68,0.2)', text: '#EF4444' },
  failed: { bg: 'rgba(239,68,68,0.2)', text: '#EF4444' },
};

const PIPELINE_STAGES = ['Introduced', 'Committee', 'Floor Vote', 'Other Chamber', 'President', 'Law'] as const;

const PARTY_COLORS: Record<string, string> = { D: '#3B82F6', R: '#EF4444', I: '#A855F7' };

const PAGE_SIZE = 20;

// ── Helpers ──

function statusStyle(status: string | null) {
  if (!status) return { bg: 'rgba(107,114,128,0.2)', text: '#9CA3AF' };
  return STATUS_COLORS[status.toLowerCase().replace(/\s+/g, '_')] || STATUS_COLORS.introduced;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusToStageIndex(status: string | null): number {
  if (!status) return 0;
  const map: Record<string, number> = {
    introduced: 0,
    in_committee: 1,
    passed_one: 2,
    passed_house: 2,
    passed_senate: 2,
    passed_both: 3,
    enacted: 5,
    became_law: 5,
    signed: 5,
    vetoed: 4,
    failed: 0,
  };
  return map[status.toLowerCase().replace(/\s+/g, '_')] ?? 0;
}

function partyColor(party: string | null): string {
  return PARTY_COLORS[party?.charAt(0) || ''] || '#6B7280';
}

// ── Page ──

export default function LegislationTrackerPage() {
  const [bills, setBills] = useState<BillEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [chamberFilter, setChamberFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [pipelineStage, setPipelineStage] = useState('');
  const [sponsorFilter, setSponsorFilter] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset offset on filter change
  useEffect(() => {
    setOffset(0);
    setBills([]);
  }, [debouncedSearch, statusFilter, chamberFilter]);

  // Fetch bills
  const fetchBills = useCallback(async (currentOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(currentOffset));
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (chamberFilter !== 'all') params.set('chamber', chamberFilter);
      if (debouncedSearch) params.set('q', debouncedSearch);

      const res = await fetch(`${getApiBaseUrl()}/bills?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BillsResponse = await res.json();

      if (currentOffset === 0) {
        setBills(data.bills || []);
      } else {
        setBills((prev) => [...prev, ...(data.bills || [])]);
      }
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, chamberFilter, debouncedSearch]);

  useEffect(() => {
    fetchBills(offset);
  }, [fetchBills, offset]);

  const loadMore = () => {
    if (bills.length < total) setOffset(bills.length);
  };

  // Unique sponsors for the dropdown
  // TODO: Fetch all unique sponsors from API instead of deriving from loaded page
  const uniqueSponsors = useMemo(() => {
    const map = new Map<string, string>();
    for (const bill of bills) {
      const primary = bill.sponsors?.find((s) => s.role === 'sponsor') || bill.sponsors?.[0];
      if (primary?.display_name) {
        map.set(primary.display_name, primary.display_name);
      }
    }
    return Array.from(map.values()).sort();
  }, [bills]);

  // Pipeline stage key → status_bucket mapping for client-side filtering
  const pipelineStageToBuckets: Record<string, string[]> = {
    introduced: ['introduced'],
    in_committee: ['in_committee'],
    passed_one: ['passed_one', 'passed_house', 'passed_senate'],
    passed_both: ['passed_both'],
    president: ['vetoed'],
    became_law: ['enacted', 'became_law', 'signed'],
  };

  // Filtered bills (client-side pipeline + sponsor filters on top of server-side filters)
  const filteredBills = useMemo(() => {
    let result = bills;
    if (pipelineStage) {
      const allowed = pipelineStageToBuckets[pipelineStage] || [];
      result = result.filter((b) => {
        const bucket = b.status_bucket?.toLowerCase().replace(/\s+/g, '_') || 'introduced';
        return allowed.includes(bucket);
      });
    }
    if (sponsorFilter) {
      result = result.filter((b) => {
        const primary = b.sponsors?.find((s) => s.role === 'sponsor') || b.sponsors?.[0];
        return primary?.display_name === sponsorFilter;
      });
    }
    return result;
  }, [bills, pipelineStage, sponsorFilter]);

  return (
    <div className="min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
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
          <p className="font-heading text-xs font-semibold tracking-[0.3em] text-blue-400 uppercase mb-3">
            Legislation Tracker
          </p>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-white lg:text-5xl">
            Active Legislation
          </h1>
          <p className="mt-3 max-w-2xl font-body text-base text-white/40 leading-relaxed">
            Browse bills and resolutions moving through Congress. Filter by status, chamber, or search by keyword.
          </p>
        </motion.div>

        {/* Search + Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-8"
        >
          {/* Search bar */}
          <div className="relative mb-4">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search legislation by title or keyword..."
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-12 py-3 font-body text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none transition-colors"
            />
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-body text-xs transition-colors ${
                showFilters ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40 hover:text-white/60'
              }`}
            >
              <Filter size={14} />
              Filters
              <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Filter pills */}
          {showFilters && (
            <div className="flex flex-wrap gap-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              {/* Status */}
              <div>
                <span className="font-body text-xs uppercase text-white/30 mb-2 block">Status</span>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { setStatusFilter(opt.key); setPipelineStage(''); }}
                      className={`rounded-full px-3 py-1.5 font-body text-xs transition-all ${
                        statusFilter === opt.key
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-white/5 text-white/40 border border-white/5 hover:text-white/60'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chamber */}
              <div>
                <span className="font-body text-xs uppercase text-white/30 mb-2 block">Chamber</span>
                <div className="flex flex-wrap gap-2">
                  {CHAMBER_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setChamberFilter(opt.key)}
                      className={`rounded-full px-3 py-1.5 font-body text-xs transition-all ${
                        chamberFilter === opt.key
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-white/5 text-white/40 border border-white/5 hover:text-white/60'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Bill Pipeline visualization */}
        {bills.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mb-6"
          >
            <BillPipeline
              bills={bills}
              onStageClick={(stage) => { setPipelineStage(stage); setStatusFilter('all'); }}
              activeStage={pipelineStage}
            />
          </motion.div>
        )}

        {/* Sponsor filter + active pipeline filter indicator */}
        {bills.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="flex flex-wrap items-center gap-3 mb-4"
          >
            {/* Sponsor dropdown */}
            {uniqueSponsors.length > 0 && (
              <div className="relative">
                <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                <select
                  value={sponsorFilter}
                  onChange={(e) => setSponsorFilter(e.target.value)}
                  className="appearance-none rounded-lg border border-white/10 bg-white/[0.03] pl-8 pr-8 py-1.5 font-body text-xs text-white/60 focus:border-blue-500/50 focus:outline-none transition-colors cursor-pointer"
                  style={{ backgroundImage: 'none' }}
                >
                  <option value="">All Sponsors</option>
                  {uniqueSponsors.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              </div>
            )}

            {/* Active filters display */}
            {(pipelineStage || sponsorFilter) && (
              <div className="flex items-center gap-2">
                {pipelineStage && (
                  <button
                    onClick={() => setPipelineStage('')}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/25 transition-colors"
                  >
                    Stage: {pipelineStage.replace(/_/g, ' ')}
                    <span className="text-blue-400/60">&times;</span>
                  </button>
                )}
                {sponsorFilter && (
                  <button
                    onClick={() => setSponsorFilter('')}
                    className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2.5 py-1 text-[10px] font-medium text-purple-400 hover:bg-purple-500/25 transition-colors"
                  >
                    Sponsor: {sponsorFilter}
                    <span className="text-purple-400/60">&times;</span>
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Results count + CSV export */}
        {!loading && !error && (
          <div className="mb-4 flex items-center justify-between">
            <p className="font-mono text-xs text-white/30">
              {filteredBills.length !== bills.length
                ? `${filteredBills.length} of ${total.toLocaleString()} bill${total !== 1 ? 's' : ''} shown`
                : `${total.toLocaleString()} bill${total !== 1 ? 's' : ''} found`
              }
            </p>
            <CSVExport
              data={filteredBills.map((b) => ({
                bill_id: b.bill_id,
                title: b.title,
                congress: b.congress,
                bill_type: b.bill_type,
                bill_number: b.bill_number,
                policy_area: b.policy_area,
                status: b.status_bucket,
                introduced_date: b.introduced_date,
                latest_action: b.latest_action_text,
                latest_action_date: b.latest_action_date,
                sponsor: b.sponsors?.[0]?.display_name || '',
              }))}
              filename="legislation"
              columns={[
                { key: 'bill_id', label: 'Bill ID' },
                { key: 'title', label: 'Title' },
                { key: 'congress', label: 'Congress' },
                { key: 'bill_type', label: 'Type' },
                { key: 'policy_area', label: 'Policy Area' },
                { key: 'status', label: 'Status' },
                { key: 'introduced_date', label: 'Introduced' },
                { key: 'latest_action', label: 'Latest Action' },
                { key: 'latest_action_date', label: 'Latest Action Date' },
                { key: 'sponsor', label: 'Sponsor' },
              ]}
            />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
            <p className="font-body text-sm text-red-400">{error}</p>
            <button
              onClick={() => fetchBills(0)}
              className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-body text-sm text-white/60 hover:bg-white/10 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && bills.length === 0 && !error && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredBills.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] py-16 text-center">
            <FileText size={40} className="mx-auto mb-4 text-white/10" />
            <p className="font-body text-sm text-white/40">
              No legislation found matching your criteria.
            </p>
            <p className="mt-1 font-body text-xs text-white/20">
              Try adjusting your filters or search term.
            </p>
          </div>
        )}

        {/* Bill cards */}
        {filteredBills.length > 0 && (
          <div className="flex flex-col gap-4">
            {filteredBills.map((bill, idx) => (
              <motion.div
                key={bill.bill_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.5) }}
              >
                <LegislationCard bill={bill} />
              </motion.div>
            ))}
          </div>
        )}

        {/* Load more */}
        {bills.length > 0 && bills.length < total && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 font-body text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              {loading ? 'Loading...' : `Show More (${bills.length} of ${total.toLocaleString()})`}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <Link to="/politics" className="font-body text-sm text-white/50 hover:text-white transition-colors no-underline">
            &larr; Politics Dashboard
          </Link>
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}

// ── Legislation Card ──

function LegislationCard({ bill }: { bill: BillEntry }) {
  const st = statusStyle(bill.status_bucket);
  const stageIndex = statusToStageIndex(bill.status_bucket);
  const primarySponsor = bill.sponsors?.find((s) => s.role === 'sponsor') || bill.sponsors?.[0];

  return (
    <Link
      to={`/politics/bill/${bill.bill_id}`}
      className="no-underline block"
    >
      <div
        className="group rounded-xl border border-white/5 p-6 transition-all duration-300 hover:border-white/10"
        style={{ backgroundColor: '#0F172A' }}
      >
        {/* Top row: bill ID + badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="rounded-full border border-blue-500/30 bg-blue-500/20 px-2.5 py-0.5 font-mono text-xs font-bold text-blue-400">
            {bill.bill_id}
          </span>
          {bill.status_bucket && (
            <span
              className="rounded-full px-2.5 py-0.5 font-body text-[10px] font-bold uppercase"
              style={{ backgroundColor: st.bg, color: st.text }}
            >
              {bill.status_bucket.replace(/_/g, ' ')}
            </span>
          )}
          {bill.policy_area && (
            <span className="rounded-full bg-white/5 px-2.5 py-0.5 font-body text-[10px] uppercase text-white/40">
              {bill.policy_area}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-body text-lg font-medium text-white line-clamp-2 group-hover:text-blue-400 transition-colors">
          {bill.title}
        </h3>

        {/* Pipeline */}
        <div className="mt-4 flex items-center gap-1">
          {PIPELINE_STAGES.map((stage, i) => (
            <div key={stage} className="flex items-center gap-1 flex-1">
              <div
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= stageIndex ? 'bg-blue-500' : 'bg-white/10'
                }`}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between">
          {PIPELINE_STAGES.map((stage, i) => (
            <span
              key={stage}
              className={`font-mono text-[9px] ${
                i <= stageIndex ? 'text-blue-400/60' : 'text-white/15'
              }`}
            >
              {stage}
            </span>
          ))}
        </div>

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-white/30">
          {primarySponsor && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: partyColor(primarySponsor.party) }}
              />
              <span className="text-white/50">{primarySponsor.display_name}</span>
              {primarySponsor.party && (
                <span className="text-white/20">({primarySponsor.party})</span>
              )}
            </span>
          )}
          {bill.introduced_date && (
            <span>Introduced {formatDate(bill.introduced_date)}</span>
          )}
          {bill.latest_action_date && (
            <span>Last action {formatDate(bill.latest_action_date)}</span>
          )}
        </div>

        {/* Latest action text */}
        {bill.latest_action_text && (
          <p className="mt-2 font-body text-xs text-white/20 line-clamp-1">
            {bill.latest_action_text}
          </p>
        )}
      </div>
    </Link>
  );
}
