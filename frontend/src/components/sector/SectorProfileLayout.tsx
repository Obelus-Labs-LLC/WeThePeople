import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CompanyLogo from '../CompanyLogo';
import SanctionsBadge from '../SanctionsBadge';
import AnomalyBadge from '../AnomalyBadge';
import ShareButton from '../ShareButton';
import WatchlistButton from '../WatchlistButton';
import TrendChart from '../TrendChart';
import { fmtDollar } from '../../utils/format';
import type { SectorConfig } from './sectorConfig';

// ── Public types ──

export interface ProfileDetail {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  sec_cik?: string | null;
  sanctions_status?: string | null;
  ai_profile_summary?: string | null;
  total_contract_value?: number | null;
  enforcement_count?: number;
  lobbying_count?: number;
  filing_count?: number;
}

export interface ProfileStock {
  market_cap?: number | null;
  pe_ratio?: number | null;
  profit_margin?: number | null;
  revenue_ttm?: number | null;
  last_price?: number | null;
}

export interface ProfileStatRow {
  label: string;
  value: string;
  accent?: string;
}

export interface ProfileTab {
  key: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
  render: () => React.ReactNode;
}

// ── Shared styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
  position: 'relative',
};

const decorWrap: React.CSSProperties = {
  pointerEvents: 'none',
  position: 'fixed',
  inset: 0,
  zIndex: 0,
};

// ── Helpers ──

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

// ── Reusable building blocks ──

export function ProfileSection({
  title,
  icon: Icon,
  count,
  accent,
  children,
  action,
}: {
  title: string;
  icon: LucideIcon;
  count?: number;
  accent: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '14px',
          marginBottom: '20px',
          borderBottom: '1px solid rgba(235,229,213,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon size={16} color={accent} />
          <h2
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--color-text-1)',
              margin: 0,
            }}
          >
            {title}
          </h2>
          {count !== undefined && (
            <span
              style={{
                padding: '2px 10px',
                borderRadius: '999px',
                background: 'rgba(235,229,213,0.06)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--color-text-3)',
              }}
            >
              {count.toLocaleString()}
            </span>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ProfileSummaryGrid({
  items,
  accent,
}: {
  items: Array<{ label: string; value: string; accent?: string }>;
  accent: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))`,
        gap: '12px',
        marginBottom: '24px',
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid rgba(235,229,213,0.08)',
            background: 'var(--color-surface)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              margin: '0 0 6px',
            }}
          >
            {item.label}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '22px',
              fontWeight: 700,
              color: item.accent ?? accent,
              margin: 0,
              lineHeight: 1,
            }}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ProfileRecordCard({
  title,
  meta,
  amount,
  amountAccent,
  description,
  url,
  accent,
}: {
  title: string;
  meta?: React.ReactNode;
  amount?: string;
  amountAccent?: string;
  description?: string | null;
  url?: string | null;
  accent: string;
}) {
  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: '12px',
        border: '1px solid rgba(235,229,213,0.08)',
        background: 'var(--color-surface)',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${accent}33`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)';
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '8px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: 'var(--color-text-1)',
            margin: 0,
            flex: 1,
            lineHeight: 1.45,
          }}
        >
          {title}
        </p>
        {amount && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              fontWeight: 700,
              color: amountAccent ?? accent,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {amount}
          </span>
        )}
      </div>
      {description && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            color: 'var(--color-text-3)',
            margin: '0 0 8px',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}
      {(meta || url) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--color-text-3)',
          }}
        >
          {meta}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                color: accent,
                textDecoration: 'none',
                marginLeft: 'auto',
              }}
            >
              <ExternalLink size={11} /> Source
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function ProfileRecordMeta({
  items,
}: {
  items: Array<{ label?: string; value: string | number; accent?: string }>;
}) {
  return (
    <>
      {items.map((m, i) => (
        <span
          key={i}
          style={{ color: m.accent ?? 'var(--color-text-3)', whiteSpace: 'nowrap' }}
        >
          {m.label ? `${m.label}: ` : ''}
          {m.value}
        </span>
      ))}
    </>
  );
}

export function ProfileRecordList({
  records,
  empty,
}: {
  records: React.ReactNode[];
  empty?: React.ReactNode;
}) {
  if (records.length === 0) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          borderRadius: '12px',
          border: '1px dashed rgba(235,229,213,0.06)',
          background: 'var(--color-surface)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'var(--color-text-3)',
            margin: 0,
          }}
        >
          {empty ?? 'No records found.'}
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {records}
    </div>
  );
}

// ── Sidebar ──

function Sidebar({
  detail,
  stock,
  trends,
  extraSidebar,
  accent,
  accentRGB,
  sectorKey,
  companyIdOrFallback,
}: {
  detail: ProfileDetail;
  stock: ProfileStock | null;
  trends: { years: number[]; series: Record<string, number[]> } | null;
  extraSidebar?: React.ReactNode;
  accent: string;
  accentRGB: string;
  sectorKey: string;
  companyIdOrFallback: string;
}) {
  const meta: Array<[string, string | null | undefined]> = [
    ['Ticker', detail.ticker],
    ['Sector', detail.sector_type?.replace(/_/g, ' ')],
    ['SEC CIK', detail.sec_cik],
  ];

  return (
    <aside
      style={{
        borderRight: '1px solid rgba(235,229,213,0.06)',
        padding: '32px 24px',
        background: `linear-gradient(180deg, rgba(${accentRGB},0.04) 0%, transparent 30%)`,
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            width: '120px',
            height: '120px',
            borderRadius: '20px',
            background: `rgba(${accentRGB},0.08)`,
            border: `1px solid ${accent}33`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px',
          }}
        >
          <CompanyLogo
            id={detail.company_id}
            name={detail.display_name}
            logoUrl={detail.logo_url}
            size={88}
            iconFallback
          />
        </div>
      </div>

      {/* Name */}
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(26px, 3vw, 34px)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            color: 'var(--color-text-1)',
            margin: '0 0 8px',
          }}
        >
          {detail.display_name}
        </h1>
        {detail.headquarters && (
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              margin: 0,
            }}
          >
            {detail.headquarters}
          </p>
        )}

        {/* Badges */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '12px',
          }}
        >
          {detail.ticker && (
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                background: `rgba(${accentRGB},0.14)`,
                color: accent,
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {detail.ticker}
            </span>
          )}
          <SanctionsBadge status={detail.sanctions_status ?? null} />
          <AnomalyBadge entityType="company" entityId={detail.company_id} />
          <WatchlistButton
            entityType="company"
            entityId={detail.company_id || companyIdOrFallback}
            entityName={detail.display_name}
            sector={sectorKey}
          />
        </div>
      </div>

      {/* AI summary */}
      {detail.ai_profile_summary && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            border: `1px solid ${accent}22`,
            background: `rgba(${accentRGB},0.04)`,
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: accent,
              margin: '0 0 6px',
            }}
          >
            AI Analysis
          </p>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              lineHeight: 1.55,
              color: 'var(--color-text-2)',
              margin: 0,
            }}
          >
            {detail.ai_profile_summary}
          </p>
        </div>
      )}

      {/* Meta */}
      <div style={{ display: 'grid', gap: '10px' }}>
        {meta.map(([label, value]) =>
          value ? (
            <div key={label}>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-3)',
                  margin: '0 0 3px',
                }}
              >
                {label}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: 'var(--color-text-1)',
                  margin: 0,
                  textTransform:
                    label === 'Sector' ? 'uppercase' : 'none',
                }}
              >
                {value}
              </p>
            </div>
          ) : null,
        )}
      </div>

      {/* Market data */}
      {stock && (
        <div>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              margin: '0 0 10px',
            }}
          >
            Market Data
          </p>
          <div style={{ display: 'grid', gap: '8px' }}>
            {stock.market_cap != null && (
              <StockRow label="Market Cap" value={fmtDollar(stock.market_cap)} />
            )}
            {stock.pe_ratio != null && (
              <StockRow label="P/E Ratio" value={stock.pe_ratio.toFixed(2)} />
            )}
            {stock.profit_margin != null && (
              <StockRow label="Profit Margin" value={fmtPct(stock.profit_margin)} />
            )}
            {stock.revenue_ttm != null && (
              <StockRow label="Revenue TTM" value={fmtDollar(stock.revenue_ttm)} />
            )}
            {stock.last_price != null && (
              <StockRow label="Last Price" value={`$${stock.last_price.toFixed(2)}`} />
            )}
          </div>
        </div>
      )}

      {/* Overview stats */}
      <div
        style={{
          padding: '16px',
          borderRadius: '12px',
          background: `rgba(${accentRGB},0.04)`,
          border: `1px solid ${accent}22`,
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: accent,
            margin: '0 0 12px',
          }}
        >
          Overview
        </p>
        <div style={{ display: 'grid', gap: '8px' }}>
          {detail.total_contract_value != null && (
            <StockRow label="Contracts" value={fmtDollar(detail.total_contract_value)} />
          )}
          {detail.enforcement_count != null && (
            <StockRow
              label="Enforcement"
              value={detail.enforcement_count.toLocaleString()}
            />
          )}
          {detail.lobbying_count != null && (
            <StockRow
              label="Lobbying"
              value={detail.lobbying_count.toLocaleString()}
            />
          )}
          {detail.filing_count != null && (
            <StockRow
              label="SEC Filings"
              value={detail.filing_count.toLocaleString()}
            />
          )}
        </div>
      </div>

      {extraSidebar}

      {/* Trends */}
      {trends && (
        <div>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              margin: '0 0 10px',
            }}
          >
            Activity Over Time
          </p>
          <TrendChart data={trends} height={120} />
        </div>
      )}
    </aside>
  );
}

function StockRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '12px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '12px',
          color: 'var(--color-text-3)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--color-text-1)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Main layout ──

interface SectorProfileLayoutProps {
  config: SectorConfig;
  detail: ProfileDetail | null;
  stock: ProfileStock | null;
  trends: { years: number[]; series: Record<string, number[]> } | null;
  /** Supplement the sidebar below the overview block (e.g. risk scores) */
  extraSidebar?: React.ReactNode;
  tabs: ProfileTab[];
  activeTab: string;
  onChangeTab: (key: string) => void;
  loading: boolean;
  error: string | null;
  companyIdParam: string;
  /** Path to the sector's companies list page for breadcrumb + fallback link */
  companiesPath: string;
}

export function SectorProfileLayout({
  config,
  detail,
  stock,
  trends,
  extraSidebar,
  tabs,
  activeTab,
  onChangeTab,
  loading,
  error,
  companyIdParam,
  companiesPath,
}: SectorProfileLayoutProps) {
  const Header = config.Header;
  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (loading) {
    return (
      <main style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            border: `2px solid ${config.accent}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main style={pageShell}>
        <Header />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '96px 24px',
            gap: '12px',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '16px',
              color: 'var(--color-red)',
              margin: 0,
            }}
          >
            Failed to load company
          </p>
          {error && (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--color-text-3)',
                margin: 0,
              }}
            >
              {error}
            </p>
          )}
          <Link
            to={companiesPath}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: `1px solid ${config.accent}55`,
              background: `rgba(${config.accentRGB},0.12)`,
              color: config.accent,
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ArrowLeft size={12} /> Back to directory
          </Link>
        </div>
      </main>
    );
  }

  const currentTab = tabs.find((t) => t.key === activeTab) || tabs[0];

  return (
    <main id="main-content" style={pageShell}>
      {/* Background */}
      <div style={decorWrap} aria-hidden>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at 15% -10%, ${config.accent} 0%, transparent 45%)`,
            opacity: 0.06,
          }}
        />
      </div>

      <Header />

      {/* Top identity bar */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          borderBottom: '1px solid rgba(235,229,213,0.06)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: `linear-gradient(180deg, rgba(${config.accentRGB},0.08) 0%, transparent 100%)`,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flex: 1,
            minWidth: 0,
          }}
        >
          <Link
            to={companiesPath}
            aria-label="Back to directory"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid rgba(235,229,213,0.08)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-2)',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={14} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: config.accent,
              }}
            >
              {config.label}
            </span>
            <span style={{ color: 'var(--color-text-3)' }}>/</span>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--color-text-1)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontWeight: 600,
              }}
            >
              {detail.display_name}
            </span>
            {detail.ticker && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: `rgba(${config.accentRGB},0.12)`,
                  color: config.accent,
                  fontWeight: 700,
                }}
              >
                {detail.ticker}
              </span>
            )}
          </div>
        </div>
        <ShareButton
          url={typeof window !== 'undefined' ? window.location.href : ''}
          title={`${detail.display_name} — WeThePeople`}
        />
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: sidebarOpen ? '320px 1fr' : '1fr',
          minHeight: 'calc(100vh - 160px)',
        }}
      >
        {sidebarOpen && (
          <Sidebar
            detail={detail}
            stock={stock}
            trends={trends}
            extraSidebar={extraSidebar}
            accent={config.accent}
            accentRGB={config.accentRGB}
            sectorKey={config.key}
            companyIdOrFallback={companyIdParam}
          />
        )}

        {/* Right panel */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
          }}
        >
          {/* Tab bar */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              padding: '16px 24px 0',
              borderBottom: '1px solid rgba(235,229,213,0.06)',
              overflowX: 'auto',
            }}
          >
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              style={{
                padding: '8px 12px',
                borderRadius: '8px 8px 0 0',
                border: 'none',
                borderBottom: '2px solid transparent',
                background: 'transparent',
                color: 'var(--color-text-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                marginBottom: '-1px',
              }}
            >
              {sidebarOpen ? '←' : '→'}
            </button>
            {tabs.map((tab) => {
              const isActive = tab.key === activeTab;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => onChangeTab(tab.key)}
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 16px',
                    border: 'none',
                    background: 'transparent',
                    color: isActive ? config.accent : 'var(--color-text-3)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'color 0.2s',
                    marginBottom: '-1px',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.color = 'var(--color-text-1)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.color = 'var(--color-text-3)';
                  }}
                >
                  {Icon && <Icon size={12} />}
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '999px',
                        background: isActive
                          ? `rgba(${config.accentRGB},0.18)`
                          : 'rgba(235,229,213,0.06)',
                        color: isActive ? config.accent : 'var(--color-text-3)',
                        fontSize: '10px',
                      }}
                    >
                      {tab.count.toLocaleString()}
                    </span>
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="sector-profile-tab-indicator"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: '2px',
                        background: config.accent,
                        borderRadius: '2px',
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '28px 24px 64px',
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {currentTab?.render()}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </main>
  );
}
