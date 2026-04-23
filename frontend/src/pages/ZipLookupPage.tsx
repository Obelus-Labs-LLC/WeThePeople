import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MapPin, Search, AlertTriangle, TrendingUp, TrendingDown,
  Users, Shield, DollarSign, Clock, ExternalLink, Share2,
  ChevronDown, ChevronUp, AlertCircle, Building2, Vote, ArrowLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '../api/client';

// ── Types ──

interface RedFlags {
  anomaly_count: number;
  late_disclosures: number;
  committee_stock_overlaps: number;
  top_anomaly: { title: string; score: number; pattern_type: string } | null;
}

interface Trade {
  ticker: string | null;
  asset_name: string | null;
  transaction_type: string;
  amount_range: string | null;
  transaction_date: string | null;
  disclosure_date: string | null;
  reporting_gap: string | null;
  owner: string | null;
}

interface Donor {
  entity_id: string;
  entity_type: string;
  pac_name: string | null;
  total_amount: number;
  donation_count: number;
}

interface CommitteeInfo {
  committee_name: string;
  committee_chamber: string;
  role: string;
  thomas_id: string;
}

interface AnomalyInfo {
  pattern_type: string;
  title: string;
  score: number;
  description: string | null;
  detected_at: string | null;
}

interface VoteInfo {
  question: string;
  vote_date: string | null;
  result: string | null;
  position: string | null;
  related_bill: string | null;
}

interface Representative {
  person_id: string;
  name: string;
  party: string;
  chamber: string;
  state: string;
  photo_url: string | null;
  bioguide_id: string;
  red_flags: RedFlags;
  trades: Trade[];
  donors: Donor[];
  committees: CommitteeInfo[];
  anomalies: AnomalyInfo[];
  votes: VoteInfo[];
}

interface LookupResponse {
  zip_code: string;
  state: string;
  representative_count: number;
  representatives: Representative[];
  generated_at: string;
}

// ── Party tokens ──

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

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
};

// ── Helpers ──

function partyHex(party: string): string {
  return PARTY_HEX[party?.charAt(0)] || '#7F8590';
}

function partyToken(party: string): string {
  return PARTY_TOKEN[party?.charAt(0)] || 'var(--color-text-2)';
}

function chamberLabel(chamber: string): string {
  if (!chamber) return '';
  const c = chamber.toLowerCase();
  if (c.includes('senate') || c === 'upper') return 'Senator';
  return 'Representative';
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function tradeIcon(type: string) {
  const t = type?.toLowerCase();
  if (t === 'purchase' || t === 'buy') return <TrendingUp size={14} style={{ color: 'var(--color-green)' }} />;
  if (t === 'sale' || t === 'sell' || t === 'sale (full)' || t === 'sale (partial)')
    return <TrendingDown size={14} style={{ color: 'var(--color-red)' }} />;
  return <TrendingUp size={14} style={{ color: 'var(--color-text-3)' }} />;
}

function totalRedFlags(flags: RedFlags): number {
  return flags.anomaly_count + flags.late_disclosures + flags.committee_stock_overlaps;
}

// ── Page ──

export default function ZipLookupPage() {
  const [searchParams] = useSearchParams();
  const [zip, setZip] = useState('');
  const [data, setData] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const doSearch = async (zipCode: string) => {
    const cleaned = zipCode.trim().replace(/\D/g, '').slice(0, 5);
    if (cleaned.length < 5) return;

    setZip(cleaned);
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const res = await fetch(`${getApiBaseUrl()}/lookup/${cleaned}`);
      if (res.status === 404) {
        setError('No data found for this zip code. Please check and try again.');
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: LookupResponse = await res.json();
      setData(json);
    } catch {
      setError('Unable to load data. Please try again.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Auto-search from URL param
  useEffect(() => {
    const urlZip = searchParams.get('zip');
    if (urlZip && urlZip.replace(/\D/g, '').length === 5) {
      setZip(urlZip.replace(/\D/g, '').slice(0, 5));
      doSearch(urlZip);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(zip);
    const url = new URL(window.location.href);
    url.searchParams.set('zip', zip.replace(/\D/g, '').slice(0, 5));
    window.history.replaceState({}, '', url.toString());
  };

  const isValidZip = zip.trim().replace(/\D/g, '').length >= 5;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 1100,
          margin: '0 auto',
          padding: '40px 24px 64px',
        }}
      >
        {/* Nav */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ marginBottom: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Link
            to="/"
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--color-text-2)',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            WeThePeople
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link
              to="/politics"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: 'var(--color-text-3)',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-3)'; }}
            >
              Dashboard
            </Link>
            <Link
              to="/politics/people"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: 'var(--color-text-3)',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-3)'; }}
            >
              All members
            </Link>
          </div>
        </motion.nav>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          style={{ marginBottom: 40, textAlign: 'center' }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 999,
              border: '1px solid var(--color-border)',
              background: 'var(--color-accent-dim)',
              padding: '6px 14px',
              marginBottom: 20,
            }}
          >
            <Shield size={13} style={{ color: 'var(--color-accent-text)' }} />
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-accent-text)',
              }}
            >
              Accountability tool
            </span>
          </div>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(36px, 6vw, 64px)',
              lineHeight: 1.02,
              color: 'var(--color-text-1)',
            }}
          >
            What are your representatives{' '}
            <span style={{ color: 'var(--color-accent-text)' }}>doing</span>?
          </h1>
          <p
            style={{
              marginTop: 16,
              maxWidth: 620,
              marginLeft: 'auto',
              marginRight: 'auto',
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
              color: 'var(--color-text-2)',
              lineHeight: 1.6,
            }}
          >
            Enter your zip code to see trades, donors, committee conflicts, voting records, and anomalies for every representative in your state.
          </p>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          style={{ marginBottom: 48 }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              gap: 12,
              maxWidth: 560,
              margin: '0 auto',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
              <MapPin
                size={17}
                style={{
                  position: 'absolute',
                  left: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-accent-text)',
                  opacity: 0.5,
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="Enter your zip code"
                maxLength={10}
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  padding: '16px 18px 16px 46px',
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 18,
                  letterSpacing: '0.1em',
                  color: 'var(--color-text-1)',
                  outline: 'none',
                  transition: 'border-color 150ms, box-shadow 150ms',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(197,160,40,0.12)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
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
                padding: '14px 28px',
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 0',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '2px solid var(--color-accent)',
                borderTopColor: 'transparent',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-3)' }}>
              Looking up your representatives...
            </p>
          </div>
        )}

        {/* Error */}
        {!loading && searched && error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              borderRadius: 12,
              border: '1px solid rgba(230,57,70,0.25)',
              background: 'rgba(230,57,70,0.08)',
              padding: '40px 24px',
              textAlign: 'center',
              maxWidth: 560,
              margin: '0 auto',
            }}
          >
            <AlertCircle size={36} style={{ color: 'rgba(230,57,70,0.5)', margin: '0 auto 14px' }} />
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--color-red)' }}>
              {error}
            </p>
          </motion.div>
        )}

        {/* Results */}
        {!loading && data && data.representatives.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
            {/* State header */}
            <div style={{ marginBottom: 28, textAlign: 'center' }}>
              <p
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 11,
                  color: 'var(--color-text-3)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                {data.representative_count} representative{data.representative_count !== 1 ? 's' : ''} found
              </p>
              <h2
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontStyle: 'italic',
                  fontWeight: 900,
                  fontSize: 'clamp(24px, 3.5vw, 36px)',
                  color: 'var(--color-text-1)',
                }}
              >
                {STATE_NAMES[data.state] || data.state}
              </h2>
              <p
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 11,
                  color: 'var(--color-text-3)',
                  marginTop: 4,
                }}
              >
                Zip code {data.zip_code}
              </p>
            </div>

            <div
              style={{
                marginBottom: 20,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-accent-dim)',
                padding: '12px 16px',
                maxWidth: 720,
                margin: '0 auto 20px',
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
                <span style={{ fontWeight: 600, color: 'var(--color-text-1)' }}>State-level lookup</span> — Showing all senators and House members for your state. District-level matching is coming soon.
              </p>
            </div>

            {/* Rep cards */}
            <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {data.representatives.map((rep, idx) => (
                <motion.div
                  key={rep.person_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.06 }}
                >
                  <RepCard rep={rep} zip={data.zip_code} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* No results */}
        {!loading && searched && data && data.representatives.length === 0 && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              padding: '60px 24px',
              textAlign: 'center',
              maxWidth: 560,
              margin: '0 auto',
            }}
          >
            <Users size={36} style={{ color: 'var(--color-text-3)', margin: '0 auto 14px' }} />
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--color-text-2)' }}>
              No tracked representatives found for {STATE_NAMES[data.state] || data.state}.
            </p>
            <Link
              to="/politics/people"
              style={{
                marginTop: 16,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 10,
                background: 'var(--color-accent-dim)',
                border: '1px solid var(--color-border)',
                padding: '10px 18px',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-accent-text)',
                textDecoration: 'none',
              }}
            >
              <Users size={14} />
              Browse all members
            </Link>
          </motion.div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 72,
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

function RepCard({ rep, zip }: { rep: Representative; zip: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hex = partyHex(rep.party);
  const token = partyToken(rep.party);
  const flags = totalRedFlags(rep.red_flags);

  React.useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/lookup?zip=${zip}`;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '18px 20px',
          cursor: 'pointer',
          transition: 'background-color 150ms',
          flexWrap: 'wrap',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Photo */}
        {rep.photo_url ? (
          <img
            src={rep.photo_url}
            alt={rep.name}
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid var(--color-border-hover)',
              flexShrink: 0,
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
              background: `${hex}26`,
              border: '2px solid var(--color-border-hover)',
              flexShrink: 0,
            }}
          >
            {initials(rep.name)}
          </div>
        )}

        {/* Info */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 17,
                fontWeight: 600,
                color: 'var(--color-text-1)',
              }}
            >
              {rep.name}
            </h3>
            <span
              style={{
                borderRadius: 999,
                padding: '3px 10px',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                background: `${hex}1F`,
                color: token,
              }}
            >
              {rep.party}
            </span>
            <span
              style={{
                borderRadius: 999,
                background: 'var(--color-surface-2)',
                padding: '3px 10px',
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
          </div>
          <p
            style={{
              marginTop: 4,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 11,
              color: 'var(--color-text-3)',
            }}
          >
            {rep.state} &middot; {rep.chamber === 'senate' ? 'U.S. Senate' : 'U.S. House'}
          </p>
        </div>

        {/* Red flags badge */}
        {flags > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-accent-dim)',
              padding: '6px 12px',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={13} style={{ color: 'var(--color-accent-text)' }} />
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--color-accent-text)',
              }}
            >
              {flags}
            </span>
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                color: 'var(--color-accent-text)',
                opacity: 0.7,
              }}
            >
              flag{flags !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Quick stats */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}
          className="hidden md:flex"
        >
          {rep.trades.length > 0 && <QuickStat value={rep.trades.length} label="trades" />}
          {rep.donors.length > 0 && <QuickStat value={rep.donors.length} label="donors" />}
          {rep.committees.length > 0 && <QuickStat value={rep.committees.length} label="committees" />}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={handleShare}
            style={{
              padding: 8,
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text-3)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 150ms',
            }}
            title="Copy share link"
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-1)';
              e.currentTarget.style.borderColor = 'var(--color-border-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-3)';
              e.currentTarget.style.borderColor = 'var(--color-border)';
            }}
          >
            <Share2 size={13} />
          </button>
          {copied && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 10,
                color: 'var(--color-accent-text)',
              }}
            >
              Copied!
            </span>
          )}
          {expanded ? (
            <ChevronUp size={18} style={{ color: 'var(--color-text-3)' }} />
          ) : (
            <ChevronDown size={18} style={{ color: 'var(--color-text-3)' }} />
          )}
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                borderTop: '1px solid var(--color-border)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
              }}
            >
              {/* Red Flags */}
              {flags > 0 && (
                <Section title="Red flags" icon={<AlertTriangle size={14} style={{ color: 'var(--color-accent-text)' }} />}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {rep.red_flags.anomaly_count > 0 && (
                      <FlagPill label="Anomalies detected" count={rep.red_flags.anomaly_count} />
                    )}
                    {rep.red_flags.late_disclosures > 0 && (
                      <FlagPill label="Late trade disclosures" count={rep.red_flags.late_disclosures} />
                    )}
                    {rep.red_flags.committee_stock_overlaps > 0 && (
                      <FlagPill label="Committee-stock overlaps" count={rep.red_flags.committee_stock_overlaps} />
                    )}
                  </div>
                  {rep.red_flags.top_anomaly && (
                    <div
                      style={{
                        marginTop: 12,
                        borderRadius: 10,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-accent-dim)',
                        padding: '12px 14px',
                      }}
                    >
                      <p
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 12,
                          color: 'var(--color-accent-text)',
                          lineHeight: 1.55,
                        }}
                      >
                        {rep.red_flags.top_anomaly.title}
                      </p>
                      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 10,
                            color: 'var(--color-accent-text)',
                            opacity: 0.7,
                          }}
                        >
                          Score: {rep.red_flags.top_anomaly.score.toFixed(1)}/10
                        </span>
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 10,
                            color: 'var(--color-text-3)',
                          }}
                        >
                          {rep.red_flags.top_anomaly.pattern_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* Recent Trades */}
              <Section title="Recent trades" icon={<TrendingUp size={14} style={{ color: 'var(--color-green)' }} />}>
                {rep.trades.length === 0 ? (
                  <EmptyState text="No recent trades in the last 90 days" />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rep.trades.map((t, i) => {
                      const type = t.transaction_type?.toLowerCase() || '';
                      const isBuy = type.includes('purchase');
                      const isSell = type.includes('sale');
                      const typeColor = isBuy
                        ? 'var(--color-green)'
                        : isSell
                        ? 'var(--color-red)'
                        : 'var(--color-text-3)';
                      return (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            borderRadius: 10,
                            background: 'var(--color-surface-2)',
                            padding: '10px 14px',
                          }}
                        >
                          {tradeIcon(t.transaction_type)}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: 'var(--color-text-1)',
                                }}
                              >
                                {t.ticker || 'N/A'}
                              </span>
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  color: typeColor,
                                }}
                              >
                                {t.transaction_type}
                              </span>
                            </div>
                            {t.asset_name && t.asset_name !== t.ticker && (
                              <p
                                style={{
                                  fontFamily: "'Inter', sans-serif",
                                  fontSize: 10,
                                  color: 'var(--color-text-3)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {t.asset_name}
                              </p>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p
                              style={{
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: 12,
                                color: 'var(--color-text-2)',
                              }}
                            >
                              {t.amount_range || '--'}
                            </p>
                            <p
                              style={{
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: 10,
                                color: 'var(--color-text-3)',
                              }}
                            >
                              {formatDate(t.transaction_date)}
                            </p>
                          </div>
                          {t.reporting_gap && (
                            <div
                              style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                              title={`Reporting gap: ${t.reporting_gap}`}
                            >
                              <Clock size={10} style={{ color: 'var(--color-text-3)' }} />
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                  fontSize: 10,
                                  color: parseInt(t.reporting_gap) > 45 ? 'var(--color-accent-text)' : 'var(--color-text-3)',
                                }}
                              >
                                {t.reporting_gap}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* Top Donors */}
              <Section title="Top donors" icon={<DollarSign size={14} style={{ color: 'var(--color-dem)' }} />}>
                {rep.donors.length === 0 ? (
                  <EmptyState text="No donor data available" />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rep.donors.map((d, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          borderRadius: 10,
                          background: 'var(--color-surface-2)',
                          padding: '10px 14px',
                        }}
                      >
                        <Building2 size={14} style={{ color: 'var(--color-dem)', opacity: 0.5, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontSize: 13,
                              fontWeight: 500,
                              color: 'var(--color-text-1)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {d.pac_name || d.entity_id}
                          </p>
                          <p
                            style={{
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 10,
                              color: 'var(--color-text-3)',
                            }}
                          >
                            {d.entity_type} &middot; {d.donation_count} contribution{d.donation_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 13,
                            fontWeight: 700,
                            color: 'var(--color-dem)',
                            flexShrink: 0,
                          }}
                        >
                          {formatCurrency(d.total_amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Committees */}
              <Section title="Committees" icon={<Users size={14} style={{ color: 'var(--color-ind)' }} />}>
                {rep.committees.length === 0 ? (
                  <EmptyState text="No committee data available" />
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {rep.committees.map((c, i) => (
                      <div
                        key={i}
                        style={{
                          borderRadius: 10,
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface-2)',
                          padding: '10px 14px',
                        }}
                      >
                        <p
                          style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 12,
                            color: 'var(--color-text-1)',
                          }}
                        >
                          {c.committee_name}
                        </p>
                        <p
                          style={{
                            marginTop: 2,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 10,
                            color: 'var(--color-text-3)',
                          }}
                        >
                          {c.role !== 'member' ? `${c.role.replace(/_/g, ' ')} · ` : ''}
                          {c.committee_chamber}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Recent Votes */}
              <Section title="Recent votes" icon={<Vote size={14} style={{ color: 'var(--color-dem)' }} />}>
                {rep.votes.length === 0 ? (
                  <EmptyState text="No recent votes in the last 90 days" />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rep.votes.map((v, i) => {
                      const pos = v.position?.toLowerCase() || '';
                      const posColor =
                        pos === 'yea' || pos === 'yes'
                          ? 'var(--color-green)'
                          : pos === 'nay' || pos === 'no'
                          ? 'var(--color-red)'
                          : 'var(--color-text-3)';
                      return (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            borderRadius: 10,
                            background: 'var(--color-surface-2)',
                            padding: '10px 14px',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                fontFamily: "'Inter', sans-serif",
                                fontSize: 12,
                                color: 'var(--color-text-1)',
                                lineHeight: 1.5,
                              }}
                            >
                              {v.question}
                            </p>
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {v.related_bill && (
                                <span
                                  style={{
                                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                    fontSize: 10,
                                    color: 'var(--color-dem)',
                                  }}
                                >
                                  {v.related_bill}
                                </span>
                              )}
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                  fontSize: 10,
                                  color: 'var(--color-text-3)',
                                }}
                              >
                                {formatDate(v.vote_date)}
                              </span>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span
                              style={{
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: 12,
                                fontWeight: 700,
                                color: posColor,
                              }}
                            >
                              {v.position || '--'}
                            </span>
                            {v.result && (
                              <p
                                style={{
                                  marginTop: 2,
                                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                  fontSize: 10,
                                  color: 'var(--color-text-3)',
                                }}
                              >
                                {v.result}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* Profile link */}
              <div
                style={{
                  paddingTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <Link
                  to={`/politics/people/${rep.person_id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 10,
                    background: 'var(--color-accent-dim)',
                    border: '1px solid var(--color-border)',
                    padding: '8px 14px',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--color-accent-text)',
                    textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={12} />
                  Full profile
                </Link>
                <Link
                  to={`/politics/states/${rep.state.toLowerCase()}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12,
                    color: 'var(--color-text-2)',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
                >
                  <MapPin size={12} />
                  {rep.state} state page
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ──

function QuickStat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p
        style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--color-text-1)',
        }}
      >
        {value}
      </p>
      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          color: 'var(--color-text-3)',
        }}
      >
        {label}
      </p>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {icon}
        <h4
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-1)',
          }}
        >
          {title}
        </h4>
      </div>
      {children}
    </div>
  );
}

function FlagPill({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        background: 'var(--color-accent-dim)',
        padding: '10px 14px',
      }}
    >
      <span
        style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--color-accent-text)',
        }}
      >
        {count}
      </span>
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          color: 'var(--color-accent-text)',
          opacity: 0.7,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface-2)',
        padding: '16px',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          color: 'var(--color-text-3)',
        }}
      >
        {text}
      </p>
    </div>
  );
}
