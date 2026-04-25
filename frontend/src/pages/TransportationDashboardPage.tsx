import React, {useEffect, useState, useCallback} from 'react';
import { DollarSign, Landmark, Shield, Truck } from 'lucide-react';
import { TransportationSectorHeader } from '../components/SectorHeader';
import CompanyLogo from '../components/CompanyLogo';
import DataFreshness from '../components/DataFreshness';
import {
  StatCard,
  SectorHero,
  SectorDistributionCard,
  SubNavTiles,
  SectionHeading,
  FeaturedCompanyRow,
  RecentActivityList,
  DataSourceList,
  DashboardFooterStrip,
  DashboardShellLayout,
  DashboardLoadingSpinner,
  type StatCardProps,
  type SubNavLink,
  type ActivityItemShape,
} from '../components/sector/DashboardShell';
import {
  getTransportationDashboardStats,
  getTransportationCompanies,
  getTransportationRecentActivity,
  type TransportationDashboardStats,
  type TransportationCompanyListItem,
  type RecentActivityItem,
} from '../api/transportation';

// ─────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────────
// Sub-sector token map
// ─────────────────────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  aviation: 'var(--color-dem)',
  logistics: 'var(--color-green)',
  motor_vehicle: 'var(--color-accent)',
  rail: 'var(--color-ind)',
  ride_share: 'var(--color-text-3)',
  aerospace: 'var(--color-red)',
  maritime: 'var(--color-verify)',
};

const SECTOR_LABELS: Record<string, string> = {
  aviation: 'AVIATION',
  logistics: 'LOGISTICS',
  motor_vehicle: 'MOTOR VEHICLE',
  rail: 'RAIL',
  ride_share: 'RIDE-SHARE',
  aerospace: 'AEROSPACE',
  maritime: 'MARITIME',
};

const getSectorColor = (s: string) => SECTOR_COLORS[s.toLowerCase()] || 'var(--color-text-3)';
const getSectorLabel = (s: string) =>
  SECTOR_LABELS[s.toLowerCase()] || s.toUpperCase().replace(/_/g, ' ');

const TYPE_BADGES: Record<string, { bg: string; color: string }> = {
  enforcement: { bg: 'rgba(230,57,70,0.12)', color: 'var(--color-red)' },
  contract: { bg: 'rgba(46,196,182,0.12)', color: 'var(--color-green)' },
  lobbying: { bg: 'rgba(74,127,222,0.12)', color: 'var(--color-dem)' },
};

const DATA_SOURCES = [
  'SEC EDGAR',
  'USASpending.gov',
  'Senate LDA Lobbying',
  'Federal Register (NHTSA/FAA/FMC)',
  'Yahoo Finance',
];

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function TransportationDashboardPage() {
  const [stats, setStats] = useState<TransportationDashboardStats | null>(null);
  const [companies, setCompanies] = useState<TransportationCompanyListItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    Promise.all([
      getTransportationDashboardStats(),
      getTransportationCompanies({ limit: 6 }),
      getTransportationRecentActivity(10).catch(() => ({ items: [] })),
    ])
      .then(([s, c, activity]) => {
        if (cancelled) return;
        if (s.total_companies == null) throw new Error('Transportation sector data is not yet available on this server.');
        setStats(s);
        setCompanies(c.companies || []);
        setRecentActivity(activity.items || []);
      })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load dashboard'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const teardown = loadData();
    return teardown;
  }, [loadData]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center">
          <p style={{ color: 'var(--color-red)', fontFamily: "'Inter', sans-serif", fontSize: 16, marginBottom: 8 }}>
            Failed to load dashboard
          </p>
          <p style={{ color: 'var(--color-text-3)', fontFamily: "'Inter', sans-serif", fontSize: 13 }}>{error}</p>
          <button
            onClick={() => loadData()}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              borderRadius: 'var(--radius-card)',
              background: 'var(--color-accent)',
              color: '#07090C',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading) return <DashboardLoadingSpinner />;

  const statCards: StatCardProps[] = [
    { label: 'Lobbying spend', value: fmtMoney(stats?.total_lobbying_spend || 0), icon: DollarSign, color: 'var(--color-dem)', to: '/transportation/lobbying' },
    { label: 'Gov contracts', value: fmtMoney(stats?.total_contract_value || stats?.total_contracts || 0), icon: Landmark, color: 'var(--color-green)', to: '/transportation/contracts' },
    { label: 'Enforcement actions', value: fmtNum(stats?.total_enforcement || 0), icon: Shield, color: 'var(--color-red)', to: '/transportation/enforcement' },
    { label: 'Tracked companies', value: fmtNum(stats?.total_companies || 0), icon: Truck, color: 'var(--color-accent)', to: '/transportation/companies' },
  ];

  const subNavLinks: SubNavLink[] = [
    { to: '/transportation/companies', label: 'Companies', desc: 'Full company directory', color: 'var(--color-accent)' },
    { to: '/transportation/lobbying', label: 'Lobbying', desc: 'Senate LDA disclosures', color: 'var(--color-dem)' },
    { to: '/transportation/contracts', label: 'Contracts', desc: 'Government contract awards', color: 'var(--color-green)' },
    { to: '/transportation/compare', label: 'Compare', desc: 'Side-by-side company analysis', color: 'var(--color-ind)' },
  ];

  const activityItems: ActivityItemShape[] = recentActivity.map((item, idx) => ({
    id: idx,
    title: item.title,
    type: item.type,
    company_id: item.company_id,
    company_name: item.company_name,
    date: item.date,
    description: item.description,
    url: item.url,
    meta: item.meta,
  }));

  return (
    <DashboardShellLayout sector="transportation" header={<TransportationSectorHeader />}>
      <SectorHero
        eyebrow="Transportation transparency"
        titleLine1="Moving money in"
        titleAccent="politics"
        sub="Lobbying, government contracts, and enforcement across airlines, automakers, rail, aerospace, and logistics companies."
        ctas={[
          { label: 'Browse companies', to: '/transportation/companies', primary: true },
          { label: 'Compare companies', to: '/transportation/compare' },
        ]}
        rightSlot={statCards.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      />

      <div style={{ marginBottom: 40 }}>
        <DataFreshness />
      </div>

      {stats && Object.keys(stats.by_sector).length > 0 && (
        <SectorDistributionCard
          bySector={stats.by_sector}
          total={stats.total_companies}
          getColor={getSectorColor}
          getLabel={getSectorLabel}
          linkPrefix="/transportation/companies?sector="
          description="Breakdown of tracked companies by transportation segment"
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
        <section>
          <SectionHeading
            title="Featured companies"
            linkLabel="View all"
            linkTo="/transportation/companies"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {companies.slice(0, 6).map((c) => (
              <FeaturedCompanyRow
                key={c.company_id}
                item={{
                  id: c.company_id,
                  displayName: c.display_name,
                  ticker: c.ticker || c.company_id,
                  sectorKey: c.sector_type,
                  logo: (
                    <CompanyLogo
                      id={c.company_id}
                      name={c.display_name}
                      logoUrl={c.logo_url}
                      size={40}
                    />
                  ),
                  detailPath: `/transportation/${c.company_id}`,
                }}
                getSectorColor={getSectorColor}
                getSectorLabel={getSectorLabel}
              />
            ))}
          </div>
        </section>

        <section>
          <SectionHeading
            title="Recent activity"
            linkLabel="Full feed"
            linkTo="/transportation/companies"
          />
          <RecentActivityList
            items={activityItems}
            typeBadges={TYPE_BADGES}
            viewCompanyPathPrefix="/transportation/"
            accent="var(--color-dem)"
            accentTint="rgba(74,127,222,0.12)"
            formatMoney={fmtMoney}
          />
        </section>
      </div>

      <DataSourceList sources={DATA_SOURCES} />
      <DashboardFooterStrip />
    </DashboardShellLayout>
  );
}
