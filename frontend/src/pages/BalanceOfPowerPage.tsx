import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Scale, Activity, FileText, ArrowLeft } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { apiClient } from '../api/client';
import type { DashboardStats } from '../api/types';
import { PoliticsSectorHeader } from '../components/SectorHeader';

// ── Helpers ──

interface ChamberBreakdown {
  total: number;
  democrat: number;
  republican: number;
  independent: number;
}

function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

// Design-system party hexes (parallel to tokens; needed for alpha interpolation)
const PARTY_HEX = {
  dem: '#4A7FDE',
  rep: '#E05555',
  ind: '#B06FD8',
} as const;

const PARTY_TOKEN = {
  dem: 'var(--color-dem)',
  rep: 'var(--color-rep)',
  ind: 'var(--color-ind)',
} as const;

// ── Styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: 1200,
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

// ── Bar Chart Component ──

function PartyBar({ label, breakdown }: { label: string; breakdown: ChamberBreakdown }) {
  const majority = Math.ceil(breakdown.total / 2) + 1;
  const dPct = pct(breakdown.democrat, breakdown.total);
  const rPct = pct(breakdown.republican, breakdown.total);
  const iPct = pct(breakdown.independent, breakdown.total);
  const leading =
    breakdown.democrat > breakdown.republican
      ? 'D'
      : breakdown.republican > breakdown.democrat
        ? 'R'
        : 'Tied';

  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        padding: 28,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <h3
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 22,
            color: 'var(--color-text-1)',
          }}
        >
          {label}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 11,
              color: 'var(--color-text-3)',
            }}
          >
            {breakdown.total} seats
          </span>
          <span style={{ color: 'var(--color-border-hover)' }}>|</span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 11,
              color: 'var(--color-text-3)',
            }}
          >
            {majority} for majority
          </span>
        </div>
      </div>

      {/* Stacked horizontal bar */}
      <div
        style={{
          display: 'flex',
          height: 48,
          overflow: 'hidden',
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        {breakdown.democrat > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: `${dPct}%`,
              background: PARTY_TOKEN.dem,
              transition: 'width 500ms',
            }}
          >
            {dPct > 12 && (
              <span
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                {breakdown.democrat}
              </span>
            )}
          </div>
        )}
        {breakdown.independent > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: `${iPct}%`,
              background: PARTY_TOKEN.ind,
              transition: 'width 500ms',
            }}
          >
            {iPct > 5 && (
              <span
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                {breakdown.independent}
              </span>
            )}
          </div>
        )}
        {breakdown.republican > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: `${rPct}%`,
              background: PARTY_TOKEN.rep,
              transition: 'width 500ms',
            }}
          >
            {rPct > 12 && (
              <span
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                {breakdown.republican}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Majority line indicator */}
      <div
        style={{
          position: 'relative',
          height: 4,
          borderRadius: 999,
          background: 'var(--color-surface-2)',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -4,
            left: '50%',
            height: 12,
            width: 1,
            background: 'var(--color-text-3)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 9,
            color: 'var(--color-text-3)',
            letterSpacing: '0.1em',
          }}
        >
          MAJORITY
        </span>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
          marginTop: 24,
        }}
      >
        <LegendSwatch color={PARTY_TOKEN.dem} label="Democrat" count={breakdown.democrat} pct={dPct} />
        <LegendSwatch color={PARTY_TOKEN.rep} label="Republican" count={breakdown.republican} pct={rPct} />
        {breakdown.independent > 0 && (
          <LegendSwatch
            color={PARTY_TOKEN.ind}
            label="Independent"
            count={breakdown.independent}
            pct={iPct}
          />
        )}
        <span
          style={{
            marginLeft: 'auto',
            borderRadius: 999,
            padding: '6px 12px',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.05em',
            background:
              leading === 'D'
                ? `${PARTY_HEX.dem}26`
                : leading === 'R'
                  ? `${PARTY_HEX.rep}26`
                  : 'var(--color-surface-2)',
            color:
              leading === 'D'
                ? PARTY_TOKEN.dem
                : leading === 'R'
                  ? PARTY_TOKEN.rep
                  : 'var(--color-text-2)',
          }}
        >
          {leading === 'D' ? 'DEM MAJORITY' : leading === 'R' ? 'GOP MAJORITY' : 'SPLIT'}
        </span>
      </div>
    </div>
  );
}

function LegendSwatch({
  color,
  label,
  count,
  pct,
}: {
  color: string;
  label: string;
  count: number;
  pct: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ height: 12, width: 12, borderRadius: 3, background: color }} />
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          color: 'var(--color-text-2)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--color-text-1)',
        }}
      >
        {count}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 10,
          color: 'var(--color-text-3)',
        }}
      >
        ({pct.toFixed(1)}%)
      </span>
    </div>
  );
}

// ── Page ──

export default function BalanceOfPowerPage() {
  const [house, setHouse] = useState<ChamberBreakdown>({
    total: 0,
    democrat: 0,
    republican: 0,
    independent: 0,
  });
  const [senate, setSenate] = useState<ChamberBreakdown>({
    total: 0,
    democrat: 0,
    republican: 0,
    independent: 0,
  });
  const [total, setTotal] = useState<ChamberBreakdown>({
    total: 0,
    democrat: 0,
    republican: 0,
    independent: 0,
  });
  const [, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const headerRef = React.useRef<HTMLDivElement>(null);
  useInView(headerRef, { once: true, amount: 0.1 });

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiClient.getBalanceOfPower(), apiClient.getDashboardStats()])
      .then(([bop, sRes]) => {
        if (cancelled) return;
        setHouse(bop.house);
        setSenate(bop.senate);
        setTotal(bop.total);
        setStats(sRes);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

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

  const congressNum = Math.floor((new Date().getFullYear() - 1789) / 2) + 1;

  return (
    <div style={pageShell}>
      <div style={contentWrap}>
        {/* Header */}
        <motion.div
          ref={headerRef}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ marginBottom: 40 }}
        >
          <div style={{ marginBottom: 24 }}>
            <PoliticsSectorHeader />
          </div>
          <div style={eyebrowStyle}>
            <Scale size={12} style={{ color: 'var(--color-accent-text)' }} />
            {congressNum}th Congress
          </div>
          <h1 style={titleStyle}>
            Balance of <span style={{ color: 'var(--color-accent-text)' }}>power</span>
          </h1>
          <p style={leadStyle}>
            Party composition across the {congressNum}th Congress, broken down by chamber.
          </p>
        </motion.div>

        {/* Overall stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            marginBottom: 40,
          }}
        >
          {[
            { label: 'Total members', value: total.total.toString(), token: 'var(--color-accent-text)', party: null },
            { label: 'Democrats', value: total.democrat.toString(), token: PARTY_TOKEN.dem, party: 'Democratic' },
            { label: 'Republicans', value: total.republican.toString(), token: PARTY_TOKEN.rep, party: 'Republican' },
            { label: 'Independent', value: total.independent.toString(), token: PARTY_TOKEN.ind, party: 'Independent' },
          ].map((stat, idx) => (
            <motion.button
              key={stat.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 + idx * 0.08 }}
              onClick={() =>
                navigate(stat.party ? `/politics/people?party=${stat.party}` : '/politics/people')
              }
              style={{
                textAlign: 'left',
                borderRadius: 14,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                padding: 20,
                cursor: 'pointer',
                transition: 'border-color 150ms, background 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent)';
                e.currentTarget.style.background = 'var(--color-surface-2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.background = 'var(--color-surface)';
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={statLabelStyle}>{stat.label}</span>
                <Scale size={14} style={{ color: stat.token, opacity: 0.7 }} />
              </div>
              <div style={{ ...statValueStyle, color: stat.token }}>{stat.value}</div>
            </motion.button>
          ))}
        </div>

        {/* Chamber breakdowns */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <PartyBar label="House of Representatives" breakdown={house} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <PartyBar label="Senate" breakdown={senate} />
          </motion.div>
        </div>

        {/* Quick Links */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {[
            { to: '/politics/people', label: 'Browse all members', desc: 'Full directory with search and filters', Icon: Users },
            { to: '/politics/activity', label: 'Activity feed', desc: 'Latest legislative actions and votes', Icon: Activity },
            { to: '/politics/compare', label: 'Compare members', desc: 'Side-by-side accountability analysis', Icon: FileText },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              style={{ textDecoration: 'none' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  borderRadius: 14,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  padding: 20,
                  transition: 'border-color 150ms, background 150ms',
                  height: '100%',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                  e.currentTarget.style.background = 'var(--color-surface-2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.background = 'var(--color-surface)';
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'var(--color-accent-dim)',
                    flexShrink: 0,
                  }}
                >
                  <link.Icon size={18} style={{ color: 'var(--color-accent-text)' }} />
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--color-text-1)',
                      marginBottom: 4,
                    }}
                  >
                    {link.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12,
                      color: 'var(--color-text-3)',
                      lineHeight: 1.5,
                    }}
                  >
                    {link.desc}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </motion.div>

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
            Dashboard
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
