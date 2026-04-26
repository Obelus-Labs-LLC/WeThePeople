import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin, Search, Users, AlertCircle, ArrowLeft, Heart } from 'lucide-react';
import { motion } from 'framer-motion';
import { getApiBaseUrl } from '../api/client';
import { PoliticsSectorHeader } from '../components/SectorHeader';

// ── Types ──

interface Representative {
  person_id: string;
  display_name: string;
  party: string;
  chamber: string;
  state: string;
  district: string | null;
  photo_url: string | null;
  is_active: boolean;
}

interface RepLookupResponse {
  zip: string;
  total: number;
  representatives: Representative[];
}

// ── Party tokens ──
// Hex pair enables opacity combinations like `${hex}20`/`${hex}33`/`${hex}10`
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

function partyHex(party: string): string {
  return PARTY_HEX[party?.charAt(0)] || '#7F8590';
}

function partyToken(party: string): string {
  return PARTY_TOKEN[party?.charAt(0)] || 'var(--color-text-2)';
}

function partyLabel(party: string): string {
  const map: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };
  return map[party?.charAt(0)] || party;
}

function chamberLabel(chamber: string): string {
  if (!chamber) return '';
  const c = chamber.toLowerCase();
  if (c.includes('senate') || c === 'upper') return 'Senate';
  return 'House';
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Page ──

export default function RepresentativeLookupPage() {
  const [searchParams] = useSearchParams();
  const [zip, setZip] = useState('');
  const [submittedZip, setSubmittedZip] = useState('');
  const [reps, setReps] = useState<Representative[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataUnavailable, setDataUnavailable] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async (zipCode: string) => {
    const cleaned = zipCode.trim().replace(/\D/g, '').slice(0, 5);
    if (cleaned.length < 5) return;

    setZip(cleaned);
    setLoading(true);
    setError(null);
    setDataUnavailable(false);
    setSearched(true);
    setSubmittedZip(cleaned);

    try {
      const res = await fetch(
        `${getApiBaseUrl()}/representatives?zip=${encodeURIComponent(cleaned)}`,
      );
      if (res.status === 404) {
        setDataUnavailable(true);
        setReps([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RepLookupResponse = await res.json();
      setReps(data.representatives || []);
    } catch (err) {
      console.warn('[RepresentativeLookupPage] zip lookup failed:', err);
      const detail = err instanceof Error ? err.message : '';
      setError(
        detail
          ? `Unable to load data (${detail}). Please try again.`
          : 'Unable to load data. Please try again.',
      );
      setReps([]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-search if zip is passed in URL (from landing page)
  useEffect(() => {
    const urlZip = searchParams.get('zip');
    if (urlZip && urlZip.replace(/\D/g, '').length === 5) {
      doSearch(urlZip);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(zip);
  };

  const isValidZip = zip.trim().replace(/\D/g, '').length >= 5;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          padding: '40px 24px 64px',
        }}
      >
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
          style={{ marginBottom: 36 }}
        >
          <p
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: 'var(--color-dem)',
              marginBottom: 12,
            }}
          >
            Find your rep
          </p>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(36px, 5vw, 56px)',
              lineHeight: 1.02,
              color: 'var(--color-text-1)',
              marginBottom: 12,
            }}
          >
            Who represents you?
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
              color: 'var(--color-text-2)',
              lineHeight: 1.6,
              maxWidth: 640,
            }}
          >
            Enter your zip code to find your congressional representatives. See their voting records, legislative activity, and financial data.
          </p>
        </motion.div>

        {/* Search form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{ marginBottom: 36 }}
        >
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', gap: 12, maxWidth: 520, flexWrap: 'wrap' }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
              <MapPin
                size={16}
                style={{
                  position: 'absolute',
                  left: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-3)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="Enter your zip code (e.g. 90210)"
                maxLength={10}
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  padding: '13px 16px 13px 44px',
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 17,
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-1)',
                  outline: 'none',
                  transition: 'border-color 150ms',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
              />
            </div>
            <button
              type="submit"
              disabled={!isValidZip || loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 12,
                background: 'var(--color-accent)',
                color: '#07090C',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '13px 24px',
                border: 'none',
                cursor: !isValidZip || loading ? 'not-allowed' : 'pointer',
                opacity: !isValidZip || loading ? 0.4 : 1,
                transition: 'opacity 150ms',
              }}
            >
              <Search size={15} />
              Look up
            </button>
          </form>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '2px solid var(--color-accent)',
                borderTopColor: 'transparent',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        )}

        {/* Error state */}
        {!loading && searched && error && !dataUnavailable && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              borderRadius: 12,
              border: '1px solid rgba(230,57,70,0.25)',
              background: 'rgba(230,57,70,0.08)',
              padding: '40px 24px',
              textAlign: 'center',
            }}
          >
            <AlertCircle size={36} style={{ color: 'rgba(230,57,70,0.5)', margin: '0 auto 14px' }} />
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                color: 'var(--color-red)',
              }}
            >
              {error}
            </p>
          </motion.div>
        )}

        {/* Data unavailable / coming soon */}
        {!loading && searched && dataUnavailable && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              padding: '56px 24px',
              textAlign: 'center',
            }}
          >
            <MapPin size={44} style={{ color: 'var(--color-dem)', opacity: 0.3, margin: '0 auto 16px' }} />
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: 'clamp(24px, 3vw, 32px)',
                color: 'var(--color-text-1)',
                marginBottom: 10,
              }}
            >
              Zip code lookup coming soon
            </h2>
            <p
              style={{
                maxWidth: 440,
                margin: '0 auto',
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                color: 'var(--color-text-2)',
                lineHeight: 1.6,
              }}
            >
              We're building zip code-based representative lookup using census and redistricting data. In the meantime, you can browse all members on the People page.
            </p>
            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Link
                to="/politics/people"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 10,
                  background: 'var(--color-accent)',
                  color: '#07090C',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '10px 18px',
                  textDecoration: 'none',
                }}
              >
                <Users size={14} />
                Browse all members
              </Link>
              <Link
                to="/politics"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 10,
                  border: '1px solid var(--color-border-hover)',
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text-1)',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '10px 18px',
                  textDecoration: 'none',
                }}
              >
                Dashboard
              </Link>
            </div>
          </motion.div>
        )}

        {/* No results */}
        {!loading && searched && !dataUnavailable && reps.length === 0 && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              padding: '56px 24px',
              textAlign: 'center',
            }}
          >
            <AlertCircle size={36} style={{ color: 'var(--color-text-3)', margin: '0 auto 14px' }} />
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--color-text-2)' }}>
              No representatives found for zip code {submittedZip}.
            </p>
            <p
              style={{
                marginTop: 4,
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: 'var(--color-text-3)',
              }}
            >
              Please check the zip code and try again.
            </p>
          </motion.div>
        )}

        {/* Results */}
        {!loading && reps.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <p
              style={{
                marginBottom: 10,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 11,
                letterSpacing: '0.04em',
                color: 'var(--color-text-3)',
                textTransform: 'uppercase',
              }}
            >
              {reps.length} representative{reps.length !== 1 ? 's' : ''} for {submittedZip}
            </p>

            <div
              style={{
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-accent-dim)',
                padding: '12px 16px',
              }}
            >
              <AlertCircle size={15} style={{ marginTop: 2, color: 'var(--color-accent-text)', flexShrink: 0 }} />
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: 'var(--color-text-2)',
                  lineHeight: 1.55,
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--color-text-1)' }}>State-level lookup</span> — Showing all senators and House members for your state. District-level matching is not yet available, so some House members shown may not represent your specific congressional district.
              </p>
            </div>

            {/* State legislature link */}
            {reps.length > 0 && reps[0].state && (
              <div
                style={{
                  marginBottom: 16,
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--color-text-1)',
                    }}
                  >
                    Explore {reps[0].state} state legislature
                  </p>
                  <p
                    style={{
                      marginTop: 2,
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12,
                      color: 'var(--color-text-3)',
                    }}
                  >
                    Browse state-level legislators and bills
                  </p>
                </div>
                <Link
                  to={`/politics/states/${reps[0].state.toLowerCase()}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 10,
                    background: 'var(--color-accent-dim)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-accent-text)',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '8px 14px',
                    textDecoration: 'none',
                  }}
                >
                  <MapPin size={14} />
                  State data
                </Link>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 14,
              }}
            >
              {reps.map((rep, idx) => (
                <motion.div
                  key={rep.person_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.06 }}
                >
                  <RepCard rep={rep} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 64,
            borderTop: '1px solid var(--color-border)',
            paddingTop: 20,
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
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            <ArrowLeft size={14} /> Politics dashboard
          </Link>
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 10,
              letterSpacing: '0.04em',
              color: 'var(--color-text-3)',
            }}
          >
            WeThePeople
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Rep Card ──

function RepCard({ rep }: { rep: Representative }) {
  const hex = partyHex(rep.party);
  const token = partyToken(rep.party);
  const isSenate = chamberLabel(rep.chamber) === 'Senate';

  return (
    <Link
      to={`/politics/people/${rep.person_id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        style={{
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          padding: 20,
          transition: 'all 200ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {rep.photo_url ? (
            <img
              src={rep.photo_url}
              alt={rep.display_name}
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--color-border-hover)',
              }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--color-text-1)',
                background: `${hex}1F`,
                border: '2px solid var(--color-border-hover)',
              }}
            >
              {initials(rep.display_name)}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--color-text-1)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {rep.display_name}
            </h3>
            <p
              style={{
                marginTop: 2,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 11,
                color: 'var(--color-text-3)',
              }}
            >
              {rep.state}{rep.district ? `, District ${rep.district}` : ''}
            </p>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span
            style={{
              borderRadius: 999,
              padding: '4px 10px',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              background: `${hex}1F`,
              color: token,
            }}
          >
            {partyLabel(rep.party)}
          </span>
          <span
            style={{
              borderRadius: 999,
              background: 'var(--color-surface-2)',
              padding: '4px 10px',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-2)',
            }}
          >
            {chamberLabel(rep.chamber)}
          </span>
          {isSenate && (
            <span
              style={{
                borderRadius: 999,
                background: 'rgba(61,184,122,0.15)',
                padding: '4px 10px',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--color-green)',
              }}
            >
              Your senator
            </span>
          )}
          {!rep.is_active && (
            <span
              style={{
                borderRadius: 999,
                background: 'rgba(230,57,70,0.12)',
                padding: '3px 10px',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 10,
                color: 'var(--color-red)',
              }}
            >
              Inactive
            </span>
          )}
        </div>

        {/* Contribute to campaign */}
        <a
          href={(() => {
            const q = encodeURIComponent(rep.display_name);
            const p = rep.party?.charAt(0);
            if (p === 'D') return `https://secure.actblue.com/search?q=${q}`;
            if (p === 'R') return `https://secure.winred.com/search?query=${q}`;
            return `https://www.fec.gov/data/candidates/?search=${q}`;
          })()}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderRadius: 10,
            padding: '9px 12px',
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 600,
            background: `${hex}14`,
            color: token,
            border: `1px solid ${hex}33`,
            textDecoration: 'none',
            transition: 'background 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `${hex}26`; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `${hex}14`; }}
        >
          <Heart size={13} /> Contribute to campaign
        </a>
      </div>
    </Link>
  );
}
