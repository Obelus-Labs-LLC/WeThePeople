import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, DollarSign, Users, Briefcase } from 'lucide-react';
import ChoroplethMap from '../components/ChoroplethMap';
import {
  fetchSpendingByState,
  type SpendingMetric,
  type SectorFilter,
  type StateSpendingData,
} from '../api/influence';
import { fmtMoney as formatMoney } from '../utils/format';

// ── Helpers ──

function formatTotal(value: number, metric: SpendingMetric): string {
  if (metric === 'members') return value.toLocaleString();
  return formatMoney(value);
}

// ── Metric / Sector configs ──

const METRICS: {
  key: SpendingMetric;
  label: string;
  icon: typeof DollarSign;
  description: string;
  token: string;
  hex: string;
}[] = [
  {
    key: 'donations',
    label: 'Donations',
    icon: DollarSign,
    description: 'PAC & corporate donations flowing to politicians by state',
    token: 'var(--color-accent-text)',
    hex: '#C5A028',
  },
  {
    key: 'lobbying',
    label: 'Lobbying',
    icon: Briefcase,
    description: 'Lobbying spend attributed to each state via political donations',
    token: 'var(--color-green)',
    hex: '#3DB87A',
  },
  {
    key: 'members',
    label: 'Members',
    icon: Users,
    description: 'Tracked members of Congress per state',
    token: 'var(--color-dem)',
    hex: '#4A7FDE',
  },
];

// All 11 sectors, kept in sync with SECTORS in src/data/sectors.ts and the
// SectorFilter type union in src/api/influence.ts.
const SECTORS: { key: SectorFilter | 'all'; label: string; hex: string }[] = [
  { key: 'all',            label: 'All Sectors',    hex: '#C5A028' },
  { key: 'finance',        label: 'Finance',        hex: '#3DB87A' },
  { key: 'health',         label: 'Health',         hex: '#E63946' },
  { key: 'tech',           label: 'Tech',           hex: '#B06FD8' },
  { key: 'energy',         label: 'Energy',         hex: '#D48B3A' },
  { key: 'transportation', label: 'Transportation', hex: '#0EA5E9' },
  { key: 'defense',        label: 'Defense',        hex: '#475569' },
  { key: 'chemicals',      label: 'Chemicals',      hex: '#84CC16' },
  { key: 'agriculture',    label: 'Agriculture',    hex: '#65A30D' },
  { key: 'telecom',        label: 'Telecom',        hex: '#06B6D4' },
  { key: 'education',      label: 'Education',      hex: '#A855F7' },
];

// ── State name lookup ──

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming', DC: 'District of Columbia',
};

// ── Shared styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '56px 24px 96px',
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 12px',
  borderRadius: '999px',
  background: 'var(--color-accent-dim)',
  color: 'var(--color-accent-text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '20px',
};

const backLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--color-text-2)',
  textDecoration: 'none',
  marginBottom: '20px',
  transition: 'color 0.2s',
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  marginBottom: '8px',
};

const statCard: React.CSSProperties = {
  padding: '20px',
  background: 'var(--color-surface)',
  border: '1px solid rgba(235,229,213,0.08)',
  borderRadius: '14px',
};

const statLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 700,
  color: 'var(--color-text-3)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '8px',
};

const statNumber: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '26px',
  fontWeight: 700,
  lineHeight: 1,
};

// ── Page ──

export default function InfluenceMapPage() {
  const navigate = useNavigate();
  const [metric, setMetric] = useState<SpendingMetric>('donations');
  const [sector, setSector] = useState<SectorFilter | 'all'>('all');
  const [stateData, setStateData] = useState<Record<string, StateSpendingData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const sectorParam = sector === 'all' ? undefined : sector;
    fetchSpendingByState(metric, sectorParam)
      .then((res) => { if (!cancelled) setStateData(res.states); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [metric, sector]);

  const totalValue = Object.values(stateData).reduce((sum, d) => sum + d.value, 0);
  const totalRecords = Object.values(stateData).reduce((sum, d) => sum + d.count, 0);
  const statesWithData = Object.keys(stateData).length;

  const topStates = Object.entries(stateData)
    .sort(([, a], [, b]) => b.value - a.value)
    .slice(0, 10);

  const handleStateClick = useCallback(
    (abbr: string, _name: string) => {
      navigate(`/politics/states/${abbr}`);
    },
    [navigate],
  );

  const currentMetric = METRICS.find((m) => m.key === metric)!;

  return (
    <main id="main-content" style={pageShell}>
      <div style={contentWrap}>
        <Link
          to="/influence"
          style={backLink}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
        >
          <ArrowLeft size={14} /> Influence Explorer
        </Link>

        <span style={eyebrowStyle}>Influence / Geographic Map</span>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(40px, 6vw, 64px)',
            lineHeight: 1.02,
            letterSpacing: '-0.02em',
            margin: '0 0 14px',
            color: 'var(--color-text-1)',
          }}
        >
          Influence <span style={{ color: 'var(--color-accent-text)' }}>map</span>
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '15px',
            lineHeight: 1.65,
            color: 'var(--color-text-2)',
            margin: '0 0 40px',
            maxWidth: '640px',
          }}
        >
          Geographic view of political influence across the United States. See which states
          attract the most lobbying spend, corporate donations, and political attention from
          industry.
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', marginBottom: '24px' }}>
          {/* Metric selector */}
          <div>
            <span style={fieldLabel}>Metric</span>
            <div
              style={{
                display: 'inline-flex',
                gap: '4px',
                padding: '4px',
                background: 'var(--color-surface)',
                border: '1px solid rgba(235,229,213,0.08)',
                borderRadius: '10px',
              }}
            >
              {METRICS.map((m) => {
                const active = metric === m.key;
                const Icon = m.icon;
                return (
                  <button
                    key={m.key}
                    onClick={() => setMetric(m.key)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: active ? `1px solid ${m.hex}33` : '1px solid transparent',
                      background: active ? `${m.hex}1F` : 'transparent',
                      color: active ? m.token : 'var(--color-text-2)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <Icon size={13} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sector filter */}
          <div>
            <span style={fieldLabel}>Sector</span>
            <div
              style={{
                display: 'inline-flex',
                gap: '4px',
                padding: '4px',
                background: 'var(--color-surface)',
                border: '1px solid rgba(235,229,213,0.08)',
                borderRadius: '10px',
              }}
            >
              {SECTORS.map((s) => {
                const active = sector === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSector(s.key)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: active ? `1px solid ${s.hex}33` : '1px solid transparent',
                      background: active ? `${s.hex}1F` : 'transparent',
                      color: active ? 'var(--color-text-1)' : 'var(--color-text-2)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Description */}
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontStyle: 'italic',
            fontSize: '13px',
            color: 'var(--color-text-3)',
            margin: '0 0 28px',
          }}
        >
          {currentMetric.description}
          {sector !== 'all' && ` (${SECTORS.find((s) => s.key === sector)?.label} sector only)`}
        </p>

        {/* Map */}
        <div style={{ marginBottom: '40px' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '500px',
                borderRadius: '16px',
                border: '1px solid rgba(235,229,213,0.08)',
                background: 'var(--color-surface)',
              }}
            >
              <div
                role="status"
                style={{
                  width: '32px',
                  height: '32px',
                  border: '2px solid var(--color-accent)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              >
                <span style={{ position: 'absolute', left: '-9999px' }}>Loading map…</span>
              </div>
            </div>
          ) : error ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '500px',
                borderRadius: '16px',
                border: '1px solid rgba(230,57,70,0.28)',
                background: 'rgba(230,57,70,0.06)',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  color: 'var(--color-red)',
                }}
              >
                Error loading data: {error}
              </p>
            </div>
          ) : (
            <ChoroplethMap data={stateData} metric={metric} onStateClick={handleStateClick} />
          )}
        </div>

        {/* Summary stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            marginBottom: '40px',
          }}
        >
          <div style={statCard}>
            <div style={statLabel}>Total Across All States</div>
            <div style={{ ...statNumber, color: currentMetric.token }}>
              {formatTotal(totalValue, metric)}
            </div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Total Records</div>
            <div style={{ ...statNumber, color: 'var(--color-text-1)' }}>
              {totalRecords.toLocaleString()}
            </div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>States with Data</div>
            <div style={{ ...statNumber, color: 'var(--color-accent-text)' }}>
              {statesWithData}
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--color-text-3)',
                  marginLeft: '4px',
                }}
              >
                / 51
              </span>
            </div>
          </div>
        </div>

        {/* Top States ranking */}
        {topStates.length > 0 && (
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--color-text-2)',
                margin: '0 0 16px',
              }}
            >
              Top 10 States
            </h2>
            <div
              style={{
                padding: '8px',
                background: 'var(--color-surface)',
                border: '1px solid rgba(235,229,213,0.08)',
                borderRadius: '14px',
              }}
            >
              {topStates.map(([abbr, d], i) => {
                const barWidth = topStates[0] ? (d.value / topStates[0][1].value) * 100 : 0;
                return (
                  <div
                    key={abbr}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      transition: 'background 0.15s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(235,229,213,0.03)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    onClick={() => navigate(`/politics/states/${abbr}`)}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        color: 'var(--color-text-3)',
                        width: '24px',
                        textAlign: 'right',
                      }}
                    >
                      {i + 1}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--color-text-1)',
                        width: '140px',
                      }}
                    >
                      {STATE_NAMES[abbr] || abbr}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: '6px',
                        background: 'var(--color-surface-2)',
                        borderRadius: '999px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${barWidth}%`,
                          background: currentMetric.hex,
                          borderRadius: '999px',
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--color-text-1)',
                        width: '112px',
                        textAlign: 'right',
                      }}
                    >
                      {formatTotal(d.value, metric)}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: 'var(--color-text-3)',
                        width: '80px',
                        textAlign: 'right',
                      }}
                    >
                      {d.count.toLocaleString()} rec
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
