import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Users,
  FileText,
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchStateDashboard, fetchStateLegislators, fetchStateBills } from '../api/state';
import type { StateDashboardData, StateLegislator, StateBill } from '../api/state';
import { fmtNum } from '../utils/format';

// ── Party / chamber config (design tokens + hex for alpha interpolation) ──

const PARTY_TOKEN: Record<string, string> = {
  D: 'var(--color-dem)',
  R: 'var(--color-rep)',
  I: 'var(--color-ind)',
};

const PARTY_HEX: Record<string, string> = {
  D: '#4A7FDE',
  R: '#E05555',
  I: '#B06FD8',
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

// ── Shared styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: '1400px',
  margin: '0 auto',
  padding: '72px 32px 96px',
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 12px',
  borderRadius: '999px',
  background: 'var(--color-accent-dim)',
  color: 'var(--color-accent-text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '20px',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid rgba(235,229,213,0.08)',
  borderRadius: '16px',
  padding: '24px',
};

const cardHeader: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  color: 'var(--color-text-2)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  margin: '0 0 20px',
};

const backLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--color-text-2)',
  textDecoration: 'none',
  marginBottom: '20px',
  transition: 'color 0.2s',
};

// ── Page ──

export default function StateDashboardPage() {
  const { stateCode } = useParams<{ stateCode: string }>();
  const code = (stateCode || '').toUpperCase();

  const [dashboard, setDashboard] = useState<StateDashboardData | null>(null);
  const [legislators, setLegislators] = useState<StateLegislator[]>([]);
  const [loading, setLoading] = useState(true);

  const [legSearch, setLegSearch] = useState('');
  const [chamberFilter, setChamberFilter] = useState<string>('');
  const [partyFilter, setPartyFilter] = useState<string>('');
  const [legOffset, setLegOffset] = useState(0);
  const [legTotal, setLegTotal] = useState(0);

  const [activeTab, setActiveTab] = useState<'overview' | 'legislators' | 'bills'>('overview');

  const initialLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!code) return;
    setLoading(true);
    Promise.all([
      fetchStateDashboard(code),
      fetchStateLegislators(code, { limit: 50 }),
    ])
      .then(([dash, legs]) => {
        if (cancelled) return;
        setDashboard(dash);
        setLegislators(legs.legislators);
        setLegTotal(legs.total);
      })
      .catch((err) => { console.warn('[StateDashboardPage] fetch failed:', err); })
      .finally(() => { setLoading(false); initialLoadedRef.current = true; });
    return () => { cancelled = true; };
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    if (!code || loading) return;
    if (!initialLoadedRef.current) return;
    fetchStateLegislators(code, {
      chamber: chamberFilter || undefined,
      party: partyFilter || undefined,
      search: legSearch || undefined,
      limit: 50,
      offset: legOffset,
    })
      .then((data) => {
        if (cancelled) return;
        setLegislators(data.legislators);
        setLegTotal(data.total);
      })
      .catch((err) => { console.warn('[StateDashboardPage] fetch failed:', err); });
    return () => { cancelled = true; };
  }, [code, chamberFilter, partyFilter, legSearch, legOffset]);

  if (loading) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '2px solid var(--color-accent)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-text-2)' }}>
          State not found.
        </p>
      </div>
    );
  }

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'legislators' as const, label: `Legislators (${fmtNum(dashboard.total_legislators)})` },
    { key: 'bills' as const, label: dashboard.total_bills > 0 ? `Bills (${fmtNum(dashboard.total_bills)})` : 'Bills' },
  ];

  return (
    <div style={pageShell}>
      <div style={contentWrap}>
        {/* Back link */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link
            to="/politics/states"
            style={backLink}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            <ArrowLeft size={14} /> All States
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          style={{ marginBottom: '32px' }}
        >
          <span style={eyebrowStyle}>Politics / State Dashboard</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: 'clamp(44px, 7vw, 76px)',
                lineHeight: 1.02,
                letterSpacing: '-0.02em',
                margin: 0,
                color: 'var(--color-text-1)',
              }}
            >
              {dashboard.name}
            </h1>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '28px',
                fontWeight: 700,
                color: 'var(--color-accent-text)',
              }}
            >
              {dashboard.code}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                color: 'var(--color-text-2)',
              }}
            >
              <Users size={14} /> {fmtNum(dashboard.total_legislators)} legislators
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                color: 'var(--color-text-2)',
              }}
            >
              <FileText size={14} />
              {dashboard.total_bills > 0 ? `${fmtNum(dashboard.total_bills)} bills` : 'State bill data coming soon'}
            </span>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          style={{
            display: 'flex',
            gap: '4px',
            marginBottom: '32px',
            borderBottom: '1px solid rgba(235,229,213,0.08)',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '12px 20px',
                border: 'none',
                borderBottom: `2px solid ${activeTab === tab.key ? 'var(--color-accent)' : 'transparent'}`,
                background: 'transparent',
                color: activeTab === tab.key ? 'var(--color-accent-text)' : 'var(--color-text-2)',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                marginBottom: '-1px',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* Tab Content */}
        {activeTab === 'overview' && <OverviewTab dashboard={dashboard} />}
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
            totalBills={dashboard.total_bills}
          />
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: '64px',
            borderTop: '1px solid rgba(235,229,213,0.06)',
            paddingTop: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Link
            to="/politics/states"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--color-text-2)',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            ← State Explorer
          </Link>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--color-text-3)',
              letterSpacing: '0.12em',
            }}
          >
            WeThePeople
          </span>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
      style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      {/* Party breakdown */}
      <div style={cardStyle}>
        <h2 style={cardHeader}>Party Breakdown</h2>

        <div style={{ marginBottom: '24px' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--color-text-3)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: '0 0 8px',
            }}
          >
            Overall
          </p>
          <PartyBar parties={dashboard.by_party} total={dashboard.total_legislators} />
        </div>

        {chambers.map((chamber) => {
          const subtotal = Object.values(dashboard.party_by_chamber[chamber]).reduce((s, v) => s + v, 0);
          return (
            <div key={chamber} style={{ marginBottom: '16px' }}>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--color-text-3)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  margin: '0 0 8px',
                }}
              >
                {CHAMBER_LABELS[chamber] || chamber}{' '}
                <span style={{ color: 'rgba(235,229,213,0.25)' }}>({subtotal} members)</span>
              </p>
              <PartyBar parties={dashboard.party_by_chamber[chamber]} total={subtotal} />
            </div>
          );
        })}
      </div>

      {/* Recent bills */}
      {dashboard.recent_bills.length > 0 && (
        <div style={cardStyle}>
          <h2 style={cardHeader}>Recent Bills</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {dashboard.recent_bills.map((bill) => (
              <BillRow key={bill.bill_id} bill={bill} />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Party bar ──

function PartyBar({ parties, total }: { parties: Record<string, number>; total: number }) {
  if (total === 0) return null;
  const order = ['D', 'R', 'I'];
  const sorted = Object.entries(parties).sort(([a], [b]) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div
      style={{
        display: 'flex',
        height: '32px',
        borderRadius: '8px',
        overflow: 'hidden',
        background: 'rgba(235,229,213,0.06)',
      }}
    >
      {sorted.map(([party, count]) => {
        const pct = (count / total) * 100;
        if (pct === 0) return null;
        const color = PARTY_TOKEN[party] || 'rgba(235,229,213,0.3)';
        const label = PARTY_LABELS[party] || party;

        return (
          <div
            key={party}
            title={`${label}: ${count} (${pct.toFixed(1)}%)`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: `${pct}%`,
              background: color,
              transition: 'width 0.6s',
            }}
          >
            {pct > 10 && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#07090C',
                }}
              >
                {party} {count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Bill row ──

function BillRow({ bill }: { bill: StateBill }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '12px',
        borderRadius: '10px',
        border: '1px solid rgba(235,229,213,0.06)',
        background: expanded ? 'var(--color-surface-2)' : 'transparent',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!expanded) e.currentTarget.style.background = 'rgba(235,229,213,0.03)';
      }}
      onMouseLeave={(e) => {
        if (!expanded) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'var(--color-accent-dim)',
                color: 'var(--color-accent-text)',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              {bill.identifier}
            </span>
            {bill.session && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)' }}>
                Session {bill.session}
              </span>
            )}
          </div>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--color-text-1)',
              lineHeight: 1.45,
              margin: 0,
              display: expanded ? 'block' : '-webkit-box',
              WebkitLineClamp: expanded ? undefined : 2,
              WebkitBoxOrient: 'vertical',
              overflow: expanded ? 'visible' : 'hidden',
            }}
          >
            {bill.title}
          </p>
          {expanded && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {bill.sponsor_name && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', margin: 0 }}>
                  Sponsor: <span style={{ color: 'var(--color-text-2)' }}>{bill.sponsor_name}</span>
                </p>
              )}
              {bill.latest_action && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', margin: 0 }}>
                  Latest: <span style={{ color: 'var(--color-text-2)' }}>{bill.latest_action}</span>
                </p>
              )}
              {bill.source_url && (
                <a
                  href={bill.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--color-accent-text)',
                    textDecoration: 'none',
                  }}
                >
                  View Source <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
          {bill.latest_action_date && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--color-text-3)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {new Date(bill.latest_action_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
          {expanded ? (
            <ChevronUp size={12} style={{ color: 'var(--color-text-3)' }} />
          ) : (
            <ChevronDown size={12} style={{ color: 'var(--color-text-3)' }} />
          )}
        </div>
      </div>
    </button>
  );
}

// ── Legislators tab ──

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '420px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-3)',
            }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => { onSearchChange(e.target.value); onOffsetChange(0); }}
            placeholder="Search legislators…"
            style={{
              width: '100%',
              padding: '10px 14px 10px 40px',
              borderRadius: '10px',
              border: '1px solid rgba(235,229,213,0.1)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-1)',
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(235,229,213,0.1)'; }}
          />
        </div>
        <select
          value={chamberFilter}
          onChange={(e) => { onChamberChange(e.target.value); onOffsetChange(0); }}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(235,229,213,0.1)',
            background: 'var(--color-surface)',
            color: 'var(--color-text-2)',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">All Chambers</option>
          <option value="upper">Senate</option>
          <option value="lower">House</option>
        </select>
        <select
          value={partyFilter}
          onChange={(e) => { onPartyChange(e.target.value); onOffsetChange(0); }}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(235,229,213,0.1)',
            background: 'var(--color-surface)',
            color: 'var(--color-text-2)',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">All Parties</option>
          <option value="D">Democrat</option>
          <option value="R">Republican</option>
          <option value="I">Independent</option>
        </select>
      </div>

      {/* Count */}
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--color-text-3)',
          letterSpacing: '0.08em',
          margin: '0 0 16px',
        }}
      >
        {fmtNum(total)} legislator{total !== 1 ? 's' : ''}
        {offset > 0 && ` (showing ${offset + 1}-${Math.min(offset + 50, total)})`}
      </p>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '12px',
        }}
      >
        {legislators.map((leg, idx) => (
          <motion.div
            key={leg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(idx * 0.02, 0.3) }}
          >
            <LegislatorCard legislator={leg} />
          </motion.div>
        ))}
      </div>

      {legislators.length === 0 && (
        <div style={{ padding: '64px 0', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-text-3)' }}>
            No legislators found.
          </p>
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '32px' }}>
          <button
            onClick={() => onOffsetChange(Math.max(0, offset - 50))}
            disabled={offset === 0}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(235,229,213,0.1)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-2)',
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              cursor: offset === 0 ? 'not-allowed' : 'pointer',
              opacity: offset === 0 ? 0.3 : 1,
            }}
          >
            Previous
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
            Page {Math.floor(offset / 50) + 1} of {Math.ceil(total / 50)}
          </span>
          <button
            onClick={() => onOffsetChange(offset + 50)}
            disabled={offset + 50 >= total}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(235,229,213,0.1)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-2)',
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              cursor: offset + 50 >= total ? 'not-allowed' : 'pointer',
              opacity: offset + 50 >= total ? 0.3 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ── Legislator card ──

function LegislatorCard({ legislator }: { legislator: StateLegislator }) {
  const key = (legislator.party || '').charAt(0).toUpperCase();
  const color = PARTY_TOKEN[key] || 'var(--color-text-2)';
  const hex = PARTY_HEX[key] || '#6B7280';
  const initials = legislator.name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      style={{
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid rgba(235,229,213,0.08)',
        background: 'var(--color-surface)',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-2)';
        e.currentTarget.style.borderColor = `${hex}40`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--color-surface)';
        e.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {legislator.photo_url ? (
          <img
            src={legislator.photo_url}
            alt={legislator.name}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: `2px solid ${hex}40`,
            }}
          />
        ) : (
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `${hex}26`,
              border: `2px solid ${hex}40`,
              color: color,
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: '14px',
            }}
          >
            {initials}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          {legislator.ocd_id ? (
            <a
              href={`https://openstates.org/person/${legislator.ocd_id}/`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--color-text-1)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'block',
              }}
            >
              {legislator.name}
              <ExternalLink size={10} style={{ display: 'inline', marginLeft: '4px', opacity: 0.4 }} />
            </a>
          ) : (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--color-text-1)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                margin: 0,
              }}
            >
              {legislator.name}
            </p>
          )}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)', margin: 0 }}>
            {legislator.district ? `District ${legislator.district}` : ''}
          </p>
        </div>
      </div>
      <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            padding: '3px 8px',
            borderRadius: '999px',
            background: `${hex}1F`,
            color: color,
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
          }}
        >
          {PARTY_LABELS[key] || legislator.party || 'Unknown'}
        </span>
        {legislator.chamber && (
          <span
            style={{
              padding: '3px 8px',
              borderRadius: '999px',
              background: 'rgba(235,229,213,0.06)',
              color: 'var(--color-text-2)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
            }}
          >
            {CHAMBER_LABELS[legislator.chamber] || legislator.chamber}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Bills tab ──

function BillsTab({
  stateCode,
  recentBills,
  totalBills,
}: {
  stateCode: string;
  recentBills: StateBill[];
  totalBills: number;
}) {
  const [bills, setBills] = useState<StateBill[]>(recentBills);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(totalBills);
  const [offset, setOffset] = useState(0);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!search.trim() && offset === 0) {
      setBills(recentBills);
      return;
    }
    setSearching(true);
    fetchStateBills(stateCode, { search: search || undefined, limit: 50, offset })
      .then((data) => {
        if (cancelled) return;
        setBills(data.bills);
        setTotal(data.total);
      })
      .catch((err) => { console.warn('[StateDashboardPage] fetch failed:', err); })
      .finally(() => setSearching(false));
    return () => { cancelled = true; };
  }, [stateCode, search, offset]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      {/* Search */}
      <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '24px' }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-text-3)',
          }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          placeholder="Search bills…"
          style={{
            width: '100%',
            padding: '10px 14px 10px 40px',
            borderRadius: '10px',
            border: '1px solid rgba(235,229,213,0.1)',
            background: 'var(--color-surface)',
            color: 'var(--color-text-1)',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(235,229,213,0.1)'; }}
        />
      </div>

      {searching && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              border: '2px solid var(--color-accent)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      )}

      {!searching && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {bills.map((bill) => (
            <BillRow key={bill.bill_id} bill={bill} />
          ))}
        </div>
      )}

      {!searching && bills.length === 0 && (
        <div style={{ padding: '64px 0', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-text-3)' }}>
            {search.trim() ? 'No bills found.' : 'State bill data coming soon'}
          </p>
        </div>
      )}

      {search.trim() && total > 50 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '32px' }}>
          <button
            onClick={() => setOffset(Math.max(0, offset - 50))}
            disabled={offset === 0}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(235,229,213,0.1)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-2)',
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              cursor: offset === 0 ? 'not-allowed' : 'pointer',
              opacity: offset === 0 ? 0.3 : 1,
            }}
          >
            Previous
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
            Page {Math.floor(offset / 50) + 1} of {Math.ceil(total / 50)}
          </span>
          <button
            onClick={() => setOffset(offset + 50)}
            disabled={offset + 50 >= total}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(235,229,213,0.1)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-2)',
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              cursor: offset + 50 >= total ? 'not-allowed' : 'pointer',
              opacity: offset + 50 >= total ? 0.3 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </motion.div>
  );
}
