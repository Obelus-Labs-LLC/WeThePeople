import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight, Building2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '../api/client';
import { PoliticsSectorHeader } from '../components/SectorHeader';

// ── Types ──

interface CommitteeMember {
  person_id: string | null;
  display_name: string;
  party: string | null;
  state: string | null;
  role: string | null;
  photo_url: string | null;
}

interface Committee {
  committee_id: string;
  name: string;
  chamber: string;
  chair: string | null;
  member_count: number;
  url: string | null;
  members?: CommitteeMember[];
}

interface CommitteesResponse {
  total: number;
  committees: Committee[];
}

// ── Constants ──

const CHAMBER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'house', label: 'House' },
  { key: 'senate', label: 'Senate' },
  { key: 'joint', label: 'Joint' },
];

const PARTY_COLORS: Record<string, string> = { D: '#3B82F6', R: '#EF4444', I: '#A855F7' };

// ── Helpers ──

function partyColor(party: string | null): string {
  return PARTY_COLORS[party?.charAt(0) || ''] || '#6B7280';
}

function chamberColor(chamber: string): string {
  const c = chamber.toLowerCase();
  if (c.includes('senate') || c === 'upper') return '#8B5CF6';
  if (c.includes('joint')) return '#F59E0B';
  return '#3B82F6';
}

// ── Page ──

export default function CommitteesPage() {
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataUnavailable, setDataUnavailable] = useState(false);
  const [chamberFilter, setChamberFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`${getApiBaseUrl()}/committees`)
      .then((res) => {
        if (res.status === 404) {
          setDataUnavailable(true);
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: CommitteesResponse | null) => {
        if (data) {
          setCommittees(data.committees || []);
        }
      })
      .catch((err) => {
        // Treat fetch errors (e.g. network) gracefully
        setDataUnavailable(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = async (committee: Committee) => {
    if (expandedId === committee.committee_id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(committee.committee_id);

    // Fetch members if not already loaded
    if (!committee.members) {
      setLoadingMembers(committee.committee_id);
      try {
        const res = await fetch(`${getApiBaseUrl()}/committees/${committee.committee_id}/members`);
        if (res.ok) {
          const data = await res.json();
          setCommittees((prev) =>
            prev.map((c) =>
              c.committee_id === committee.committee_id
                ? { ...c, members: data.members || [] }
                : c
            )
          );
        }
      } catch {
        // Members endpoint may not exist, that's fine
      } finally {
        setLoadingMembers(null);
      }
    }
  };

  const filtered = committees.filter((c) => {
    if (chamberFilter !== 'all') {
      const ch = c.chamber.toLowerCase();
      if (chamberFilter === 'house' && !ch.includes('house') && ch !== 'lower') return false;
      if (chamberFilter === 'senate' && !ch.includes('senate') && ch !== 'upper') return false;
      if (chamberFilter === 'joint' && !ch.includes('joint')) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.chair?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

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
            Congressional Committees
          </p>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-white lg:text-5xl">
            Committees
          </h1>
          <p className="mt-3 max-w-2xl font-body text-base text-white/40 leading-relaxed">
            Explore the committees that shape legislation in Congress. View members, chairs, and committee jurisdiction.
          </p>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {/* Data coming soon state */}
        {!loading && dataUnavailable && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="rounded-xl border border-white/10 bg-white/[0.02] py-16 text-center mb-8">
              <Building2 size={48} className="mx-auto mb-5 text-blue-500/30" />
              <h2 className="font-heading text-2xl font-bold text-white mb-3">
                Committee Data Coming Soon
              </h2>
              <p className="max-w-md mx-auto font-body text-sm text-white/40 leading-relaxed">
                We're building out committee data including membership rosters, hearing schedules,
                and jurisdiction details. This feature will be available in an upcoming release.
              </p>
              <div className="mt-8 flex justify-center gap-3">
                <Link
                  to="/politics/people"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-blue-600 no-underline"
                >
                  <Users size={16} />
                  Browse Members
                </Link>
                <Link
                  to="/politics"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2.5 font-body text-sm font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white no-underline"
                >
                  Dashboard
                </Link>
              </div>
            </div>

            {/* Placeholder preview of what committees will look like */}
            <div className="mb-4 flex items-center gap-2">
              <span className="font-mono text-xs text-white/20 uppercase tracking-wider">Preview</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>
            <div className="flex flex-col gap-3 opacity-50 pointer-events-none">
              {[
                { name: 'Committee on Appropriations', chamber: 'House', members: 53 },
                { name: 'Committee on Armed Services', chamber: 'Senate', members: 27 },
                { name: 'Committee on the Judiciary', chamber: 'House', members: 40 },
              ].map((placeholder) => (
                <div
                  key={placeholder.name}
                  className="rounded-xl border border-white/5 p-5 flex items-center gap-4"
                  style={{ backgroundColor: '#0F172A' }}
                >
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}
                  >
                    <Building2 size={18} className="text-blue-500/50" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-body text-base font-medium text-white/60 truncate">
                      {placeholder.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-white/20">
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-body text-[10px] font-bold uppercase text-blue-400/40">
                        {placeholder.chamber}
                      </span>
                      <span className="font-mono">{placeholder.members} members</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="flex-shrink-0 text-white/10" />
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Committees list */}
        {!loading && !dataUnavailable && (
          <>
            {/* Search + filter */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-6 flex flex-col sm:flex-row gap-4"
            >
              <div className="relative flex-1">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search committees..."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-12 py-3 font-body text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none transition-colors"
                />
              </div>
              <div className="flex gap-2">
                {CHAMBER_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setChamberFilter(opt.key)}
                    className={`rounded-full px-4 py-2 font-body text-sm transition-all ${
                      chamberFilter === opt.key
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-white/5 text-white/40 border border-white/5 hover:text-white/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Count */}
            <p className="mb-4 font-mono text-xs text-white/30">
              {filtered.length} committee{filtered.length !== 1 ? 's' : ''}
            </p>

            {/* Empty */}
            {filtered.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] py-16 text-center">
                <Users size={40} className="mx-auto mb-4 text-white/10" />
                <p className="font-body text-sm text-white/40">
                  No committees match your search.
                </p>
              </div>
            )}

            {/* List */}
            <div className="flex flex-col gap-3">
              {filtered.map((committee, idx) => (
                <motion.div
                  key={committee.committee_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.5) }}
                >
                  <div
                    className="rounded-xl border border-white/5 transition-all duration-300 hover:border-white/10 overflow-hidden"
                    style={{ backgroundColor: '#0F172A' }}
                  >
                    {/* Committee header */}
                    <button
                      onClick={() => toggleExpand(committee)}
                      className="w-full p-5 flex items-center gap-4 text-left cursor-pointer"
                    >
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${chamberColor(committee.chamber)}20` }}
                      >
                        <Building2 size={18} style={{ color: chamberColor(committee.chamber) }} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="font-body text-base font-medium text-white truncate">
                          {committee.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/30">
                          <span
                            className="rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase"
                            style={{
                              backgroundColor: `${chamberColor(committee.chamber)}20`,
                              color: chamberColor(committee.chamber),
                            }}
                          >
                            {committee.chamber}
                          </span>
                          <span className="font-mono">{committee.member_count} members</span>
                          {committee.chair && (
                            <span>Chair: {committee.chair}</span>
                          )}
                        </div>
                      </div>

                      <ChevronRight
                        size={18}
                        className={`flex-shrink-0 text-white/20 transition-transform ${
                          expandedId === committee.committee_id ? 'rotate-90' : ''
                        }`}
                      />
                    </button>

                    {/* Expanded: members */}
                    <AnimatePresence>
                      {expandedId === committee.committee_id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-white/5 px-5 py-4">
                            {loadingMembers === committee.committee_id ? (
                              <div className="flex items-center justify-center py-6">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                              </div>
                            ) : committee.members && committee.members.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {committee.members.map((member, i) => (
                                  <MemberCard key={`${member.person_id || i}`} member={member} />
                                ))}
                              </div>
                            ) : (
                              <p className="py-4 text-center font-body text-xs text-white/30">
                                Member data not yet available for this committee.
                              </p>
                            )}

                            {committee.url && (
                              <a
                                href={committee.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 inline-block font-body text-xs text-blue-400 hover:text-blue-300 transition-colors no-underline"
                              >
                                View on Congress.gov &rarr;
                              </a>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
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

// ── Member Card ──

function MemberCard({ member }: { member: CommitteeMember }) {
  const color = partyColor(member.party);

  const content = (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 transition-colors hover:border-white/10">
      {member.photo_url ? (
        <img
          src={member.photo_url}
          alt={member.display_name}
          className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10"
        />
      ) : (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full font-heading text-xs font-bold text-white ring-1 ring-white/10"
          style={{ backgroundColor: `${color}33` }}
        >
          {member.display_name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-body text-sm text-white truncate">{member.display_name}</p>
        <div className="flex items-center gap-1.5">
          {member.party && (
            <span
              className="font-mono text-[10px] font-bold"
              style={{ color }}
            >
              {member.party}
            </span>
          )}
          {member.state && (
            <span className="font-mono text-[10px] text-white/25">{member.state}</span>
          )}
          {member.role && member.role.toLowerCase() !== 'member' && (
            <span className="rounded bg-blue-500/10 px-1 py-0.5 font-mono text-[9px] text-blue-400">
              {member.role}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (member.person_id) {
    return (
      <Link to={`/politics/people/${member.person_id}`} className="no-underline block">
        {content}
      </Link>
    );
  }

  return content;
}
