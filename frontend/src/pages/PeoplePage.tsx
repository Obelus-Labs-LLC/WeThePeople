import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, SearchX, MapPin } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { apiClient } from '../api/client';
import type { Person } from '../api/types';
import SpotlightCard from '../components/SpotlightCard';
import { PoliticsSectorHeader } from '../components/SectorHeader';

// ── Party config ──

type PartyFilter = 'all' | 'D' | 'R' | 'I';
type ChamberFilter = 'all' | 'house' | 'senate';
type StateFilter = 'all' | string;

const PARTY_COLORS: Record<string, { solid: string; label: string }> = {
  D: { solid: '#3B82F6', label: 'Democrat' },
  R: { solid: '#EF4444', label: 'Republican' },
  I: { solid: '#A855F7', label: 'Independent' },
};

function partyInfo(party: string) {
  return PARTY_COLORS[party?.charAt(0)] || { solid: '#6B7280', label: party };
}

// ── Filter Pill (matching finance style) ──

function FilterPill({
  label,
  count,
  active,
  color,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 font-body text-sm font-medium transition-all duration-200"
      style={{
        borderColor: active ? color : 'rgba(255,255,255,0.1)',
        backgroundColor: active ? `${color}15` : 'transparent',
        color: active ? color : 'rgba(255,255,255,0.5)',
      }}
    >
      {label}
      <span
        className="rounded-full px-1.5 py-0.5 font-mono text-[10px]"
        style={{
          backgroundColor: active ? `${color}33` : 'rgba(255,255,255,0.1)',
          color: active ? color : 'rgba(255,255,255,0.4)',
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ── Person Card (finance-style with SpotlightCard) ──

function PersonCard({ person, index }: { person: Person; index: number }) {
  const pi = partyInfo(person.party);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.03 }}
    >
      <Link
        to={`/politics/people/${person.person_id}`}
        className="block no-underline h-full"
      >
        <SpotlightCard
          className="rounded-xl border border-white/10 bg-white/[0.03] h-full"
          spotlightColor="rgba(255, 255, 255, 0.10)"
        >
          <div className="relative flex h-full flex-col p-6 overflow-hidden">
            {/* Top row: photo + party tag */}
            <div className="flex items-start justify-between mb-4">
              {person.photo_url ? (
                <img
                  src={person.photo_url}
                  alt={person.display_name}
                  className="h-14 w-14 rounded-full object-cover ring-2 ring-white/10"
                />
              ) : (
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full font-heading text-lg font-bold text-white ring-2 ring-white/10"
                  style={{ backgroundColor: `${pi.solid}30` }}
                >
                  {person.display_name.charAt(0)}
                </div>
              )}
              <span
                className="rounded border px-2 py-1 font-mono text-xs"
                style={{
                  borderColor: `${pi.solid}50`,
                  color: pi.solid,
                  backgroundColor: `${pi.solid}15`,
                }}
              >
                {pi.label.toUpperCase()}
              </span>
            </div>

            {/* Name */}
            <h3 className="font-body text-xl font-bold text-white line-clamp-1 mb-1">
              {person.display_name}
            </h3>

            {/* State */}
            <div className="flex items-center gap-1.5 mb-2">
              <MapPin size={14} className="text-white/30 flex-shrink-0" />
              <span className="font-body text-sm text-white/50 truncate">
                {person.state}
              </span>
            </div>

            {/* Spacer pushes footer to bottom */}
            <div className="mt-auto" />

            {/* Stats footer */}
            <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
              <div>
                <p className="font-mono text-xs text-white/40 mb-1">CHAMBER</p>
                <p className="font-mono text-sm text-white font-medium">
                  {person.chamber?.toLowerCase().includes('senate') ? 'Senate' : 'House'}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs text-white/40 mb-1">STATUS</p>
                <p className={`font-mono text-sm font-medium ${person.is_active ? 'text-emerald-400' : 'text-white/30'}`}>
                  {person.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs text-white/40 mb-1">PARTY</p>
                <p className="font-mono text-sm font-medium" style={{ color: pi.solid }}>
                  {pi.label}
                </p>
              </div>
            </div>
          </div>
        </SpotlightCard>
      </Link>
    </motion.div>
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

  const headerRef = React.useRef<HTMLDivElement>(null);
  useInView(headerRef, { once: true, amount: 0.1 });

  useEffect(() => {
    apiClient
      .getPeople({ limit: 600 })
      .then((res) => setPeople(res.people || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [search, partyFilter, chamberFilter, stateFilter]);

  const PAGE_SIZE = 20;

  const filtered = useMemo(() => {
    let result = people;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.display_name.toLowerCase().includes(q) || p.state.toLowerCase().includes(q)
      );
    }
    if (partyFilter !== 'all') {
      result = result.filter((p) => p.party.startsWith(partyFilter));
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
    return result;
  }, [people, search, partyFilter, chamberFilter, stateFilter]);

  const partyCounts = useMemo(() => {
    const counts = { D: 0, R: 0, I: 0 };
    people.forEach((p) => {
      const key = p.party?.charAt(0) as 'D' | 'R' | 'I';
      if (counts[key] !== undefined) counts[key]++;
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

  return (
    <div className="min-h-screen">
      <div className="px-8 py-8 xl:px-16">
        {/* Header */}
        <motion.div
          ref={headerRef}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="shrink-0 mb-6"
        >
          <PoliticsSectorHeader />
          <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
            Representatives
          </h1>
          <p className="font-body text-lg text-white/50 mb-4">
            {people.length} members of Congress tracked
          </p>

          {/* Search */}
          <div className="relative w-full max-w-[480px]">
            <Search
              size={20}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              type="text"
              placeholder="Search by name or state…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[#0A0A0A] bg-[#111111] py-3 pl-12 pr-4 font-body text-lg text-white placeholder:text-white/30 outline-none transition-colors focus:border-blue-500/50"
            />
          </div>

          {/* Party distribution bar */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 flex h-2 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-700"
                style={{ width: `${(partyCounts.D / people.length) * 100}%`, backgroundColor: '#3B82F6' }}
              />
              <div
                className="h-full transition-all duration-700"
                style={{ width: `${(partyCounts.I / people.length) * 100}%`, backgroundColor: '#A855F7' }}
              />
              <div
                className="h-full transition-all duration-700"
                style={{ width: `${(partyCounts.R / people.length) * 100}%`, backgroundColor: '#EF4444' }}
              />
            </div>
            <div className="hidden md:flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#3B82F6' }} />
                <span className="font-mono text-[11px] text-white/40">{partyCounts.D} Dem</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#A855F7' }} />
                <span className="font-mono text-[11px] text-white/40">{partyCounts.I} Ind</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#EF4444' }} />
                <span className="font-mono text-[11px] text-white/40">{partyCounts.R} Rep</span>
              </span>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex gap-3 overflow-x-auto pb-4 mb-6 shrink-0"
          style={{ touchAction: 'pan-x' }}
        >
          <FilterPill
            label="ALL"
            count={people.length}
            active={partyFilter === 'all'}
            color="#FFFFFF"
            onClick={() => setPartyFilter('all')}
          />
          <FilterPill
            label="DEMOCRAT"
            count={partyCounts.D}
            active={partyFilter === 'D'}
            color="#3B82F6"
            onClick={() => setPartyFilter(partyFilter === 'D' ? 'all' : 'D')}
          />
          <FilterPill
            label="REPUBLICAN"
            count={partyCounts.R}
            active={partyFilter === 'R'}
            color="#EF4444"
            onClick={() => setPartyFilter(partyFilter === 'R' ? 'all' : 'R')}
          />
          <FilterPill
            label="INDEPENDENT"
            count={partyCounts.I}
            active={partyFilter === 'I'}
            color="#A855F7"
            onClick={() => setPartyFilter(partyFilter === 'I' ? 'all' : 'I')}
          />

          <div className="w-px bg-white/10 mx-1" />

          <FilterPill
            label="HOUSE"
            count={chamberCounts.house}
            active={chamberFilter === 'house'}
            color="#F59E0B"
            onClick={() => setChamberFilter(chamberFilter === 'house' ? 'all' : 'house')}
          />
          <FilterPill
            label="SENATE"
            count={chamberCounts.senate}
            active={chamberFilter === 'senate'}
            color="#10B981"
            onClick={() => setChamberFilter(chamberFilter === 'senate' ? 'all' : 'senate')}
          />

          <div className="w-px bg-white/10 mx-1" />

          {/* State filter dropdown */}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-full border px-4 py-2 font-body text-sm font-medium transition-all duration-200 appearance-none cursor-pointer pr-8 bg-no-repeat"
            style={{
              borderColor: stateFilter !== 'all' ? '#F59E0B' : 'rgba(255,255,255,0.1)',
              backgroundColor: stateFilter !== 'all' ? '#F59E0B15' : 'transparent',
              color: stateFilter !== 'all' ? '#F59E0B' : 'rgba(255,255,255,0.5)',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23999' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 12px center',
            }}
          >
            <option value="all" style={{ background: '#111', color: '#fff' }}>
              STATE ({stateList.length})
            </option>
            {stateList.map(({ state, count }) => (
              <option key={state} value={state} style={{ background: '#111', color: '#fff' }}>
                {state} ({count})
              </option>
            ))}
          </select>
        </motion.div>

        {/* Cards grid */}
        <div>
          {loading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="h-56 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <SearchX size={48} className="text-white/20" />
              <p className="font-body text-xl text-white/40">
                No members match your search
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 pb-4">
                {filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((person, idx) => (
                  <PersonCard
                    key={person.person_id}
                    person={person}
                    index={idx}
                  />
                ))}
              </div>
              {/* Pagination */}
              {(() => {
                const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
                if (totalPages <= 1) return null;
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
                return (
                  <div className="flex items-center justify-center gap-2 pb-8 pt-4">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-body text-sm text-white/50 transition-all hover:border-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      &larr;
                    </button>
                    {pages.map((page, i) =>
                      page === '...' ? (
                        <span key={`dots-${i}`} className="px-2 text-white/20 font-mono text-sm">...</span>
                      ) : (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`rounded-lg px-3.5 py-2 font-mono text-sm font-medium transition-all ${
                            page === currentPage
                              ? 'bg-blue-500 text-white'
                              : 'border border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          {page}
                        </button>
                      ),
                    )}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-body text-sm text-white/50 transition-all hover:border-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      &rarr;
                    </button>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
