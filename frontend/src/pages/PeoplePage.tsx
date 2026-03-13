import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Person } from '../api/types';
import BackButton from '../components/BackButton';

// ── Helpers ──

type PartyFilter = 'all' | 'D' | 'R' | 'I';
type ChamberFilter = 'all' | 'house' | 'senate';

const PARTY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  D: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6', label: 'Democrat' },
  R: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444', label: 'Republican' },
  I: { bg: 'rgba(168,85,247,0.15)', text: '#A855F7', label: 'Independent' },
};

function partyInfo(party: string) {
  return PARTY_COLORS[party?.charAt(0)] || { bg: 'rgba(107,114,128,0.15)', text: '#6B7280', label: party };
}

// ── Page ──

const PAGE_SIZE = 48;

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('all');
  const [chamberFilter, setChamberFilter] = useState<ChamberFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    apiClient
      .getPeople({ limit: 600 })
      .then((res) => setPeople(res.people || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, partyFilter, chamberFilter]);

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
    return result;
  }, [people, search, partyFilter, chamberFilter]);

  const partyCounts = useMemo(() => {
    const counts = { D: 0, R: 0, I: 0 };
    people.forEach((p) => {
      const key = p.party?.charAt(0) as 'D' | 'R' | 'I';
      if (counts[key] !== undefined) counts[key]++;
    });
    return counts;
  }, [people]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: '#020617' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#020617' }}>
      <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Header */}
        <div className="flex items-end justify-between mb-8 animate-fade-up">
          <div>
            <div className="mb-3">
              <BackButton to="/politics" label="Dashboard" />
            </div>
            <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white">
              Representatives
            </h1>
            <p className="mt-1 font-body text-sm text-white/40">
              {people.length} members of Congress tracked
            </p>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#3B82F6' }} />
              <span className="font-mono text-[11px] text-white/40">{partyCounts.D} Dem</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#EF4444' }} />
              <span className="font-mono text-[11px] text-white/40">{partyCounts.R} Rep</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#A855F7' }} />
              <span className="font-mono text-[11px] text-white/40">{partyCounts.I} Ind</span>
            </div>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-8 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
            <input
              type="text"
              placeholder="Search by name or state..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] pl-10 pr-4 py-2.5 font-body text-sm text-white placeholder-white/20 focus:border-blue-500/50 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
            {(['all', 'D', 'R', 'I'] as PartyFilter[]).map((val) => {
              const active = partyFilter === val;
              const labels: Record<string, string> = { all: 'All', D: 'Dem', R: 'Rep', I: 'Ind' };
              const colors: Record<string, string> = { D: '#3B82F6', R: '#EF4444', I: '#A855F7' };
              return (
                <button
                  key={val}
                  onClick={() => setPartyFilter(val)}
                  className={`rounded-md px-3 py-1.5 font-body text-xs font-medium transition-all ${
                    active ? 'text-white' : 'text-white/30 hover:text-white/50'
                  }`}
                  style={active ? { backgroundColor: colors[val] || '#1E293B' } : undefined}
                >
                  {labels[val]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
            {(['all', 'house', 'senate'] as ChamberFilter[]).map((val) => (
              <button
                key={val}
                onClick={() => setChamberFilter(val)}
                className={`rounded-md px-3 py-1.5 font-body text-xs font-medium transition-all ${
                  chamberFilter === val ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/50'
                }`}
              >
                {val === 'all' ? 'All' : val === 'house' ? 'House' : 'Senate'}
              </button>
            ))}
          </div>

          <span className="font-mono text-[11px] text-white/20 ml-auto">
            {filtered.length} of {people.length}
          </span>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center">
            <Users size={32} className="text-white/10 mb-3" />
            <p className="font-body text-sm text-white/30">No members match your filters</p>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((person, idx) => {
              const pi = partyInfo(person.party);
              return (
                <Link
                  key={person.person_id}
                  to={`/politics/people/${person.person_id}`}
                  className="group rounded-xl border border-white/5 p-5 transition-all duration-300 hover:border-white/15 no-underline animate-fade-up"
                  style={{ backgroundColor: '#0F172A', animationDelay: `${150 + Math.min(idx, 20) * 30}ms` }}
                >
                  <div className="flex items-start gap-4">
                    {person.photo_url ? (
                      <img
                        src={person.photo_url}
                        alt={person.display_name}
                        className="h-14 w-14 rounded-full object-cover grayscale transition-all duration-300 group-hover:grayscale-0"
                      />
                    ) : (
                      <div
                        className="flex h-14 w-14 items-center justify-center rounded-full font-heading text-lg font-bold text-white"
                        style={{ backgroundColor: pi.bg }}
                      >
                        {person.display_name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
                        {person.display_name}
                      </p>
                      <p className="font-mono text-[11px] text-white/30 mt-0.5">{person.state}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                          style={{ backgroundColor: pi.bg, color: pi.text }}
                        >
                          {pi.label}
                        </span>
                        <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/30">
                          {person.chamber?.toLowerCase().includes('senate') ? 'Senate' : 'House'}
                        </span>
                        {person.is_active && (
                          <span className="ml-auto font-mono text-[10px] text-emerald-400">Active</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {/* Numbered Pagination */}
          {(() => {
            const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
            if (totalPages <= 1) return null;

            // Build page numbers to show (max 7 visible)
            const pages: (number | '...')[] = [];
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
              pages.push(1);
              if (currentPage > 3) pages.push('...');
              for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                pages.push(i);
              }
              if (currentPage < totalPages - 2) pages.push('...');
              pages.push(totalPages);
            }

            return (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
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
                      onClick={() => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
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
                  onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
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

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <BackButton to="/politics" label="Dashboard" />
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}
