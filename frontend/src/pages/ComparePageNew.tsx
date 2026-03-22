import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, ArrowLeft, X, Loader2 } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Person, CompareResponse, ComparePersonData } from '../api/types';
import BackButton from '../components/BackButton';
import { PoliticsSectorHeader } from '../components/SectorHeader';

// ── Constants ──

const MAX_SELECTED = 4;

const PARTY_COLOR: Record<string, string> = {
  D: '#3B82F6',
  R: '#EF4444',
  I: '#A855F7',
};

const TIER_KEYS = ['strong', 'moderate', 'weak', 'none'] as const;
const TIER_COLOR: Record<string, string> = {
  strong: '#10B981',
  moderate: '#3B82F6',
  weak: '#F59E0B',
  none: '#EF4444',
};

const TIMING_KEYS = ['before', 'during', 'after'] as const;
const TIMING_COLOR: Record<string, string> = {
  before: '#10B981',
  during: '#3B82F6',
  after: '#F59E0B',
};

const PROGRESS_KEYS = ['completed', 'in_progress', 'stalled', 'not_started'] as const;
const PROGRESS_COLOR: Record<string, string> = {
  completed: '#10B981',
  in_progress: '#3B82F6',
  stalled: '#F59E0B',
  not_started: '#6B7280',
};

// ── Helpers ──

function partyColor(party: string): string {
  return PARTY_COLOR[party?.charAt(0)] || '#6B7280';
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

/** Given an array of numbers, returns the indices that hold the maximum value */
function maxIndices(values: number[]): Set<number> {
  const max = Math.max(...values);
  if (max <= 0) return new Set();
  const indices = new Set<number>();
  values.forEach((v, i) => {
    if (v === max) indices.add(i);
  });
  return indices;
}

// ── Sub-components ──

function PhotoAvatar({
  person,
  size,
  borderWidth = 2,
  borderColor,
}: {
  person: Person;
  size: number;
  borderWidth?: number;
  borderColor?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const color = borderColor || partyColor(person.party);
  const sizeClass = `${size}px`;

  if (person.photo_url && !imgError) {
    return (
      <img
        src={person.photo_url}
        alt={person.display_name}
        onError={() => setImgError(true)}
        className="rounded-full object-cover shrink-0"
        style={{
          width: sizeClass,
          height: sizeClass,
          border: `${borderWidth}px solid ${color}`,
        }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-oswald font-bold text-white"
      style={{
        width: sizeClass,
        height: sizeClass,
        backgroundColor: partyColor(person.party),
        fontSize: size * 0.38,
        border: `${borderWidth}px solid ${color}`,
      }}
    >
      {initials(person.display_name)}
    </div>
  );
}

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
    <div className="w-full">
      <div className="h-8 rounded-full border border-[#1E293B] overflow-hidden flex">
        {keys.map((key) => {
          const pct = data[key] ?? 0;
          if (pct <= 0) return null;
          return (
            <div
              key={key}
              className="h-full flex items-center justify-center overflow-hidden"
              style={{ width: `${pct}%`, backgroundColor: colorMap[key] }}
            >
              {pct > 10 && (
                <span className="text-xs font-bold text-[#0F172A] px-1 truncate">
                  {Math.round(pct)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2">
        {keys.map((key) => {
          const pct = data[key] ?? 0;
          return (
            <span
              key={key}
              className="text-[10px] uppercase font-bold"
              style={{ color: colorMap[key] }}
            >
              {formatLabel(key)} {Math.round(pct)}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ──

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
    apiClient
      .getPeople({ limit: 500, active_only: true })
      .then((res) => setAllPeople(res.people || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingPeople(false));
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
        p.state.toLowerCase().includes(q),
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
    } catch (err: any) {
      setError(err.message || 'Failed to load comparison');
    } finally {
      setLoadingCompare(false);
    }
  }, [selectedIds]);

  const resetCompare = useCallback(() => {
    setCompareData(null);
    setError(null);
  }, []);

  // ── If in comparison mode, build ordered person+data pairs ──
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

  // ── Policy areas: union of all, sorted by total desc ──
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

  // ────────────────────────────────────────
  //  RENDER
  // ────────────────────────────────────────

  const showResults = compareData && !loadingCompare && comparisonPairs.length > 0;

  return (
    <div className="min-h-screen text-white flex flex-col overflow-hidden">
      {/* ── STATE 2: COMPARISON RESULTS ── */}
      {showResults ? (
        <>
          {/* Nav + Back */}
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <button
              onClick={resetCompare}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span className="font-dm-sans text-sm">New Comparison</span>
            </button>
            <PoliticsSectorHeader />
          </div>

          {/* Sticky column headers */}
          <div className="sticky top-0 z-20 bg-[rgba(2,6,23,0.95)] backdrop-blur border-b border-[#1E293B] px-4 sm:px-6 py-6 overflow-x-auto">
            <div className="flex">
              <div className="w-48 shrink-0" />
              {comparisonPairs.map(({ person }) => (
                <div key={person.person_id} className="flex-1 min-w-[240px] flex flex-col items-center gap-2">
                  <PhotoAvatar person={person} size={64} borderWidth={4} borderColor={partyColor(person.party)} />
                  <span className="font-oswald text-2xl font-bold uppercase text-center leading-tight">
                    {person.display_name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: `${partyColor(person.party)}20`,
                        color: partyColor(person.party),
                      }}
                    >
                      {person.party}
                    </span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded"
                      style={{ backgroundColor: 'rgba(100,116,139,0.2)', color: '#94A3B8' }}
                    >
                      {person.chamber?.toLowerCase() === 'senate' ? 'Senate' : 'House'}
                    </span>
                  </div>
                  <span className="font-fira-code text-xs text-slate-400">{person.state}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto overflow-x-auto px-4 sm:px-6 pb-12">
            {/* OVERVIEW METRICS */}
            <SectionTitle>Overview Metrics</SectionTitle>
            {(() => {
              const metrics = [
                { label: 'Claims Tracked', values: comparisonPairs.map(({ data }) => data.total_claims ?? 0) },
                { label: 'Claims Evaluated', values: comparisonPairs.map(({ data }) => data.total_scored ?? 0) },
                { label: 'Legislative Actions', values: comparisonPairs.map(({ data }) => data.total_actions ?? 0) },
              ];
              return metrics.map((m) => {
                const best = maxIndices(m.values);
                return (
                  <div key={m.label} className="flex border-b border-[#1E293B]">
                    <div className="w-48 shrink-0 flex items-center bg-[rgba(15,23,42,0.3)] px-4 py-4">
                      <span className="text-sm uppercase tracking-wider text-slate-400 font-dm-sans">
                        {m.label}
                      </span>
                    </div>
                    {m.values.map((v, i) => (
                      <div
                        key={i}
                        className={`flex-1 min-w-[240px] flex items-center justify-center px-4 py-4 ${
                          best.has(i) ? 'bg-[rgba(6,78,59,0.1)]' : ''
                        }`}
                      >
                        <span
                          className={`font-fira-code text-3xl font-bold ${
                            best.has(i) ? 'text-emerald-400' : 'text-white'
                          }`}
                        >
                          {v.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              });
            })()}

            {/* ACTIVITY BREAKDOWN */}
            {comparisonPairs.some(({ data }) => data.by_tier && Object.keys(data.by_tier || {}).length > 0) && (
              <>
                <SectionTitle>Activity Breakdown</SectionTitle>
                <div className="flex">
                  <div className="w-48 shrink-0" />
                  {comparisonPairs.map(({ person, data }) => {
                    const tier = data.by_tier || {};
                    const total = Object.values(tier).reduce((a: number, b: number) => a + b, 0) || 1;
                    const pctData: Record<string, number> = {};
                    TIER_KEYS.forEach((k) => { pctData[k] = ((tier[k] || 0) / total) * 100; });
                    return (
                      <div key={person.person_id} className="flex-1 min-w-[240px] px-4 py-4">
                        <StackedBar data={pctData} keys={TIER_KEYS} colorMap={TIER_COLOR} />
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* POLICY AREAS */}
            {policyRows.length > 0 && <SectionTitle>Policy Areas</SectionTitle>}
            {policyRows.map((row, rowIdx) => {
              const best = maxIndices(row.values);
              return (
                <div
                  key={row.area}
                  className="flex border-b border-[#1E293B]"
                  style={{
                    backgroundColor: rowIdx % 2 === 1 ? 'rgba(30,41,59,0.15)' : 'transparent',
                  }}
                >
                  <div className="w-48 shrink-0 flex items-center px-4 py-3">
                    <span className="text-sm text-slate-300 font-dm-sans">{row.area}</span>
                  </div>
                  {row.values.map((v, i) => (
                    <div
                      key={i}
                      className={`flex-1 min-w-[240px] flex items-center justify-center px-4 py-3 ${
                        best.has(i) ? 'bg-[rgba(6,78,59,0.1)]' : ''
                      }`}
                    >
                      <span
                        className={`font-fira-code font-bold ${
                          best.has(i) ? 'text-emerald-400' : 'text-white'
                        }`}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
            {policyRows.length === 0 && (
              <p className="text-slate-500 text-sm font-dm-sans py-4 px-4">No policy area data available.</p>
            )}
          </div>
        </>
      ) : (
        /* ── STATE 1: SELECTION MODE ── */
        <div className="flex-1 flex flex-col overflow-hidden px-6 py-6">
          {/* Header */}
          <div className="mb-6">
            <PoliticsSectorHeader />
            <h1 className="font-oswald text-3xl sm:text-5xl md:text-6xl font-bold uppercase text-white leading-none mb-4">
              Compare Members
            </h1>
            <p className="font-dm-sans text-lg text-slate-400">
              Side-by-side legislative analysis
            </p>
            {selectedIds.length < MAX_SELECTED && (
              <p className="font-dm-sans text-sm text-slate-500 mt-1">
                Select up to {MAX_SELECTED} members to compare
              </p>
            )}
          </div>

          {/* Selected chips */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-4">
              {selectedIds.map((id) => {
                const person = personMap.get(id);
                if (!person) return null;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 bg-[#0F172A] border border-[#1E293B] rounded-full px-3 py-1.5"
                  >
                    <PhotoAvatar person={person} size={24} borderWidth={0} />
                    <span className="text-sm text-white font-dm-sans">{person.display_name}</span>
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: partyColor(person.party) }}
                    />
                    <button
                      onClick={() => removePerson(id)}
                      className="text-slate-400 hover:text-white transition-colors cursor-pointer ml-1"
                      aria-label={`Remove ${person.display_name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Search + Compare row */}
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search by name or state..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#0F172A] border border-[#334155] rounded-lg py-4 pl-12 pr-4 text-white font-dm-sans placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button
              onClick={runCompare}
              disabled={selectedIds.length < 2 || loadingCompare}
              className={`rounded-lg px-8 py-4 uppercase font-bold tracking-wide font-oswald transition-colors cursor-pointer ${
                selectedIds.length >= 2
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-[#1E293B] text-slate-500 cursor-not-allowed'
              }`}
            >
              {loadingCompare ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                'Compare'
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
              <p className="text-red-400 text-sm font-dm-sans">{error}</p>
            </div>
          )}

          {/* Loading people */}
          {loadingPeople ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={32} className="animate-spin text-blue-500" />
            </div>
          ) : (
            /* Member grid */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
              {filtered.map((person) => {
                const isSelected = selectedIds.includes(person.person_id);
                const isDisabled = !isSelected && selectedIds.length >= MAX_SELECTED;
                return (
                  <button
                    key={person.person_id}
                    onClick={() => !isDisabled && togglePerson(person.person_id)}
                    disabled={isDisabled}
                    className={`bg-[#0F172A] border rounded-xl p-4 flex gap-4 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[rgba(30,58,138,0.2)] border-blue-500'
                        : isDisabled
                          ? 'border-[#1E293B] opacity-50 grayscale pointer-events-none'
                          : 'border-[#1E293B] hover:bg-[rgba(30,41,59,0.5)] hover:border-[#475569]'
                    }`}
                  >
                    <PhotoAvatar person={person} size={48} />
                    <div className="flex flex-col justify-center min-w-0">
                      <span className="font-dm-sans font-bold text-white truncate">
                        {person.display_name}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-fira-code text-sm text-slate-400">{person.state}</span>
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: partyColor(person.party) }}
                        />
                        <span className="text-xs text-slate-400 font-dm-sans">{person.party}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && !loadingPeople && (
                <p className="text-slate-500 text-sm font-dm-sans col-span-full py-8 text-center">
                  No members match your search.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section title helper ──

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-oswald text-xl font-bold uppercase text-white mt-8 mb-4 px-4">
      {children}
    </h2>
  );
}
