import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, SearchX, MapPin, Users, X } from 'lucide-react';
import CSVExport from '../components/CSVExport';
import { motion } from 'framer-motion';
import { apiClient } from '../api/client';
import type { Person } from '../api/types';

// ── Types ──

type PartyFilter = 'all' | 'D' | 'R' | 'I';
type ChamberFilter = 'all' | 'house' | 'senate';
type StateFilter = 'all' | string;

// ── Party config (design tokens + hex for alpha interpolation) ──

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

const PARTY_LABEL: Record<string, string> = {
  D: 'Democrat',
  R: 'Republican',
  I: 'Independent',
};

function partyKey(party: string | null | undefined): 'D' | 'R' | 'I' | null {
  const k = (party || '').charAt(0).toUpperCase();
  if (k === 'D' || k === 'R' || k === 'I') return k;
  return null;
}

// ── Shared style constants ──

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

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(44px, 7vw, 76px)',
  lineHeight: 1.02,
  letterSpacing: '-0.02em',
  margin: '0 0 16px',
  color: 'var(--color-text-1)',
};

const leadStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '18px',
  lineHeight: 1.55,
  color: 'var(--color-text-2)',
  maxWidth: '720px',
  margin: '0 0 40px',
};

// ── FilterPill ──

function FilterPill({
  label,
  count,
  active,
  color,
  hex,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color: string;
  hex?: string;
  onClick: () => void;
}) {
  const activeHex = hex || '#C5A028';
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        whiteSpace: 'nowrap',
        borderRadius: '999px',
        padding: '8px 16px',
        border: `1px solid ${active ? color : 'rgba(235,229,213,0.12)'}`,
        background: active ? `${activeHex}1F` : 'transparent',
        color: active ? color : 'var(--color-text-2)',
        fontFamily: 'var(--font-body)',
        fontSize: '13px',
        fontWeight: 500,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {label}
      <span
        style={{
          borderRadius: '999px',
          padding: '2px 8px',
          background: active ? `${activeHex}33` : 'rgba(235,229,213,0.08)',
          color: active ? color : 'var(--color-text-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          fontWeight: 600,
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ── PersonCard ──

function PersonCard({ person, index }: { person: Person; index: number }) {
  const key = partyKey(person.party);
  const color = key ? PARTY_TOKEN[key] : 'var(--color-text-2)';
  const hex = key ? PARTY_HEX[key] : '#6B7280';
  const label = key ? PARTY_LABEL[key] : person.party || 'Unknown';
  const isSenate = person.chamber?.toLowerCase().includes('senate') || person.chamber?.toLowerCase() === 'upper';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.025 }}
    >
      <Link
        to={`/politics/people/${person.person_id}`}
        style={{ textDecoration: 'none', display: 'block', height: '100%' }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '24px',
            background: 'var(--color-surface)',
            border: '1px solid rgba(235,229,213,0.08)',
            borderRadius: '16px',
            transition: 'all 0.25s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-surface-2)';
            e.currentTarget.style.borderColor = `${hex}40`;
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--color-surface)';
            e.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {/* Top: photo + party tag */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            {person.photo_url ? (
              <img
                src={person.photo_url}
                alt={person.display_name}
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${hex}40`,
                }}
              />
            ) : (
              <div
                style={{
                  width: '56px',
                  height: '56px',
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
                  fontSize: '22px',
                }}
              >
                {person.display_name.charAt(0)}
              </div>
            )}
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: `1px solid ${hex}40`,
                background: `${hex}1F`,
                color: color,
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.08em',
              }}
            >
              {label.toUpperCase()}
            </span>
          </div>

          {/* Name */}
          <h3
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--color-text-1)',
              margin: '0 0 6px',
              lineHeight: 1.2,
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {person.display_name}
          </h3>

          {/* State */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
            <MapPin size={14} style={{ color: 'var(--color-text-3)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-text-2)' }}>
              {person.state}
            </span>
          </div>

          <div style={{ marginTop: 'auto' }} />

          {/* Footer stats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(235,229,213,0.08)',
            }}
          >
            <div>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--color-text-3)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  margin: '0 0 4px',
                }}
              >
                Chamber
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: 'var(--color-text-1)',
                  fontWeight: 500,
                  margin: 0,
                }}
              >
                {isSenate ? 'Senate' : 'House'}
              </p>
            </div>
            <div>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--color-text-3)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  margin: '0 0 4px',
                }}
              >
                Status
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: person.is_active ? 'var(--color-green)' : 'var(--color-text-3)',
                  fontWeight: 500,
                  margin: 0,
                }}
              >
                {person.is_active ? 'Active' : 'Inactive'}
              </p>
            </div>
            <div>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--color-text-3)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  margin: '0 0 4px',
                }}
              >
                Party
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: color,
                  fontWeight: 500,
                  margin: 0,
                }}
              >
                {label}
              </p>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ── PageButton (pagination) ──

function PageButton({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: '38px',
        padding: '8px 12px',
        borderRadius: '8px',
        border: active ? '1px solid var(--color-accent)' : '1px solid rgba(235,229,213,0.1)',
        background: active ? 'var(--color-accent-dim)' : 'var(--color-surface)',
        color: active ? 'var(--color-accent-text)' : 'var(--color-text-2)',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        transition: 'all 0.2s',
      }}
    >
      {children}
    </button>
  );
}

// ── Page ──

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('all');
  const [chamberFilter, setChamberFilter] = useState<ChamberFilter>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [zipCode, setZipCode] = useState('');
  const [zipRepIds, setZipRepIds] = useState<string[]>([]);

  useEffect(() => {
    apiClient
      .getPeople({ limit: 600 })
      .then((res) => setPeople(res.people || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleZipSearch = () => {
    if (zipCode.length < 5) return;
    fetch(`/api/representatives?zip=${zipCode}`)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((data: { representatives?: { person_id?: string }[]; results?: { person_id?: string }[] }) => {
        const reps = data.representatives || data.results || [];
        const ids = reps.map((r) => r.person_id).filter(Boolean) as string[];
        setZipRepIds(ids);
        setStateFilter('all');
        setCurrentPage(1);
      })
      .catch(() => setZipRepIds([]));
  };

  const clearZip = () => {
    setZipCode('');
    setZipRepIds([]);
  };

  useEffect(() => { setCurrentPage(1); }, [search, partyFilter, chamberFilter, stateFilter]);

  const PAGE_SIZE = 20;

  const filtered = useMemo(() => {
    let result = people;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.display_name.toLowerCase().includes(q) || (p.state || '').toLowerCase().includes(q)
      );
    }
    if (partyFilter !== 'all') {
      result = result.filter((p) => (p.party || '').startsWith(partyFilter));
    }
    if (chamberFilter !== 'all') {
      result = result.filter((p) =>
        chamberFilter === 'house'
          ? p.chamber.toLowerCase().includes('house') || p.chamber.toLowerCase() === 'lower'
          : p.chamber.toLowerCase().includes('senate') || p.chamber.toLowerCase() === 'upper'
      );
    }
    if (stateFilter !== 'all') {
      result = result.filter((p) => p.state === stateFilter);
    }
    if (zipRepIds.length > 0) {
      result = result.filter((p) => zipRepIds.includes(p.person_id));
    }
    return result;
  }, [people, search, partyFilter, chamberFilter, stateFilter, zipRepIds]);

  const partyCounts = useMemo(() => {
    const counts = { D: 0, R: 0, I: 0 };
    people.forEach((p) => {
      const key = partyKey(p.party);
      if (key) counts[key]++;
    });
    return counts;
  }, [people]);

  const chamberCounts = useMemo(() => {
    const counts = { house: 0, senate: 0 };
    people.forEach((p) => {
      if (p.chamber?.toLowerCase().includes('senate') || p.chamber?.toLowerCase() === 'upper') {
        counts.senate++;
      } else {
        counts.house++;
      }
    });
    return counts;
  }, [people]);

  const stateList = useMemo(() => {
    const counts: Record<string, number> = {};
    people.forEach((p) => {
      if (p.state) counts[p.state] = (counts[p.state] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([state, count]) => ({ state, count }));
  }, [people]);

  const total = people.length || 1;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const pageNumbers = (() => {
    if (totalPages <= 1) return [] as (number | '...')[];
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  })();

  return (
    <div style={pageShell}>
      <div style={contentWrap}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ marginBottom: '40px' }}
        >
          <span style={eyebrowStyle}>Politics / Representatives</span>
          <h1 style={titleStyle}>
            Members of{' '}
            <span style={{ color: 'var(--color-accent-text)' }}>Congress</span>
          </h1>
          <p style={leadStyle}>
            {people.length.toLocaleString()} current members. Search by name, filter by party, chamber, or state — or enter a ZIP to see your representatives.
          </p>

          {/* Search */}
          <div style={{ position: 'relative', maxWidth: '520px', marginBottom: '24px' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-3)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search by name or state…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '14px 16px 14px 48px',
                background: 'var(--color-surface)',
                border: '1px solid rgba(235,229,213,0.08)',
                borderRadius: '12px',
                color: 'var(--color-text-1)',
                fontFamily: 'var(--font-body)',
                fontSize: '16px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)'; }}
            />
          </div>

          {/* Party distribution bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div
              style={{
                flex: 1,
                minWidth: '260px',
                display: 'flex',
                height: '8px',
                borderRadius: '999px',
                overflow: 'hidden',
                background: 'rgba(235,229,213,0.06)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(partyCounts.D / total) * 100}%`,
                  background: 'var(--color-dem)',
                  transition: 'width 0.7s',
                }}
              />
              <div
                style={{
                  height: '100%',
                  width: `${(partyCounts.I / total) * 100}%`,
                  background: 'var(--color-ind)',
                  transition: 'width 0.7s',
                }}
              />
              <div
                style={{
                  height: '100%',
                  width: `${(partyCounts.R / total) * 100}%`,
                  background: 'var(--color-rep)',
                  transition: 'width 0.7s',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-dem)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-2)' }}>
                  {partyCounts.D} Dem
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-ind)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-2)' }}>
                  {partyCounts.I} Ind
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-rep)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-2)' }}>
                  {partyCounts.R} Rep
                </span>
              </span>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          style={{
            display: 'flex',
            gap: '10px',
            overflowX: 'auto',
            paddingBottom: '8px',
            marginBottom: '24px',
            touchAction: 'pan-x',
          }}
        >
          <FilterPill
            label="All"
            count={people.length}
            active={partyFilter === 'all'}
            color="var(--color-text-1)"
            hex="#EBE5D5"
            onClick={() => setPartyFilter('all')}
          />
          <FilterPill
            label="Democrat"
            count={partyCounts.D}
            active={partyFilter === 'D'}
            color="var(--color-dem)"
            hex={PARTY_HEX.D}
            onClick={() => setPartyFilter(partyFilter === 'D' ? 'all' : 'D')}
          />
          <FilterPill
            label="Republican"
            count={partyCounts.R}
            active={partyFilter === 'R'}
            color="var(--color-rep)"
            hex={PARTY_HEX.R}
            onClick={() => setPartyFilter(partyFilter === 'R' ? 'all' : 'R')}
          />
          <FilterPill
            label="Independent"
            count={partyCounts.I}
            active={partyFilter === 'I'}
            color="var(--color-ind)"
            hex={PARTY_HEX.I}
            onClick={() => setPartyFilter(partyFilter === 'I' ? 'all' : 'I')}
          />

          <div style={{ width: '1px', background: 'rgba(235,229,213,0.1)', margin: '0 4px', flexShrink: 0 }} />

          <FilterPill
            label="House"
            count={chamberCounts.house}
            active={chamberFilter === 'house'}
            color="var(--color-accent-text)"
            hex="#C5A028"
            onClick={() => setChamberFilter(chamberFilter === 'house' ? 'all' : 'house')}
          />
          <FilterPill
            label="Senate"
            count={chamberCounts.senate}
            active={chamberFilter === 'senate'}
            color="var(--color-accent-text)"
            hex="#C5A028"
            onClick={() => setChamberFilter(chamberFilter === 'senate' ? 'all' : 'senate')}
          />

          <div style={{ width: '1px', background: 'rgba(235,229,213,0.1)', margin: '0 4px', flexShrink: 0 }} />

          {/* State dropdown */}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={{
              borderRadius: '999px',
              padding: '8px 32px 8px 16px',
              border: `1px solid ${stateFilter !== 'all' ? 'var(--color-accent)' : 'rgba(235,229,213,0.12)'}`,
              background: stateFilter !== 'all' ? 'var(--color-accent-dim)' : 'transparent',
              color: stateFilter !== 'all' ? 'var(--color-accent-text)' : 'var(--color-text-2)',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              appearance: 'none',
              cursor: 'pointer',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23B8A97A' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              outline: 'none',
            }}
          >
            <option value="all" style={{ background: '#0D1117', color: '#EBE5D5' }}>
              State ({stateList.length})
            </option>
            {stateList.map(({ state, count }) => (
              <option key={state} value={state} style={{ background: '#0D1117', color: '#EBE5D5' }}>
                {state} ({count})
              </option>
            ))}
          </select>

          <div style={{ width: '1px', background: 'rgba(235,229,213,0.1)', margin: '0 4px', flexShrink: 0 }} />

          {/* ZIP filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ position: 'relative' }}>
              <MapPin
                size={14}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: zipRepIds.length > 0 ? 'var(--color-green)' : 'var(--color-text-3)',
                }}
              />
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                onKeyDown={(e) => e.key === 'Enter' && handleZipSearch()}
                placeholder="ZIP"
                style={{
                  width: '96px',
                  borderRadius: '999px',
                  padding: '8px 12px 8px 32px',
                  border: `1px solid ${zipRepIds.length > 0 ? 'var(--color-green)' : 'rgba(235,229,213,0.12)'}`,
                  background: zipRepIds.length > 0 ? 'rgba(61,184,122,0.1)' : 'transparent',
                  color: zipRepIds.length > 0 ? 'var(--color-green)' : 'var(--color-text-2)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  fontWeight: 500,
                  outline: 'none',
                }}
              />
            </div>
            {zipRepIds.length > 0 && (
              <button
                onClick={clearZip}
                style={{
                  borderRadius: '999px',
                  padding: '6px',
                  border: '1px solid rgba(235,229,213,0.12)',
                  background: 'transparent',
                  color: 'var(--color-text-2)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </motion.div>

        {/* Result count + CSV */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-text-2)', letterSpacing: '0.04em' }}>
            {filtered.length} of {people.length} members
            {(partyFilter !== 'all' || chamberFilter !== 'all' || stateFilter !== 'all' || search || zipRepIds.length > 0) && ' (filtered)'}
          </span>
          <CSVExport
            data={filtered}
            filename="politicians"
            columns={[
              { key: 'display_name', label: 'Name' },
              { key: 'party', label: 'Party' },
              { key: 'chamber', label: 'Chamber' },
              { key: 'state', label: 'State' },
              { key: 'person_id', label: 'ID' },
            ]}
          />
        </div>

        {/* Cards grid */}
        <div>
          {loading ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '20px',
              }}
            >
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: '224px',
                    borderRadius: '16px',
                    background: 'var(--color-surface)',
                    border: '1px solid rgba(235,229,213,0.06)',
                    opacity: 0.5,
                  }}
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '80px 24px',
                background: 'var(--color-surface)',
                border: '1px solid rgba(235,229,213,0.08)',
                borderRadius: '16px',
                gap: '16px',
              }}
            >
              <Users size={48} style={{ color: 'var(--color-text-3)' }} />
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '18px', color: 'var(--color-text-2)', margin: 0 }}>
                No members match your search
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '20px',
                  paddingBottom: '16px',
                }}
              >
                {filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((person, idx) => (
                  <PersonCard key={person.person_id} person={person} index={idx} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    paddingTop: '24px',
                    paddingBottom: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <PageButton
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    ←
                  </PageButton>
                  {pageNumbers.map((page, i) =>
                    page === '...' ? (
                      <span
                        key={`dots-${i}`}
                        style={{
                          padding: '0 4px',
                          color: 'var(--color-text-3)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '13px',
                        }}
                      >
                        …
                      </span>
                    ) : (
                      <PageButton
                        key={page}
                        active={page === currentPage}
                        onClick={() => setCurrentPage(page as number)}
                      >
                        {page}
                      </PageButton>
                    )
                  )}
                  <PageButton
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    →
                  </PageButton>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
