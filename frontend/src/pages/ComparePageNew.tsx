import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, ArrowLeft, X, Loader2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '../api/client';
import type { Person, CompareResponse, ComparePersonData } from '../api/types';
import { PoliticsSectorHeader } from '../components/SectorHeader';

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

const MAX_SELECTED = 4;

// Parallel token / hex maps: hex is used for ${hex}18 / ${hex}30 opacity combos
// (CSS custom properties cannot accept alpha suffixes inline).
const PARTY_HEX: Record<string, string> = {
  D: '#4A7FDE',
  R: '#E05555',
  I: '#B06FD8',
};
const PARTY_TOKEN: Record<string, string> = {
  D: 'var(--color-dem)',
  R: 'var(--color-rep)',
  I: 'var(--color-ind)',
};

const TIER_KEYS = ['strong', 'moderate', 'weak', 'none'] as const;
const TIER_HEX: Record<string, string> = {
  strong: '#3DB87A',
  moderate: '#4A7FDE',
  weak: '#C5A028',
  none: '#E05555',
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function partyHex(party: string | null): string {
  return PARTY_HEX[party?.charAt(0) || ''] || '#6E7A85';
}

function partyToken(party: string | null): string {
  return PARTY_TOKEN[party?.charAt(0) || ''] || 'var(--color-text-3)';
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Indices of the highest value in an array (ties all returned). */
function maxIndices(values: number[]): Set<number> {
  const max = Math.max(...values);
  if (max <= 0) return new Set();
  const indices = new Set<number>();
  values.forEach((v, i) => {
    if (v === max) indices.add(i);
  });
  return indices;
}

function partyLabel(party: string | null): string {
  if (party === 'D') return 'Democrat';
  if (party === 'R') return 'Republican';
  if (party === 'I') return 'Independent';
  return 'Unknown';
}

// ─────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────

function PhotoAvatar({
  person,
  size,
  borderWidth = 0,
}: {
  person: Person;
  size: number;
  borderWidth?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const hex = partyHex(person.party);

  if (person.photo_url && !imgError) {
    return (
      <img
        src={person.photo_url}
        alt={person.display_name}
        onError={() => setImgError(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          border: borderWidth > 0 ? `${borderWidth}px solid ${hex}` : 'none',
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: `${hex}1F`,
        color: hex,
        fontFamily: "'Inter', sans-serif",
        fontWeight: 700,
        fontSize: Math.round(size * 0.36),
        border: borderWidth > 0 ? `${borderWidth}px solid ${hex}` : 'none',
      }}
    >
      {initials(person.display_name)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stacked bar (activity tier breakdown)
// ─────────────────────────────────────────────────────────────────────

function StackedBar({
  data,
  keys,
  colorMap,
}: {
  data: Record<string, number>;
  keys: readonly string[];
  colorMap: Record<string, string>;
}) {
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: 'var(--color-surface-2)',
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {keys.map((key) => {
          const pct = data[key] ?? 0;
          if (pct <= 0) return null;
          return (
            <div
              key={key}
              style={{
                height: '100%',
                width: `${pct}%`,
                background: colorMap[key],
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 10,
        }}
      >
        {keys.map((key) => {
          const pct = data[key] ?? 0;
          return (
            <span
              key={key}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: colorMap[key],
              }}
            >
              {formatLabel(key)} {Math.round(pct)}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────

export default function ComparePageNew() {
  // Data
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(true);

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // Comparison
  const [compareData, setCompareData] = useState<CompareResponse | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch members on mount ──
  useEffect(() => {
    let cancelled = false;
    apiClient
      .getPeople({ limit: 500, active_only: true })
      .then((res) => { if (!cancelled) setAllPeople(res.people || []); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoadingPeople(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Derived: person lookup map ──
  const personMap = useMemo(() => {
    const map = new Map<string, Person>();
    allPeople.forEach((p) => map.set(p.person_id, p));
    return map;
  }, [allPeople]);

  // ── Filtered people for grid ──
  const filtered = useMemo(() => {
    if (!search) return allPeople;
    const q = search.toLowerCase();
    return allPeople.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        (p.state || '').toLowerCase().includes(q),
    );
  }, [allPeople, search]);

  // ── Selection handlers ──
  const togglePerson = useCallback(
    (id: string) => {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    },
    [],
  );

  const removePerson = useCallback((id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  // ── Compare ──
  const runCompare = useCallback(async () => {
    if (selectedIds.length < 2) return;
    setLoadingCompare(true);
    setError(null);
    try {
      const data = await apiClient.comparePeople(selectedIds);
      setCompareData(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load comparison');
    } finally {
      setLoadingCompare(false);
    }
  }, [selectedIds]);

  const resetCompare = useCallback(() => {
    setCompareData(null);
    setError(null);
  }, []);

  // ── Ordered person + data pairs ──
  const comparisonPairs = useMemo(() => {
    if (!compareData) return [];
    return selectedIds
      .map((id) => {
        const person = personMap.get(id);
        const data = compareData.people.find((p) => p.person_id === id);
        return person && data ? { person, data } : null;
      })
      .filter(Boolean) as { person: Person; data: ComparePersonData }[];
  }, [compareData, selectedIds, personMap]);

  // ── Policy areas: union sorted by total desc ──
  const policyRows = useMemo(() => {
    if (!comparisonPairs.length) return [];
    const areaSet = new Set<string>();
    comparisonPairs.forEach(({ data }) => {
      Object.keys(data.by_category || {}).forEach((k) => areaSet.add(k));
    });
    return Array.from(areaSet)
      .map((area) => ({
        area,
        total: comparisonPairs.reduce((sum, { data }) => sum + ((data.by_category || {})[area] || 0), 0),
        values: comparisonPairs.map(({ data }) => (data.by_category || {})[area] || 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [comparisonPairs]);

  const showResults = compareData && !loadingCompare && comparisonPairs.length > 0;

  // ─────────────────────────────────────────────────────────────────
  // RENDER: COMPARISON RESULTS
  // ─────────────────────────────────────────────────────────────────

  if (showResults) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-bg)',
          color: 'var(--color-text-1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <PoliticsSectorHeader />

        <div
          style={{
            maxWidth: 1200,
            width: '100%',
            margin: '0 auto',
            padding: '32px 40px 80px',
          }}
        >
          {/* Back bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <button
              onClick={resetCompare}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--color-text-2)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
            >
              <ArrowLeft size={14} />
              New comparison
            </button>
          </div>

          {/* Title */}
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(28px, 4vw, 36px)',
              lineHeight: 1.05,
              color: 'var(--color-text-1)',
              marginBottom: 8,
            }}
          >
            Compare
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: 'var(--color-text-2)',
              marginBottom: 32,
            }}
          >
            Side-by-side legislative analysis of {comparisonPairs.length} member{comparisonPairs.length === 1 ? '' : 's'}.
          </p>

          {/* Entity cards (2-4 across) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                comparisonPairs.length === 2
                  ? '1fr 40px 1fr'
                  : `repeat(${comparisonPairs.length}, 1fr)`,
              gap: comparisonPairs.length === 2 ? 0 : 12,
              alignItems: 'center',
              marginBottom: 32,
            }}
          >
            {comparisonPairs.map(({ person }, idx) => (
              <React.Fragment key={person.person_id}>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: '1px solid var(--color-border-hover)',
                    background: 'var(--color-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <PhotoAvatar person={person} size={36} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--color-text-1)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {person.display_name}
                    </div>
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 11,
                        color: 'var(--color-text-3)',
                        marginTop: 2,
                      }}
                    >
                      {partyLabel(person.party)} · {person.state} ·{' '}
                      {person.chamber?.toLowerCase() === 'senate' ? 'Senate' : 'House'}
                    </div>
                  </div>
                </motion.div>
                {comparisonPairs.length === 2 && idx === 0 && (
                  <div
                    style={{
                      textAlign: 'center',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--color-text-3)',
                    }}
                  >
                    vs
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* OVERVIEW METRICS */}
          <SectionEyebrow>Overview metrics</SectionEyebrow>
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 24,
            }}
          >
            {[
              { label: 'Claims tracked', values: comparisonPairs.map(({ data }) => data.total_claims ?? 0) },
              { label: 'Claims evaluated', values: comparisonPairs.map(({ data }) => data.total_scored ?? 0) },
              { label: 'Legislative actions', values: comparisonPairs.map(({ data }) => data.total_actions ?? 0) },
            ].map((m, mi, arr) => {
              const best = maxIndices(m.values);
              const isTwo = comparisonPairs.length === 2;
              return (
                <MatrixRow
                  key={m.label}
                  isLast={mi === arr.length - 1}
                  label={m.label}
                  cells={m.values.map((v, i) => ({
                    value: v.toLocaleString(),
                    isBest: best.has(i),
                    hex: partyHex(comparisonPairs[i].person.party),
                  }))}
                  twoColumn={isTwo}
                />
              );
            })}
          </div>

          {/* ACTIVITY BREAKDOWN */}
          {comparisonPairs.some(({ data }) => data.by_tier && Object.keys(data.by_tier || {}).length > 0) && (
            <>
              <SectionEyebrow>Activity breakdown</SectionEyebrow>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${comparisonPairs.length}, 1fr)`,
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                {comparisonPairs.map(({ person, data }) => {
                  const tier = data.by_tier || {};
                  const total = Object.values(tier).reduce((a: number, b: number) => a + b, 0) || 1;
                  const pctData: Record<string, number> = {};
                  TIER_KEYS.forEach((k) => { pctData[k] = ((tier[k] || 0) / total) * 100; });
                  return (
                    <div
                      key={person.person_id}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--color-text-2)',
                          marginBottom: 12,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {person.display_name}
                      </div>
                      <StackedBar data={pctData} keys={TIER_KEYS} colorMap={TIER_HEX} />
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* POLICY AREAS */}
          {policyRows.length > 0 && (
            <>
              <SectionEyebrow>Policy areas</SectionEyebrow>
              <div
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {policyRows.map((row, rowIdx) => {
                  const best = maxIndices(row.values);
                  const isTwo = comparisonPairs.length === 2;
                  return (
                    <MatrixRow
                      key={row.area}
                      isLast={rowIdx === policyRows.length - 1}
                      label={row.area}
                      cells={row.values.map((v, i) => ({
                        value: String(v),
                        isBest: best.has(i),
                        hex: partyHex(comparisonPairs[i].person.party),
                      }))}
                      twoColumn={isTwo}
                    />
                  );
                })}
              </div>
            </>
          )}

          {policyRows.length === 0 && (
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: 'var(--color-text-3)',
                padding: '16px 0',
              }}
            >
              No policy area data available.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // RENDER: SELECTION MODE
  // ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <PoliticsSectorHeader />

      <div
        style={{
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          padding: '32px 40px 80px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Title */}
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(32px, 5vw, 48px)',
            lineHeight: 1.05,
            color: 'var(--color-text-1)',
            marginBottom: 8,
          }}
        >
          Compare members
        </h1>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            color: 'var(--color-text-2)',
            marginBottom: 24,
          }}
        >
          Side-by-side legislative analysis — select 2 to {MAX_SELECTED} members to compare.
        </p>

        {/* Selected chips */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 16,
              }}
            >
              {selectedIds.map((id) => {
                const person = personMap.get(id);
                if (!person) return null;
                const hex = partyHex(person.party);
                return (
                  <motion.div
                    key={id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border-hover)',
                      borderRadius: 999,
                      padding: '6px 10px 6px 6px',
                    }}
                  >
                    <PhotoAvatar person={person} size={22} />
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        color: 'var(--color-text-1)',
                      }}
                    >
                      {person.display_name}
                    </span>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: hex,
                        flexShrink: 0,
                      }}
                      aria-label={partyLabel(person.party)}
                      role="img"
                    />
                    <button
                      onClick={() => removePerson(id)}
                      style={{
                        color: 'var(--color-text-3)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-3)'; }}
                      aria-label={`Remove ${person.display_name}`}
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search + Compare row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, position: 'relative' }}>
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
              placeholder="Search by name or state..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: '12px 14px 12px 40px',
                color: 'var(--color-text-1)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 150ms',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
            />
          </div>
          <button
            onClick={runCompare}
            disabled={selectedIds.length < 2 || loadingCompare}
            style={{
              borderRadius: 10,
              padding: '12px 24px',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              border: 'none',
              cursor: selectedIds.length >= 2 && !loadingCompare ? 'pointer' : 'not-allowed',
              background: selectedIds.length >= 2
                ? 'var(--color-accent)'
                : 'var(--color-surface-2)',
              color: selectedIds.length >= 2 ? '#07090C' : 'var(--color-text-3)',
              minWidth: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'background-color 150ms',
            }}
          >
            {loadingCompare ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              `Compare (${selectedIds.length})`
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: 'rgba(230,57,70,0.08)',
              border: '1px solid rgba(230,57,70,0.25)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
            }}
          >
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: 'var(--color-red)',
              }}
            >
              {error}
            </p>
          </div>
        )}

        {/* Counter */}
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-3)',
            marginBottom: 12,
          }}
        >
          {selectedIds.length === 0
            ? `Select members to compare`
            : `${selectedIds.length} of ${MAX_SELECTED} selected`}
        </div>

        {/* Member grid */}
        {loadingPeople ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 48,
            }}
          >
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 10,
            }}
          >
            {filtered.map((person) => {
              const isSelected = selectedIds.includes(person.person_id);
              const isDisabled = !isSelected && selectedIds.length >= MAX_SELECTED;
              const hex = partyHex(person.party);
              return (
                <button
                  key={person.person_id}
                  onClick={() => !isDisabled && togglePerson(person.person_id)}
                  disabled={isDisabled}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    textAlign: 'left',
                    padding: 14,
                    borderRadius: 10,
                    background: isSelected
                      ? `${hex}14`
                      : 'var(--color-surface)',
                    border: isSelected
                      ? `1px solid ${hex}`
                      : '1px solid var(--color-border)',
                    opacity: isDisabled ? 0.4 : 1,
                    filter: isDisabled ? 'grayscale(1)' : 'none',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    transition: 'all 150ms',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected && !isDisabled) {
                      e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected && !isDisabled) {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                    }
                  }}
                >
                  <PhotoAvatar person={person} size={40} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--color-text-1)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {person.display_name}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 2,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 11,
                          color: 'var(--color-text-3)',
                        }}
                      >
                        {person.state}
                      </span>
                      <span
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: hex,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 11,
                          color: 'var(--color-text-3)',
                        }}
                      >
                        {person.party}
                      </span>
                    </div>
                  </div>
                  {!isSelected && !isDisabled && (
                    <Plus size={16} style={{ color: 'var(--color-text-3)', flexShrink: 0 }} />
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && !loadingPeople && (
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  color: 'var(--color-text-3)',
                  gridColumn: '1 / -1',
                  padding: '24px 0',
                  textAlign: 'center',
                }}
              >
                No members match your search.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section eyebrow (uppercase label above each matrix/chart block)
// ─────────────────────────────────────────────────────────────────────

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-text-3)',
        marginTop: 28,
        marginBottom: 12,
      }}
    >
      {children}
    </h2>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Matrix row (2-col = prototype "1fr 120px 1fr", 3-4 col = flat grid)
// ─────────────────────────────────────────────────────────────────────

interface MatrixCell {
  value: string;
  isBest: boolean;
  hex: string;
}

function MatrixRow({
  label,
  cells,
  twoColumn,
  isLast,
}: {
  label: string;
  cells: MatrixCell[];
  twoColumn: boolean;
  isLast: boolean;
}) {
  if (twoColumn && cells.length === 2) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 1fr',
          borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
        }}
      >
        {/* Left cell */}
        <div style={{ padding: '16px 20px', textAlign: 'left' }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1,
              color: cells[0].isBest ? cells[0].hex : 'var(--color-text-1)',
              marginBottom: 2,
            }}
          >
            {cells[0].value}
          </div>
          {cells[0].isBest && (
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                fontWeight: 600,
                color: cells[0].hex,
              }}
            >
              ↑ Higher
            </div>
          )}
        </div>

        {/* Center metric label */}
        <div
          style={{
            padding: '16px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderLeft: '1px solid var(--color-border)',
            borderRight: '1px solid var(--color-border)',
          }}
        >
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              textAlign: 'center',
              padding: '0 8px',
            }}
          >
            {label}
          </span>
        </div>

        {/* Right cell */}
        <div style={{ padding: '16px 20px', textAlign: 'right' }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1,
              color: cells[1].isBest ? cells[1].hex : 'var(--color-text-1)',
              marginBottom: 2,
            }}
          >
            {cells[1].value}
          </div>
          {cells[1].isBest && (
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                fontWeight: 600,
                color: cells[1].hex,
              }}
            >
              ↑ Higher
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3-4 column layout: label row above, then values row (stacked for clarity)
  return (
    <div
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
        padding: '14px 20px',
      }}
    >
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-text-3)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
          gap: 12,
        }}
      >
        {cells.map((cell, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 20,
                fontWeight: 700,
                lineHeight: 1,
                color: cell.isBest ? cell.hex : 'var(--color-text-1)',
              }}
            >
              {cell.value}
            </div>
            {cell.isBest && (
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 10,
                  fontWeight: 600,
                  color: cell.hex,
                  marginTop: 2,
                }}
              >
                ↑ Leader
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
