import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight, Building2, Search, ArrowLeft, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '../api/client';
import { PoliticsSectorHeader } from '../components/SectorHeader';

// ── Types ──

interface CommitteeMember {
  bioguide_id: string;
  person_id: string | null;
  member_name: string | null;
  display_name?: string;
  member_party?: string;
  party: string | null;
  state: string | null;
  role: string;
  rank: number | null;
  photo_url?: string | null;
  chamber?: string;
}

interface SubCommittee {
  thomas_id: string;
  name: string;
  chamber: string;
  member_count: number;
}

interface Committee {
  thomas_id: string;
  name: string;
  chamber: string;
  committee_type: string | null;
  member_count: number;
  url: string | null;
  jurisdiction: string | null;
  subcommittees?: SubCommittee[];
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

// ── Helpers ──

function partyToken(party: string | null): string {
  return PARTY_TOKEN[party?.charAt(0)?.toUpperCase() || ''] || 'var(--color-text-3)';
}

function partyHex(party: string | null): string {
  return PARTY_HEX[party?.charAt(0)?.toUpperCase() || ''] || '#7F8593';
}

function chamberToken(chamber: string): { color: string; hex: string } {
  const c = chamber.toLowerCase();
  if (c.includes('senate') || c === 'upper') return { color: 'var(--color-ind)', hex: '#B06FD8' };
  if (c.includes('joint')) return { color: 'var(--color-accent-text)', hex: '#D4AE35' };
  return { color: 'var(--color-dem)', hex: '#4A7FDE' };
}

// ── Styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: 1400,
  margin: '0 auto',
  padding: '40px 32px 80px',
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--color-accent-dim)',
  border: '1px solid var(--color-border)',
  borderRadius: 999,
  padding: '6px 14px',
  marginBottom: 20,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-accent-text)',
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(36px, 5vw, 56px)',
  lineHeight: 1.05,
  color: 'var(--color-text-1)',
  marginBottom: 12,
};

const leadStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 15,
  color: 'var(--color-text-2)',
  lineHeight: 1.65,
  maxWidth: 680,
};

// ── Page ──

export default function CommitteesPage() {
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataUnavailable, setDataUnavailable] = useState(false);
  const [chamberFilter, setChamberFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`${getApiBaseUrl()}/committees`)
      .then((res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setDataUnavailable(true);
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: CommitteesResponse | null) => {
        if (cancelled) return;
        if (data) setCommittees(data.committees || []);
      })
      .catch(() => {
        if (!cancelled) setDataUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleExpand = async (committee: Committee) => {
    if (expandedId === committee.thomas_id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(committee.thomas_id);

    if (!committee.members) {
      setLoadingMembers(committee.thomas_id);
      try {
        const res = await fetch(`${getApiBaseUrl()}/committees/${committee.thomas_id}/members`);
        if (res.ok) {
          const data = await res.json();
          setCommittees((prev) =>
            prev.map((c) =>
              c.thomas_id === committee.thomas_id ? { ...c, members: data.members || [] } : c,
            ),
          );
        }
      } catch {
        // ignore
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
      if (!c.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={pageShell}>
      <div style={contentWrap}>
        {/* Nav */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ marginBottom: 40 }}
        >
          <PoliticsSectorHeader />
        </motion.nav>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{ marginBottom: 32 }}
        >
          <div style={eyebrowStyle}>
            <Building2 size={12} style={{ color: 'var(--color-accent-text)' }} />
            Congressional committees
          </div>
          <h1 style={titleStyle}>
            Where bills go to <span style={{ color: 'var(--color-accent-text)' }}>live or die</span>
          </h1>
          <p style={leadStyle}>
            Explore the committees that shape legislation. View members, chairs, and jurisdiction.
          </p>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '2px solid var(--color-border)',
                borderTopColor: 'var(--color-accent)',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        )}

        {/* Data unavailable state */}
        {!loading && dataUnavailable && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div
              style={{
                borderRadius: 16,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                padding: '64px 32px',
                textAlign: 'center',
                marginBottom: 32,
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: 'var(--color-accent-dim)',
                  marginBottom: 20,
                }}
              >
                <Building2 size={24} style={{ color: 'var(--color-accent-text)' }} />
              </div>
              <h2
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontStyle: 'italic',
                  fontWeight: 900,
                  fontSize: 28,
                  color: 'var(--color-text-1)',
                  marginBottom: 12,
                }}
              >
                Unable to load committee data
              </h2>
              <p
                style={{
                  maxWidth: 440,
                  margin: '0 auto 28px',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  color: 'var(--color-text-2)',
                  lineHeight: 1.6,
                }}
              >
                Committee data couldn't be loaded. Please try again later.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                <Link
                  to="/politics/people"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 10,
                    background: 'var(--color-accent)',
                    color: '#07090C',
                    padding: '10px 20px',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    textDecoration: 'none',
                    transition: 'opacity 150ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                >
                  <Users size={14} />
                  Browse members
                </Link>
                <Link
                  to="/politics"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-2)',
                    padding: '10px 20px',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                    transition: 'border-color 150ms, color 150ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-accent)';
                    e.currentTarget.style.color = 'var(--color-text-1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.color = 'var(--color-text-2)';
                  }}
                >
                  Dashboard
                </Link>
              </div>
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
              style={{
                marginBottom: 24,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 260 }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 16,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-3)',
                  }}
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search committees..."
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 44px',
                    borderRadius: 12,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-1)',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 150ms, box-shadow 150ms',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-accent)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CHAMBER_OPTIONS.map((opt) => {
                  const active = chamberFilter === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setChamberFilter(opt.key)}
                      style={{
                        borderRadius: 999,
                        padding: '8px 16px',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                        background: active ? 'var(--color-accent-dim)' : 'var(--color-surface)',
                        color: active ? 'var(--color-accent-text)' : 'var(--color-text-2)',
                        transition: 'border-color 150ms, color 150ms',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.borderColor = 'var(--color-accent)';
                          e.currentTarget.style.color = 'var(--color-text-1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.borderColor = 'var(--color-border)';
                          e.currentTarget.style.color = 'var(--color-text-2)';
                        }
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Count */}
            <p
              style={{
                marginBottom: 16,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 11,
                color: 'var(--color-text-3)',
                letterSpacing: '0.05em',
              }}
            >
              {filtered.length} committee{filtered.length !== 1 ? 's' : ''}
            </p>

            {/* Empty */}
            {filtered.length === 0 && (
              <div
                style={{
                  borderRadius: 14,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  padding: '64px 0',
                  textAlign: 'center',
                }}
              >
                <Users
                  size={36}
                  style={{ margin: '0 auto 12px', color: 'var(--color-text-3)', opacity: 0.5 }}
                />
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    color: 'var(--color-text-3)',
                  }}
                >
                  No committees match your search.
                </p>
              </div>
            )}

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((committee, idx) => {
                const token = chamberToken(committee.chamber);
                const isExpanded = expandedId === committee.thomas_id;
                return (
                  <motion.div
                    key={committee.thomas_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(idx * 0.02, 0.4) }}
                  >
                    <div
                      style={{
                        borderRadius: 14,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        overflow: 'hidden',
                        transition: 'border-color 150ms',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                    >
                      {/* Committee header */}
                      <button
                        onClick={() => toggleExpand(committee)}
                        style={{
                          width: '100%',
                          padding: 20,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 16,
                          textAlign: 'left',
                          cursor: 'pointer',
                          background: 'transparent',
                          border: 'none',
                          color: 'inherit',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexShrink: 0,
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: 40,
                            width: 40,
                            borderRadius: 10,
                            background: `${token.hex}1F`,
                          }}
                        >
                          <Building2 size={18} style={{ color: token.color }} />
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h3
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontSize: 15,
                              fontWeight: 600,
                              color: 'var(--color-text-1)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {committee.name}
                          </h3>
                          <div
                            style={{
                              marginTop: 6,
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 999,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                background: `${token.hex}1F`,
                                color: token.color,
                              }}
                            >
                              {committee.chamber}
                            </span>
                            <span
                              style={{
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: 11,
                                color: 'var(--color-text-3)',
                              }}
                            >
                              {committee.member_count} members
                            </span>
                            {committee.subcommittees && committee.subcommittees.length > 0 && (
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                  fontSize: 11,
                                  color: 'var(--color-text-3)',
                                }}
                              >
                                {committee.subcommittees.length} subcommittees
                              </span>
                            )}
                          </div>
                        </div>

                        <ChevronRight
                          size={18}
                          style={{
                            flexShrink: 0,
                            color: 'var(--color-text-3)',
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 200ms',
                          }}
                        />
                      </button>

                      {/* Expanded: members */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div
                              style={{
                                borderTop: '1px solid var(--color-border)',
                                padding: '16px 20px',
                              }}
                            >
                              {loadingMembers === committee.thomas_id ? (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '24px 0',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: '50%',
                                      border: '2px solid var(--color-border)',
                                      borderTopColor: 'var(--color-accent)',
                                      animation: 'spin 1s linear infinite',
                                    }}
                                  />
                                </div>
                              ) : committee.members && committee.members.length > 0 ? (
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                    gap: 8,
                                  }}
                                >
                                  {committee.members.map((member, i) => (
                                    <MemberCard key={`${member.person_id || i}`} member={member} />
                                  ))}
                                </div>
                              ) : (
                                <p
                                  style={{
                                    padding: '16px 0',
                                    textAlign: 'center',
                                    fontFamily: "'Inter', sans-serif",
                                    fontSize: 12,
                                    color: 'var(--color-text-3)',
                                  }}
                                >
                                  Member data not yet available for this committee.
                                </p>
                              )}

                              {committee.url && (
                                <a
                                  href={committee.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    marginTop: 12,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontFamily: "'Inter', sans-serif",
                                    fontSize: 12,
                                    color: 'var(--color-accent-text)',
                                    textDecoration: 'none',
                                    transition: 'opacity 150ms',
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                                >
                                  View on Congress.gov
                                  <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 64,
            borderTop: '1px solid var(--color-border)',
            paddingTop: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            to="/politics"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-text-2)',
              textDecoration: 'none',
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            <ArrowLeft size={12} />
            Politics dashboard
          </Link>
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 10,
              color: 'var(--color-text-3)',
              letterSpacing: '0.05em',
            }}
          >
            wethepeople
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Member Card ──

function MemberCard({ member }: { member: CommitteeMember }) {
  const displayName = member.display_name || member.member_name || 'Unknown';
  const displayParty = member.member_party || member.party;
  const token = partyToken(displayParty);
  const hex = partyHex(displayParty);

  const roleLabel = member.role?.replace(/_/g, ' ');
  const isLeadership = roleLabel && roleLabel.toLowerCase() !== 'member';

  const content = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface-2)',
        padding: 10,
        transition: 'border-color 150ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
    >
      {member.photo_url ? (
        <img
          src={member.photo_url}
          alt={displayName}
          style={{
            height: 32,
            width: 32,
            borderRadius: '50%',
            objectFit: 'cover',
            border: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 32,
            width: 32,
            borderRadius: '50%',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 12,
            fontWeight: 700,
            color: token,
            background: `${hex}26`,
            border: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        >
          {displayName.charAt(0)}
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: 'var(--color-text-1)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {displayName}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          {displayParty && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 10,
                fontWeight: 700,
                color: token,
              }}
            >
              {displayParty}
            </span>
          )}
          {member.state && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 10,
                color: 'var(--color-text-3)',
              }}
            >
              {member.state}
            </span>
          )}
          {isLeadership && (
            <span
              style={{
                padding: '1px 5px',
                borderRadius: 3,
                background: 'var(--color-accent-dim)',
                color: 'var(--color-accent-text)',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 9,
                textTransform: 'capitalize',
              }}
            >
              {roleLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (member.person_id) {
    return (
      <Link to={`/politics/people/${member.person_id}`} style={{ textDecoration: 'none', display: 'block' }}>
        {content}
      </Link>
    );
  }
  return content;
}
