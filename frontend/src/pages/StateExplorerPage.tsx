import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Users, FileText, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import { fetchStates } from '../api/state';
import type { StateListEntry } from '../api/state';
import { fmtNum } from '../utils/format';

// ── All 50 states for the full grid ──

const ALL_STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'District of Columbia' },
];

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

const statCardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  padding: 20,
};

const statLabelStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
};

const statValueStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 28,
  fontWeight: 700,
  color: 'var(--color-text-1)',
  letterSpacing: '-0.01em',
  marginTop: 6,
};

// ── Page ──

export default function StateExplorerPage() {
  const [stateData, setStateData] = useState<Record<string, StateListEntry>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchStates()
      .then((data) => {
        if (cancelled) return;
        const map: Record<string, StateListEntry> = {};
        for (const s of data.states) {
          map[s.code] = s;
        }
        setStateData(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const filteredStates = useMemo(() => {
    if (!search.trim()) return ALL_STATES;
    const q = search.toLowerCase();
    return ALL_STATES.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
    );
  }, [search]);

  const totalLegislators = useMemo(
    () => Object.values(stateData).reduce((sum, s) => sum + s.legislators, 0),
    [stateData]
  );
  const totalBills = useMemo(
    () => Object.values(stateData).reduce((sum, s) => sum + s.bills, 0),
    [stateData]
  );
  const statesWithData = Object.keys(stateData).length;

  if (loading) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
    );
  }

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
          style={{ marginBottom: 40 }}
        >
          <div style={eyebrowStyle}>
            <MapPin size={12} style={{ color: 'var(--color-accent-text)' }} />
            State legislatures
          </div>
          <h1 style={titleStyle}>
            Explore by <span style={{ color: 'var(--color-accent-text)' }}>state</span>
          </h1>
          <p style={leadStyle}>
            Browse state-level legislators and legislation across all 50 states. Powered by OpenStates data.
          </p>
        </motion.div>

        {/* Summary stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 32,
          }}
        >
          {[
            { label: 'States with data', value: statesWithData.toString(), Icon: MapPin },
            { label: 'State legislators', value: fmtNum(totalLegislators), Icon: Users },
            { label: 'State bills', value: fmtNum(totalBills), Icon: FileText },
          ].map((stat) => (
            <div key={stat.label} style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={statLabelStyle}>{stat.label}</span>
                <stat.Icon size={14} style={{ color: 'var(--color-accent-text)', opacity: 0.7 }} />
              </div>
              <div style={statValueStyle}>{stat.value}</div>
            </div>
          ))}
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          style={{ marginBottom: 32 }}
        >
          <div style={{ position: 'relative', maxWidth: 420 }}>
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
              placeholder="Search states..."
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
        </motion.div>

        {/* State Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          {filteredStates.map((state, idx) => {
            const data = stateData[state.code];
            const hasData = !!data;

            return (
              <motion.div
                key={state.code}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.015, 0.4) }}
              >
                <Link
                  to={hasData ? `/politics/states/${state.code.toLowerCase()}` : '#'}
                  style={{
                    display: 'block',
                    textDecoration: 'none',
                    pointerEvents: hasData ? 'auto' : 'none',
                    opacity: hasData ? 1 : 0.5,
                  }}
                >
                  <div
                    style={{
                      borderRadius: 12,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      padding: 16,
                      transition: 'border-color 150ms, background 150ms',
                    }}
                    onMouseEnter={(e) => {
                      if (hasData) {
                        e.currentTarget.style.borderColor = 'var(--color-accent)';
                        e.currentTarget.style.background = 'var(--color-surface-2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.background = 'var(--color-surface)';
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontSize: 18,
                        fontWeight: 700,
                        color: 'var(--color-accent-text)',
                        letterSpacing: '0.04em',
                        marginBottom: 6,
                      }}
                    >
                      {state.code}
                    </div>
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        color: hasData ? 'var(--color-text-2)' : 'var(--color-text-3)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {state.name}
                    </div>
                    {hasData ? (
                      <div
                        style={{
                          marginTop: 10,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 10,
                          color: 'var(--color-text-3)',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Users size={10} />
                          {data.legislators}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <FileText size={10} />
                          {data.bills}
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: 10,
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 10,
                          color: 'var(--color-text-3)',
                          opacity: 0.6,
                        }}
                      >
                        No data yet
                      </div>
                    )}
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        {filteredStates.length === 0 && (
          <div
            style={{
              padding: '80px 0',
              textAlign: 'center',
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: 'var(--color-text-3)',
            }}
          >
            No states match your search.
          </div>
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
