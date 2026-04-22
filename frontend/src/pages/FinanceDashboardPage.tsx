import React, { useEffect, useState } from 'react';
import { DollarSign, FileText, Shield, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { FinanceSectorHeader } from '../components/SectorHeader';
import CompanyLogo from '../components/CompanyLogo';
import DataFreshness from '../components/DataFreshness';
import {
  StatCard,
  SectorHero,
  SectorDistributionCard,
  SubNavTiles,
  SectionHeading,
  FeaturedCompanyRow,
  DataSourceList,
  DashboardFooterStrip,
  DashboardShellLayout,
  DashboardLoadingSpinner,
  type StatCardProps,
  type SubNavLink,
} from '../components/sector/DashboardShell';
import { LOCAL_LOGOS } from '../data/financeLogos';
import {
  getFinanceDashboardStats,
  getInstitutions,
  getAllInsiderTrades,
  type FinanceDashboardStats,
  type InstitutionListItem,
  type InsiderTradeItem,
} from '../api/finance';

// ─────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────
// Sub-sector token map
// ─────────────────────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  bank: 'var(--color-dem)',
  investment: 'var(--color-ind)',
  insurance: 'var(--color-accent)',
  fintech: 'var(--color-green)',
  central_bank: 'var(--color-red)',
};

const SECTOR_LABELS: Record<string, string> = {
  bank: 'BANK',
  investment: 'INVESTMENT',
  insurance: 'INSURANCE',
  fintech: 'FINTECH',
  central_bank: 'CENTRAL BANK',
};

const getSectorColor = (s: string) => SECTOR_COLORS[s.toLowerCase()] || 'var(--color-text-3)';
const getSectorLabel = (s: string) => SECTOR_LABELS[s.toLowerCase()] || s.toUpperCase();

const DATA_SOURCES = [
  'SEC EDGAR (10-K, 10-Q, 8-K Filings)',
  'Senate LDA (Lobbying Disclosures)',
  'USASpending.gov (Gov Contracts)',
  'FEC (PAC Donations)',
  'Federal Register (Enforcement Actions)',
  'FDIC BankFind (Bank Financials)',
  'Alpha Vantage (Stock Data)',
  'FRED (Economic Indicators)',
  'SAM.gov (Contractor Data)',
  'Regulations.gov (Regulatory Comments)',
  'IT Dashboard (IT Investments)',
];

// ─────────────────────────────────────────────────────────────────────
// Extended stats type (includes by_sector from API)
// ─────────────────────────────────────────────────────────────────────

interface FinanceDashboardStatsExtended extends FinanceDashboardStats {
  by_sector?: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function FinanceDashboardPage() {
  const [stats, setStats] = useState<FinanceDashboardStatsExtended | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionListItem[]>([]);
  const [trades, setTrades] = useState<InsiderTradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTrade, setExpandedTrade] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getFinanceDashboardStats(),
      getInstitutions({ limit: 6 }),
      getAllInsiderTrades({ limit: 8 }),
    ])
      .then(([statsRes, instRes, tradesRes]) => {
        if (cancelled) return;
        setStats(statsRes as FinanceDashboardStatsExtended);
        setInstitutions(instRes.institutions || []);
        setTrades(tradesRes.trades || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <DashboardLoadingSpinner />;

  const statCards: StatCardProps[] = [
    { label: 'Lobbying spend', value: formatMoney(stats?.total_lobbying_spend || 0), icon: DollarSign, color: 'var(--color-dem)', to: '/finance/lobbying' },
    { label: 'Gov contracts', value: formatMoney(stats?.total_contract_value || 0), icon: FileText, color: 'var(--color-green)', to: '/finance/contracts' },
    { label: 'Enforcement actions', value: formatNum(stats?.total_enforcement || 0), icon: Shield, color: 'var(--color-red)', to: '/finance/enforcement' },
    { label: 'Insider trade alerts', value: formatNum(stats?.total_insider_trades || 0), icon: TrendingUp, color: 'var(--color-accent)', to: '/finance/institutions' },
  ];

  const subNavLinks: SubNavLink[] = [
    { to: '/finance/institutions', label: 'Institutions', desc: 'Full institution directory', color: 'var(--color-green)' },
    { to: 'https://research.wethepeopleforus.com/insider-trades', label: 'Insider trades', desc: 'Corporate insider trading (WTP Research)', color: 'var(--color-research)', external: true },
    { to: 'https://research.wethepeopleforus.com/news', label: 'News & regulatory', desc: 'Latest sector developments (WTP Research)', color: 'var(--color-research)', external: true },
    { to: '/finance/compare', label: 'Compare', desc: 'Side-by-side institution analysis', color: 'var(--color-ind)' },
  ];

  return (
    <DashboardShellLayout header={<FinanceSectorHeader />}>
      <SectorHero
        eyebrow="Financial transparency"
        titleLine1="Wall Street's"
        titleLine2="influence in"
        titleAccent="Washington"
        sub="Lobbying, contracts, enforcement, and insider trades across the nation's largest banks, insurers, and investment firms."
        ctas={[
          { label: 'Browse institutions', to: '/finance/institutions', primary: true },
          { label: 'Insider trades', to: 'https://research.wethepeopleforus.com/insider-trades', external: true, badge: 'Research' },
        ]}
        rightSlot={statCards.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      />

      <div style={{ marginBottom: 40 }}>
        <DataFreshness />
      </div>

      {stats?.by_sector && Object.keys(stats.by_sector).length > 0 && (
        <SectorDistributionCard
          bySector={stats.by_sector}
          total={stats.total_institutions}
          getColor={getSectorColor}
          getLabel={getSectorLabel}
          linkPrefix="/finance/institutions?sector="
          description="Breakdown of tracked institutions by financial segment"
        />
      )}

      <SubNavTiles links={subNavLinks} />

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 20,
        }}
      >
        {/* Featured Institutions */}
        <section>
          <SectionHeading
            title="Featured institutions"
            linkLabel="View all"
            linkTo="/finance/institutions"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {institutions.map((inst) => (
              <FeaturedCompanyRow
                key={inst.institution_id}
                item={{
                  id: inst.institution_id,
                  displayName: inst.display_name,
                  ticker: inst.ticker,
                  sectorKey: inst.sector_type,
                  logo: (
                    <CompanyLogo
                      id={inst.institution_id}
                      name={inst.display_name}
                      logoUrl={inst.logo_url}
                      localLogos={LOCAL_LOGOS}
                      size={40}
                      fallbackBg="var(--color-surface-2)"
                    />
                  ),
                  detailPath: `/finance/${inst.institution_id}`,
                }}
                getSectorColor={getSectorColor}
                getSectorLabel={getSectorLabel}
              />
            ))}
          </div>
        </section>

        {/* Recent activity — bespoke insider trades (unique to Finance) */}
        <section>
          <SectionHeading
            title="Recent activity"
            linkLabel="Full feed"
            linkTo="https://research.wethepeopleforus.com/insider-trades"
            external
          />
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {trades.map((trade, idx) => {
              const isExpanded = expandedTrade === trade.id;
              const txType = trade.transaction_type?.toLowerCase();
              const isSale = txType?.includes('sale') || txType?.includes('sell');
              const tradeColor = isSale ? 'var(--color-red)' : 'var(--color-green)';
              const tradeBg = isSale ? 'rgba(224,85,85,0.12)' : 'rgba(74,162,132,0.12)';

              return (
                <button
                  key={trade.id}
                  onClick={() => setExpandedTrade(isExpanded ? null : trade.id)}
                  className="w-full text-left focus:outline-none"
                  style={{
                    padding: 14,
                    background: 'transparent',
                    border: 'none',
                    borderTop: idx === 0 ? 'none' : '1px solid var(--color-border)',
                    cursor: 'pointer',
                  }}
                >
                  <div className="flex items-start justify-between" style={{ gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 14,
                          fontWeight: 600,
                          color: 'var(--color-text-1)',
                          margin: 0,
                          overflow: isExpanded ? 'visible' : 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: isExpanded ? 'normal' : 'nowrap',
                        }}
                      >
                        {trade.filer_name}
                        {trade.filer_title ? ` (${trade.filer_title})` : ''}
                      </p>
                      <p
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 12,
                          color: 'var(--color-text-3)',
                          margin: '4px 0 0',
                          lineHeight: 1.5,
                          display: isExpanded ? 'block' : '-webkit-box',
                          WebkitLineClamp: isExpanded ? undefined : 1,
                          WebkitBoxOrient: 'vertical',
                          overflow: isExpanded ? 'visible' : 'hidden',
                        }}
                      >
                        {trade.transaction_type || 'Trade'} —{' '}
                        {trade.shares?.toLocaleString() || '?'} shares
                        {trade.ticker ? ` of ${trade.ticker}` : ''}
                        {trade.total_value ? ` ($${formatNum(trade.total_value)})` : ''}
                      </p>
                      <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10,
                            color: 'var(--color-text-3)',
                          }}
                        >
                          {trade.company_name}
                        </span>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10,
                            background: tradeBg,
                            color: tradeColor,
                          }}
                        >
                          {isSale ? 'SELL' : 'BUY'}
                        </span>
                        {isExpanded && trade.filing_url && (
                          <a
                            href={trade.filing_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="no-underline"
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'var(--color-surface-2)',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 10,
                              color: 'var(--color-text-2)',
                            }}
                          >
                            SEC Filing →
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end" style={{ gap: 6, flexShrink: 0 }}>
                      {trade.transaction_date && (
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10,
                            color: 'var(--color-text-3)',
                          }}
                        >
                          {new Date(trade.transaction_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp size={12} style={{ color: 'var(--color-text-3)' }} />
                      ) : (
                        <ChevronDown size={12} style={{ color: 'var(--color-text-3)' }} />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {trades.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    color: 'var(--color-text-3)',
                    margin: 0,
                  }}
                >
                  No recent insider trades
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <DataSourceList sources={DATA_SOURCES} />
      <DashboardFooterStrip />
    </DashboardShellLayout>
  );
}
