import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, ChevronDown, FileText, Users, X } from 'lucide-react';
import CSVExport from '../components/CSVExport';
import { motion } from 'framer-motion';
import { getApiBaseUrl } from '../api/client';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import BillPipeline from '../components/BillPipeline';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

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

// 5-stage pipeline matching v2 design handoff Section 12
const STAGES = ['Introduced', 'In Committee', 'Passed Committee', 'Passed One Chamber', 'Signed into Law'] as const;

// Hex fallbacks kept for `${hex}12` / `${hex}18` opacity suffixes (CSS vars don't
// support alpha append).
const STAGE_COLORS: Array<{ token: string; hex: string }> = [
  { token: 'var(--color-text-3)', hex: '#6E7A85' }, // 0: Introduced
  { token: 'var(--color-dem)',    hex: '#4A7FDE' }, // 1: In Committee
  { token: 'var(--color-accent)', hex: '#C5A028' }, // 2: Passed Committee
  { token: 'var(--color-green)',  hex: '#3DB87A' }, // 3: Passed One Chamber
  { token: '#10B981',             hex: '#10B981' }, // 4: Signed into Law
];

// Map status_bucket → stage index (1-based progress, matches HTML prototype)
const STATUS_TO_PROGRESS: Record<string, number> = {
  introduced: 1,
  in_committee: 2,
  passed_one: 4,
  passed_house: 4,
  passed_senate: 4,
  passed_committee: 3,
  passed_both: 4,
  enacted: 5,
  became_law: 5,
  signed: 5,
  vetoed: 2,  // stalled at committee / presidential veto stage
  failed: 1,
};

const STATUS_LABELS: Record<string, string> = {
  introduced: 'Introduced',
  in_committee: 'In Committee',
  passed_one: 'Passed One Chamber',
  passed_house: 'Passed House',
  passed_senate: 'Passed Senate',
  passed_committee: 'Passed Committee',
  passed_both: 'Passed Both Chambers',
  enacted: 'Signed into Law',
  became_law: 'Signed into Law',
  signed: 'Signed into Law',
  vetoed: 'Vetoed',
  failed: 'Failed',
};

const PARTY_HEX: Record<string, string> = {
  D: '#4A7FDE',
  R: '#E05555',
  I: '#B06FD8',
};

const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function normalizeStatus(status: string | null | undefined): string {
  return (status || 'introduced').toLowerCase().replace(/\s+/g, '_');
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function progressFromStatus(status: string | null | undefined): number {
  const key = normalizeStatus(status);
  return STATUS_TO_PROGRESS[key] ?? 1;
}

function partyHex(party: string | null): string {
  return PARTY_HEX[(party || '').charAt(0).toUpperCase()] || '#6E7A85';
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

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

  // Fetch bills with cancellation so rapid filter changes don't race —
  // the most recent fetch always wins, earlier ones are aborted.
  const fetchBills = useCallback(
    async (currentOffset: number, signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(currentOffset));
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (chamberFilter !== 'all') params.set('chamber', chamberFilter);
        if (debouncedSearch) params.set('q', debouncedSearch);

        const res = await fetch(`${getApiBaseUrl()}/bills?${params}`, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: BillsResponse = await res.json();
        if (signal.aborted) return;

        if (currentOffset === 0) {
          setBills(data.bills || []);
        } else {
          setBills((prev) => [...prev, ...(data.bills || [])]);
        }
        setTotal(data.total || 0);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load bills');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [statusFilter, chamberFilter, debouncedSearch],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchBills(offset, controller.signal);
    return () => controller.abort();
  }, [fetchBills, offset]);

  const loadMore = () => {
    if (bills.length < total) setOffset(bills.length);
  };

  // Unique sponsors for dropdown
  const uniqueSponsors = useMemo(() => {
    const map = new Map<string, string>();
    for (const bill of bills) {
      const primary = bill.sponsors?.find((s) => s.role === 'sponsor') || bill.sponsors?.[0];
      if (primary?.display_name) map.set(primary.display_name, primary.display_name);
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
        const bucket = normalizeStatus(b.status_bucket);
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
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text-1)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 40px 64px' }}>
        {/* Header chrome */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ marginBottom: 40 }}
        >
          <PoliticsSectorHeader />
        </motion.nav>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{ marginBottom: 24 }}
        >
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--color-accent-text)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Legislation Tracker
          </div>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(32px, 5vw, 44px)',
              color: 'var(--color-text-1)',
              margin: '0 0 8px 0',
              letterSpacing: '-0.01em',
              lineHeight: 1.05,
            }}
          >
            Active Legislation
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: 'var(--color-text-2)',
              maxWidth: 600,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Bills and resolutions moving through Congress — filter by status, chamber, sponsor, or search by
            keyword.
          </p>
        </motion.div>

        {/* Search + Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{ marginBottom: 24 }}
        >
          <div style={{ position: 'relative', marginBottom: showFilters ? 12 : 0 }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-3)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bills by title or keyword..."
              style={{
                width: '100%',
                padding: '12px 120px 12px 40px',
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: 'var(--color-text-1)',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-hover)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
            />
            <button
              onClick={() => setShowFilters((s) => !s)}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: showFilters ? 'rgba(74,127,222,0.12)' : 'var(--color-surface-2)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                color: showFilters ? 'var(--color-dem)' : 'var(--color-text-2)',
                cursor: 'pointer',
              }}
            >
              <Filter size={12} /> Filters
              <ChevronDown
                size={11}
                style={{
                  transition: 'transform 0.2s ease',
                  transform: showFilters ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </button>
          </div>

          {showFilters && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 24,
                padding: 16,
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--color-text-3)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 8,
                  }}
                >
                  Status
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {STATUS_OPTIONS.map((opt) => {
                    const active = statusFilter === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => { setStatusFilter(opt.key); setPipelineStage(''); }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 999,
                          border: active
                            ? '1px solid var(--color-dem)'
                            : '1px solid var(--color-border)',
                          background: active ? 'rgba(74,127,222,0.12)' : 'transparent',
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 11,
                          fontWeight: active ? 600 : 500,
                          color: active ? 'var(--color-dem)' : 'var(--color-text-2)',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--color-text-3)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 8,
                  }}
                >
                  Chamber
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CHAMBER_OPTIONS.map((opt) => {
                    const active = chamberFilter === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setChamberFilter(opt.key)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 999,
                          border: active
                            ? '1px solid var(--color-dem)'
                            : '1px solid var(--color-border)',
                          background: active ? 'rgba(74,127,222,0.12)' : 'transparent',
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 11,
                          fontWeight: active ? 600 : 500,
                          color: active ? 'var(--color-dem)' : 'var(--color-text-2)',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Bill Pipeline (existing click-to-filter visualization, preserved) */}
        {bills.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            style={{ marginBottom: 20 }}
          >
            <BillPipeline
              bills={bills}
              onStageClick={(stage) => { setPipelineStage(stage); setStatusFilter('all'); }}
              activeStage={pipelineStage}
            />
          </motion.div>
        )}

        {/* Sponsor + active-filter chips */}
        {bills.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}
          >
            {uniqueSponsors.length > 0 && (
              <div style={{ position: 'relative' }}>
                <Users
                  size={12}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-3)',
                    pointerEvents: 'none',
                  }}
                />
                <select
                  value={sponsorFilter}
                  onChange={(e) => setSponsorFilter(e.target.value)}
                  style={{
                    appearance: 'none',
                    padding: '7px 28px 7px 28px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 11,
                    color: 'var(--color-text-2)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All Sponsors</option>
                  {uniqueSponsors.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown
                  size={11}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-3)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            )}

            {pipelineStage && (
              <button
                onClick={() => setPipelineStage('')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'rgba(74,127,222,0.15)',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--color-dem)',
                  cursor: 'pointer',
                }}
              >
                Stage: {pipelineStage.replace(/_/g, ' ')}
                <X size={10} />
              </button>
            )}
            {sponsorFilter && (
              <button
                onClick={() => setSponsorFilter('')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'rgba(176,111,216,0.15)',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--color-ind)',
                  cursor: 'pointer',
                }}
              >
                Sponsor: {sponsorFilter}
                <X size={10} />
              </button>
            )}
          </motion.div>
        )}

        {/* Results count + CSV export */}
        {!loading && !error && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: 'var(--color-text-3)',
                margin: 0,
              }}
            >
              {filteredBills.length !== bills.length
                ? `${filteredBills.length} of ${total.toLocaleString()} bill${total !== 1 ? 's' : ''} shown`
                : `${total.toLocaleString()} bill${total !== 1 ? 's' : ''} found`}
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

        {/* Error */}
        {error && (
          <div
            style={{
              padding: 32,
              borderRadius: 12,
              border: '1px solid rgba(230,57,70,0.3)',
              background: 'rgba(230,57,70,0.05)',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: 'var(--color-red)',
                margin: 0,
              }}
            >
              {error}
            </p>
            <button
              onClick={() => {
                const c = new AbortController();
                fetchBills(0, c.signal);
              }}
              style={{
                marginTop: 14,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: 'var(--color-text-2)',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && bills.length === 0 && !error && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div
              style={{
                height: 32,
                width: 32,
                borderRadius: '50%',
                border: '2px solid var(--color-border)',
                borderTopColor: 'var(--color-accent)',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filteredBills.length === 0 && (
          <div
            style={{
              padding: '60px 20px',
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              textAlign: 'center',
            }}
          >
            <FileText
              size={40}
              style={{ display: 'block', margin: '0 auto 14px', color: 'var(--color-text-3)' }}
            />
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-2)', margin: '0 0 4px' }}>
              No legislation found matching your criteria.
            </p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--color-text-3)', margin: 0 }}>
              Try adjusting your filters or search term.
            </p>
          </div>
        )}

        {/* Bill cards */}
        {filteredBills.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
            <button
              onClick={loadMore}
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-text-2)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = 'var(--color-surface-2)';
                  e.currentTarget.style.color = 'var(--color-text-1)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-surface)';
                e.currentTarget.style.color = 'var(--color-text-2)';
              }}
            >
              {loading ? 'Loading…' : `Show More (${bills.length} of ${total.toLocaleString()})`}
            </button>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 64,
            paddingTop: 20,
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            to="/politics"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-text-2)',
              textDecoration: 'none',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            ← Politics Dashboard
          </Link>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: 'var(--color-text-3)',
            }}
          >
            WeThePeople
          </span>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Legislation Card (with 5-dot vertical pipeline indicator)
// ─────────────────────────────────────────────────────────────────────

function LegislationCard({ bill }: { bill: BillEntry }) {
  const progress = progressFromStatus(bill.status_bucket); // 1-5
  const stageIdx = Math.max(0, Math.min(4, progress - 1));
  const stage = STAGE_COLORS[stageIdx];
  const primarySponsor = bill.sponsors?.find((s) => s.role === 'sponsor') || bill.sponsors?.[0];
  const statusLabel = STATUS_LABELS[normalizeStatus(bill.status_bucket)] || STAGES[stageIdx];

  return (
    <Link
      to={`/politics/bill/${bill.bill_id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        style={{
          padding: '16px 20px',
          borderRadius: 10,
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          cursor: 'pointer',
          transition: 'border-color 0.18s ease, transform 0.18s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          {/* 5-dot vertical pipeline indicator */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              flexShrink: 0,
              paddingTop: 4,
            }}
            aria-label={`Pipeline stage ${progress} of 5: ${statusLabel}`}
          >
            {STAGES.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background:
                    i < progress
                      ? STAGE_COLORS[Math.min(i, STAGE_COLORS.length - 1)].token
                      : 'var(--color-surface-2)',
                }}
              />
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Badge row */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--color-dem)',
                  background: 'rgba(74,127,222,0.12)',
                  borderRadius: 5,
                  padding: '2px 7px',
                  letterSpacing: '0.02em',
                }}
              >
                {bill.bill_id}
              </span>
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 10,
                  fontWeight: 600,
                  color: stage.token,
                  background: `${stage.hex}1F`,
                  borderRadius: 5,
                  padding: '2px 7px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {statusLabel}
              </span>
              {bill.policy_area && (
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 10,
                    color: 'var(--color-text-3)',
                    background: 'var(--color-surface-2)',
                    borderRadius: 5,
                    padding: '2px 7px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {bill.policy_area}
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
                marginBottom: 5,
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {bill.title}
            </div>

            {/* Meta row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              {primarySponsor && (
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 11,
                    color: 'var(--color-text-3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: partyHex(primarySponsor.party),
                    }}
                  />
                  Sponsor:{' '}
                  <span style={{ color: 'var(--color-text-2)' }}>
                    {primarySponsor.display_name}
                  </span>
                  {primarySponsor.party && (
                    <span style={{ color: 'var(--color-text-3)' }}>
                      ({primarySponsor.party}
                      {primarySponsor.state ? `-${primarySponsor.state}` : ''})
                    </span>
                  )}
                </span>
              )}
              {bill.introduced_date && (
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: 'var(--color-text-3)',
                  }}
                >
                  Introduced {formatDate(bill.introduced_date)}
                </span>
              )}
              {bill.latest_action_date && (
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: 'var(--color-text-3)',
                  }}
                >
                  Last action {formatDate(bill.latest_action_date)}
                </span>
              )}
            </div>

            {/* Latest action text */}
            {bill.latest_action_text && (
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  color: 'var(--color-text-3)',
                  margin: '6px 0 0 0',
                  display: '-webkit-box',
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {bill.latest_action_text}
              </p>
            )}
          </div>

          {/* Right-side progress badge */}
          <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 70 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: 'var(--color-text-3)',
                marginBottom: 4,
              }}
            >
              Stage {progress}/5
            </div>
            <div
              style={{
                width: 60,
                height: 4,
                borderRadius: 2,
                background: 'var(--color-surface-2)',
                marginLeft: 'auto',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 2,
                  background: stage.token,
                  width: `${(progress / 5) * 100}%`,
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
