import React, { useEffect, useState } from 'react';
import { DollarSign, Landmark, Shield, GraduationCap } from 'lucide-react';
import { EducationSectorHeader } from '../components/SectorHeader';
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
  getEducationDashboardStats,
  getEducationCompanies,
  getEducationRecentActivity,
  type EducationDashboardStats,
  type EducationCompanyListItem,
  type RecentActivityItem,
} from '../api/education';

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
  edtech: 'var(--color-ind)',
  publishing: 'var(--color-green)',
  student_lending: 'var(--color-accent)',
  for_profit_college: 'var(--color-red)',
  testing: 'var(--color-dem)',
  higher_ed_services: 'var(--color-verify)',
  k12_services: 'var(--color-text-3)',
};

const SECTOR_LABELS: Record<string, string> = {
  edtech: 'EDTECH',
  publishing: 'PUBLISHING',
  student_lending: 'STUDENT LENDING',
  for_profit_college: 'FOR-PROFIT COLLEGE',
  testing: 'TESTING',
  higher_ed_services: 'HIGHER ED SERVICES',
  k12_services: 'K-12 SERVICES',
};

const getSectorColor = (s: string) => SECTOR_COLORS[s.toLowerCase()] || 'var(--color-text-3)';
const getSectorLabel = (s: string) =>
  SECTOR_LABELS[s.toLowerCase()] || s.toUpperCase().replace(/_/g, ' ');

const TYPE_BADGES: Record<string, { bg: string; color: string }> = {
  enforcement: { bg: 'rgba(230,57,70,0.12)', color: 'var(--color-red)' },
  contract: { bg: 'rgba(74,127,222,0.12)', color: 'var(--color-dem)' },
  lobbying: { bg: 'rgba(197,160,40,0.12)', color: 'var(--color-accent)' },
};

const DATA_SOURCES = [
  'SEC EDGAR',
  'USASpending.gov',
  'Senate LDA Lobbying',
  'Dept. of Education',
  'Yahoo Finance',
];

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function EducationDashboardPage() {
  const [stats, setStats] = useState<EducationDashboardStats | null>(null);
  const [companies, setCompanies] = useState<EducationCompanyListItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getEducationDashboardStats(),
      getEducationCompanies({ limit: 6 }),
      getEducationRecentActivity(10).catch(() => ({ items: [] })),
    ])
      .then(([s, c, activity]) => {
        if (cancelled) return;
        if (s.total_companies == null) throw new Error('Education sector data is not yet available on this server.');
        setStats(s);
        setCompanies(c.companies || []);
        setRecentActivity(activity.items || []);
      })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load dashboard'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center">
          <p style={{ color: 'var(--color-red)', fontFamily: "'Inter', sans-serif", fontSize: 16, marginBottom: 8 }}>
            Failed to load dashboard
          </p>
          <p style={{ color: 'var(--color-text-3)', fontFamily: "'Inter', sans-serif", fontSize: 13 }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
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
    { label: 'Lobbying spend', value: fmtMoney(stats?.total_lobbying_spend || 0), icon: DollarSign, color: 'var(--color-accent)', to: '/education/lobbying' },
    { label: 'Gov contracts', value: fmtMoney(stats?.total_contract_value || stats?.total_contracts || 0), icon: Landmark, color: 'var(--color-dem)', to: '/education/contracts' },
    { label: 'Enforcement actions', value: fmtNum(stats?.total_enforcement || 0), icon: Shield, color: 'var(--color-red)', to: '/education/enforcement' },
    { label: 'Tracked companies', value: fmtNum(stats?.total_companies || 0), icon: GraduationCap, color: 'var(--color-ind)', to: '/education/companies' },
  ];

  const subNavLinks: SubNavLink[] = [
    { to: '/education/companies', label: 'Companies', desc: 'Full company directory', color: 'var(--color-ind)' },
    { to: '/education/contracts', label: 'Contracts', desc: 'Government contract awards', color: 'var(--color-dem)' },
    { to: '/education/lobbying', label: 'Lobbying', desc: 'Political lobbying filings', color: 'var(--color-accent)' },
    { to: '/education/compare', label: 'Compare', desc: 'Side-by-side company analysis', color: 'var(--color-green)' },
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
    <DashboardShellLayout sector="education" header={<EducationSectorHeader />}>
      <SectorHero
        eyebrow="Education transparency"
        titleLine1="Textbooks and tax"
        titleAccent="dollars"
        sub="Lobbying, government contracts, and enforcement across the largest education companies in the United States."
        ctas={[
          { label: 'Browse companies', to: '/education/companies', primary: true },
          { label: 'Compare companies', to: '/education/compare' },
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
          linkPrefix="/education/companies?sector="
          description="Breakdown of tracked companies by education segment"
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
            linkTo="/education/companies"
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
                  detailPath: `/education/${c.company_id}`,
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
            linkTo="/education/companies"
          />
          <RecentActivityList
            items={activityItems}
            typeBadges={TYPE_BADGES}
            viewCompanyPathPrefix="/education/"
            accent="var(--color-ind)"
            accentTint="rgba(139,92,246,0.12)"
            formatMoney={fmtMoney}
          />
        </section>
      </div>

      <DataSourceList sources={DATA_SOURCES} />
      <DashboardFooterStrip />
    </DashboardShellLayout>
  );
}
