import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  FileText,
  Shield,
  Users,
  TrendingUp,
  Map,
  Share2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import {
  fetchInfluenceStats,
  fetchTopLobbying,
  fetchTopContracts,
  type InfluenceStats,
  type InfluenceLeader,
} from '../api/influence';

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────────
// Token maps
// ─────────────────────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  finance: 'var(--color-green)',
  health: 'var(--color-red)',
  tech: 'var(--color-ind)',
  technology: 'var(--color-ind)',
  energy: 'var(--color-accent)',
  transportation: 'var(--color-dem)',
  defense: 'var(--color-rep)',
  chemicals: 'var(--color-verify)',
  agriculture: 'var(--color-green)',
  telecom: 'var(--color-dem)',
  telecommunications: 'var(--color-dem)',
  education: 'var(--color-ind)',
};

const SECTOR_LABELS: Record<string, string> = {
  finance: 'Finance',
  health: 'Health',
  tech: 'Technology',
  technology: 'Technology',
  energy: 'Energy',
  transportation: 'Transportation',
  defense: 'Defense',
  chemicals: 'Chemicals',
  agriculture: 'Agriculture',
  telecom: 'Telecom',
  telecommunications: 'Telecom',
  education: 'Education',
};

const SECTOR_ROUTES: Record<string, string> = {
  finance: '/finance',
  health: '/health',
  tech: '/technology',
  technology: '/technology',
  energy: '/energy',
  transportation: '/transportation',
  defense: '/defense',
  chemicals: '/chemicals',
  agriculture: '/agriculture',
  telecom: '/telecom',
  telecommunications: '/telecom',
  education: '/education',
};

const SECTOR_ENTITY_ROUTES: Record<string, string> = SECTOR_ROUTES;

// Tool grid cards — per design handoff
const TOOL_CARDS: Array<{
  to: string;
  title: string;
  sub: string;
  token: string;
  hex: string;
  icon: typeof Share2;
}> = [
  {
    to: '/influence/network',
    title: 'Influence Network',
    sub: 'Force-directed graph of connections between politicians, companies, and legislation.',
    token: 'var(--color-dem)',
    hex: '#4A7FDE',
    icon: Share2,
  },
  {
    to: '/influence/money-flow',
    title: 'Money Flow Sankey',
    sub: 'Follow dollars from corporations through lobbying and PAC donations to politicians.',
    token: 'var(--color-green)',
    hex: '#3DB87A',
    icon: DollarSign,
  },
  {
    to: '/influence/map',
    title: 'Spending Map',
    sub: 'Geographic heatmap of lobbying, donations, and political connections by US state.',
    token: 'var(--color-accent)',
    hex: '#C5A028',
    icon: Map,
  },
  {
    to: '/influence/timeline',
    title: 'Influence Timeline',
    sub: 'Chronological view of lobbying, trades, donations, and legislation for any entity.',
    token: 'var(--color-ind)',
    hex: '#B06FD8',
    icon: Users,
  },
  {
    to: '/influence/anomalies',
    title: 'Suspicious Patterns',
    sub: 'Automatically detected anomalies: trades near votes, lobbying spikes, and enforcement gaps.',
    token: 'var(--color-red)',
    hex: '#E63946',
    icon: AlertTriangle,
  },
  {
    to: '/influence/story',
    title: 'Data Story',
    sub: 'Animated walkthrough of corporate influence — spend, contracts, and enforcement gaps.',
    token: 'var(--color-verify)',
    hex: '#2EC4B6',
    icon: TrendingUp,
  },
];

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function EyebrowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--color-accent-text)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--color-text-3)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  color: string;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={14} style={{ color }} />
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-text-3)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 32,
          fontWeight: 700,
          color,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: (typeof TOOL_CARDS)[number] }) {
  const { to, title, sub, token, icon: Icon } = tool;
  return (
    <Link
      to={to}
      style={{
        display: 'block',
        padding: '18px 20px',
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'border-color 0.18s ease, transform 0.18s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-hover)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ width: 28, height: 3, borderRadius: 2, background: token, marginBottom: 12 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <Icon size={14} style={{ color: token }} />
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--color-text-1)',
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          fontWeight: 400,
          color: 'var(--color-text-3)',
          lineHeight: 1.5,
        }}
      >
        {sub}
      </div>
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: token,
          marginTop: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        Explore <ArrowRight size={11} />
      </div>
    </Link>
  );
}

function SectorTableRow({
  sector,
  data,
  maxLobbying,
  maxContracts,
  isLast,
}: {
  sector: string;
  data: { lobbying: number; contracts: number; enforcement: number };
  maxLobbying: number;
  maxContracts: number;
  isLast: boolean;
}) {
  const label = SECTOR_LABELS[sector] || sector.charAt(0).toUpperCase() + sector.slice(1);
  const sectorColor = SECTOR_COLORS[sector] || 'var(--color-text-3)';
  const lobbyingPct = maxLobbying > 0 ? (data.lobbying / maxLobbying) * 100 : 0;
  const contractsPct = maxContracts > 0 ? (data.contracts / maxContracts) * 100 : 0;

  return (
    <Link
      to={SECTOR_ROUTES[sector] || '/'}
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr 1fr 80px',
        gap: 0,
        padding: '14px 20px',
        borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
        alignItems: 'center',
        textDecoration: 'none',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          fontWeight: 600,
          color: sectorColor,
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 16 }}>
        <div style={{ flex: 1, maxWidth: 160 }}>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: 'var(--color-green)',
              width: `${Math.max(lobbyingPct, 2)}%`,
              transition: 'width 0.6s ease',
            }}
          />
        </div>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-green)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatMoney(data.lobbying)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 16 }}>
        <div style={{ flex: 1, maxWidth: 160 }}>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: 'var(--color-dem)',
              width: `${Math.max(contractsPct, 2)}%`,
              transition: 'width 0.6s ease',
            }}
          />
        </div>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-dem)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatMoney(data.contracts)}
        </span>
      </div>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          color: 'var(--color-red)',
          textAlign: 'right',
        }}
      >
        {data.enforcement.toLocaleString()}
      </span>
    </Link>
  );
}

function LeaderRow({
  leader,
  rank,
  metric,
}: {
  leader: InfluenceLeader;
  rank: number;
  metric: 'lobbying' | 'contracts';
}) {
  const value = metric === 'lobbying' ? leader.total_lobbying : leader.total_contracts;
  const route = `${SECTOR_ENTITY_ROUTES[leader.sector] || '/'}/${leader.entity_id}`;
  const sectorColor = SECTOR_COLORS[leader.sector] || 'var(--color-text-3)';
  const valueColor = metric === 'lobbying' ? 'var(--color-green)' : 'var(--color-dem)';

  return (
    <Link
      to={route}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderRadius: 8,
        textDecoration: 'none',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: 'var(--color-text-3)',
            width: 24,
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          {rank}.
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--color-text-1)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {leader.display_name}
          </div>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              color: sectorColor,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginTop: 2,
            }}
          >
            {SECTOR_LABELS[leader.sector] || leader.sector}
          </div>
        </div>
      </div>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          fontWeight: 600,
          color: valueColor,
          flexShrink: 0,
        }}
      >
        {formatMoney(value || 0)}
      </span>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function InfluenceExplorerPage() {
  const [stats, setStats] = useState<InfluenceStats | null>(null);
  const [topLobbying, setTopLobbying] = useState<InfluenceLeader[]>([]);
  const [topContracts, setTopContracts] = useState<InfluenceLeader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchInfluenceStats(),
      fetchTopLobbying(20),
      fetchTopContracts(20),
    ])
      .then(([s, l, c]) => {
        if (cancelled) return;
        setStats(s);
        setTopLobbying(l.leaders);
        setTopContracts(c.leaders);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const sectorEntries = stats ? Object.entries(stats.by_sector) : [];
  const maxLobbying = Math.max(1, ...sectorEntries.map(([, d]) => d.lobbying || 0));
  const maxContracts = Math.max(1, ...sectorEntries.map(([, d]) => d.contracts || 0));

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text-1)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 40px 64px' }}>
        {/* Back link */}
        <Link
          to="/"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: 'var(--color-text-3)',
            marginBottom: 20,
            display: 'inline-block',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-3)'; }}
        >
          ← Back to sectors
        </Link>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <EyebrowLabel>Cross-Sector Analysis</EyebrowLabel>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(32px, 5vw, 48px)',
              color: 'var(--color-text-1)',
              margin: '0 0 10px 0',
              letterSpacing: '-0.01em',
              lineHeight: 1.05,
            }}
          >
            Influence Explorer
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
              color: 'var(--color-text-2)',
              maxWidth: 560,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Cross-sector view of how industries shape politics — lobbying, government contracts, enforcement
            gaps, and political connections.
          </p>
        </div>

        {/* Aggregate Stats */}
        {stats && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
              marginBottom: 40,
            }}
          >
            <StatCard
              label="Total Lobbying"
              value={formatMoney(stats.total_lobbying_spend)}
              icon={DollarSign}
              color="var(--color-green)"
            />
            <StatCard
              label="Gov Contracts"
              value={formatMoney(stats.total_contract_value)}
              icon={FileText}
              color="var(--color-dem)"
            />
            <StatCard
              label="Enforcement Actions"
              value={stats.total_enforcement_actions.toLocaleString()}
              icon={Shield}
              color="var(--color-red)"
            />
            <StatCard
              label="Politicians Tracked"
              value={stats.politicians_connected.toLocaleString()}
              icon={Users}
              color="var(--color-accent)"
            />
          </div>
        )}

        {/* Tools Grid */}
        <div style={{ marginBottom: 40 }}>
          <SectionLabel>Analysis Tools</SectionLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 10,
            }}
          >
            {TOOL_CARDS.map((tool) => <ToolCard key={tool.to} tool={tool} />)}
          </div>
        </div>

        {/* Sector Breakdown Table */}
        {stats && sectorEntries.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <SectionLabel>By Sector</SectionLabel>
            <div
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {/* Header row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr 1fr 80px',
                  gap: 0,
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                {['Sector', 'Lobbying', 'Contracts', 'Actions'].map((h, idx) => (
                  <span
                    key={h}
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--color-text-3)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      textAlign: idx === 3 ? 'right' : 'left',
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {sectorEntries.map(([sector, data], i) => (
                <SectorTableRow
                  key={sector}
                  sector={sector}
                  data={data}
                  maxLobbying={maxLobbying}
                  maxContracts={maxContracts}
                  isLast={i === sectorEntries.length - 1}
                />
              ))}
            </div>
          </div>
        )}

        {/* Leaderboards */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div
              style={{
                height: 32,
                width: 32,
                borderRadius: '50%',
                border: '2px solid var(--color-border)',
                borderTopColor: 'var(--color-accent)',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 32,
            }}
          >
            {/* Top Lobbying */}
            <div>
              <SectionLabel>Top Lobbying Spenders</SectionLabel>
              {topLobbying.length > 0 ? (
                <div
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  {topLobbying.map((l, i) => (
                    <LeaderRow key={l.entity_id} leader={l} rank={i + 1} metric="lobbying" />
                  ))}
                </div>
              ) : (
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    color: 'var(--color-text-3)',
                    margin: 0,
                  }}
                >
                  No lobbying data yet. Run sync jobs to populate.
                </p>
              )}
            </div>

            {/* Top Contracts */}
            <div>
              <SectionLabel>Top Gov Contract Recipients</SectionLabel>
              {topContracts.length > 0 ? (
                <div
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  {topContracts.map((l, i) => (
                    <LeaderRow key={l.entity_id} leader={l} rank={i + 1} metric="contracts" />
                  ))}
                </div>
              ) : (
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    color: 'var(--color-text-3)',
                    margin: 0,
                  }}
                >
                  No contract data yet. Run sync jobs to populate.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
