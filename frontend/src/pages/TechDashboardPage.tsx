import React, {useEffect, useState, useCallback} from 'react';
import { DollarSign, Landmark, Shield, FileBadge } from 'lucide-react';
import { TechSectorHeader } from '../components/SectorHeader';
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
  getTechDashboardStats,
  getTechCompanies,
  getTechRecentActivity,
  type TechDashboardStats,
  type TechCompanyListItem,
  type TechRecentActivityItem,
} from '../api/tech';
import { LOCAL_LOGOS } from '../data/techLogos';

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
  platform: 'var(--color-ind)',          // purple
  enterprise: 'var(--color-dem)',        // blue
  semiconductor: 'var(--color-accent)',  // gold
  automotive: 'var(--color-green)',      // green
  media: 'var(--color-red)',             // red
};

const SECTOR_LABELS: Record<string, string> = {
  platform: 'PLATFORM',
  enterprise: 'ENTERPRISE',
  semiconductor: 'SEMICONDUCTOR',
  automotive: 'AUTOMOTIVE',
  media: 'MEDIA',
};

const getSectorColor = (s: string) => SECTOR_COLORS[s.toLowerCase()] || 'var(--color-text-3)';
const getSectorLabel = (s: string) => SECTOR_LABELS[s.toLowerCase()] || s.toUpperCase();

const TYPE_BADGES: Record<string, { bg: string; color: string }> = {
  enforcement: { bg: 'rgba(230,57,70,0.12)', color: 'var(--color-red)' },
  patent: { bg: 'rgba(197,160,40,0.12)', color: 'var(--color-accent)' },
  contract: { bg: 'rgba(74,127,222,0.12)', color: 'var(--color-dem)' },
  lobbying: { bg: 'rgba(155,127,204,0.12)', color: 'var(--color-ind)' },
};

const DATA_SOURCES = [
  'USPTO Patent Database',
  'USASpending.gov',
  'SEC EDGAR',
  'Senate LDA Lobbying',
  'FTC Enforcement',
  'Yahoo Finance',
];

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function TechDashboardPage() {
  const [stats, setStats] = useState<TechDashboardStats | null>(null);
  const [companies, setCompanies] = useState<TechCompanyListItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<TechRecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    Promise.all([
      getTechDashboardStats(),
      getTechCompanies({ limit: 6 }),
      getTechRecentActivity(10).catch(() => ({ items: [] })),
    ])
      .then(([s, c, activity]) => {
        if (cancelled) return;
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
    { label: 'Lobbying spend', value: fmtMoney(stats?.total_lobbying_spend || 0), icon: DollarSign, color: 'var(--color-ind)', to: '/technology/lobbying' },
    { label: 'Gov contracts', value: fmtMoney(stats?.total_contract_value || stats?.total_contracts || 0), icon: Landmark, color: 'var(--color-dem)', to: '/technology/contracts' },
    { label: 'Enforcement actions', value: fmtNum(stats?.total_enforcement || 0), icon: Shield, color: 'var(--color-red)', to: '/technology/enforcement' },
    { label: 'Patents filed', value: fmtNum(stats?.total_patents || 0), icon: FileBadge, color: 'var(--color-accent)', to: '/technology/patents' },
  ];

  const subNavLinks: SubNavLink[] = [
    { to: '/technology/companies', label: 'Companies', desc: 'Full company directory', color: 'var(--color-ind)' },
    { to: 'https://research.wethepeopleforus.com/patents', label: 'Patents', desc: 'Search patent filings (WTP Research)', color: 'var(--color-research)', external: true },
    { to: '/technology/lobbying', label: 'Lobbying', desc: 'Lobbying expenditure breakdown', color: 'var(--color-dem)' },
    { to: '/technology/compare', label: 'Compare', desc: 'Side-by-side company analysis', color: 'var(--color-green)' },
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
    <DashboardShellLayout sector="technology" header={<TechSectorHeader />}>
      <SectorHero
        sectorKey="technology"
        sectorLabel="Technology"
        eyebrow="Technology transparency"
        titleLine1="Big Tech's"
        titleLine2="political"
        titleAccent="playbook"
        sub="Lobbying, government contracts, patents, and enforcement across the largest technology companies in the United States."
        ctas={[
          { label: 'Browse companies', to: '/technology/companies', primary: true },
          { label: 'Patent search', to: 'https://research.wethepeopleforus.com/patents', external: true, badge: 'Research' },
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
          linkPrefix="/technology/companies?sector="
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
            linkTo="/technology/companies"
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
                      localLogos={LOCAL_LOGOS}
                      size={40}
                    />
                  ),
                  detailPath: `/technology/${c.company_id}`,
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
            linkTo="/technology/companies"
          />
          <RecentActivityList
            items={activityItems}
            typeBadges={TYPE_BADGES}
            viewCompanyPathPrefix="/technology/"
            accent="var(--color-ind)"
            accentTint="rgba(155,127,204,0.12)"
            formatMoney={fmtMoney}
          />
        </section>
      </div>

      <DataSourceList sources={DATA_SOURCES} />
      <DashboardFooterStrip />
    </DashboardShellLayout>
  );
}
