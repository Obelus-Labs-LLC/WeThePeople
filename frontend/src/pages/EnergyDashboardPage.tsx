import React, { useEffect, useState } from 'react';
import { DollarSign, Landmark, Shield, Flame } from 'lucide-react';
import { EnergySectorHeader } from '../components/SectorHeader';
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
  getEnergyDashboardStats,
  getEnergyCompanies,
  getEnergyRecentActivity,
  type EnergyDashboardStats,
  type EnergyCompanyListItem,
  type RecentActivityItem,
} from '../api/energy';

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
  oil_gas: 'var(--color-text-3)',
  utility: 'var(--color-dem)',
  renewable: 'var(--color-green)',
  pipeline: 'var(--color-accent)',
  services: 'var(--color-ind)',
};

const SECTOR_LABELS: Record<string, string> = {
  oil_gas: 'OIL & GAS',
  utility: 'UTILITY',
  renewable: 'RENEWABLE',
  pipeline: 'PIPELINE',
  services: 'SERVICES',
};

const getSectorColor = (s: string) => SECTOR_COLORS[s.toLowerCase()] || 'var(--color-text-3)';
const getSectorLabel = (s: string) => SECTOR_LABELS[s.toLowerCase()] || s.toUpperCase();

const TYPE_BADGES: Record<string, { bg: string; color: string }> = {
  enforcement: { bg: 'rgba(230,57,70,0.12)', color: 'var(--color-red)' },
  contract: { bg: 'rgba(74,127,222,0.12)', color: 'var(--color-dem)' },
  lobbying: { bg: 'rgba(197,160,40,0.12)', color: 'var(--color-accent)' },
};

const DATA_SOURCES = [
  'SEC EDGAR',
  'USASpending.gov',
  'Senate LDA Lobbying',
  'EPA GHGRP',
  'EPA Enforcement',
  'Yahoo Finance',
];

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function EnergyDashboardPage() {
  const [stats, setStats] = useState<EnergyDashboardStats | null>(null);
  const [companies, setCompanies] = useState<EnergyCompanyListItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getEnergyDashboardStats(),
      getEnergyCompanies({ limit: 6 }),
      getEnergyRecentActivity(10).catch(() => ({ items: [] })),
    ])
      .then(([s, c, activity]) => {
        if (cancelled) return;
        if (s.total_companies == null) throw new Error('Energy sector data is not yet available on this server.');
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
    { label: 'Lobbying spend', value: fmtMoney(stats?.total_lobbying_spend || 0), icon: DollarSign, color: 'var(--color-accent)', to: '/energy/lobbying' },
    { label: 'Gov contracts', value: fmtMoney(stats?.total_contract_value || stats?.total_contracts || 0), icon: Landmark, color: 'var(--color-dem)', to: '/energy/contracts' },
    { label: 'Enforcement actions', value: fmtNum(stats?.total_enforcement || 0), icon: Shield, color: 'var(--color-red)', to: '/energy/enforcement' },
    { label: 'Emissions records', value: fmtNum(stats?.total_emissions_records || 0), icon: Flame, color: 'var(--color-green)', to: '/energy/companies' },
  ];

  const subNavLinks: SubNavLink[] = [
    { to: '/energy/companies', label: 'Companies', desc: 'Full company directory', color: 'var(--color-accent)' },
    { to: '/energy/companies', label: 'Emissions', desc: 'Greenhouse gas reporting', color: 'var(--color-green)' },
    { to: '/energy/contracts', label: 'Contracts', desc: 'Government contract awards', color: 'var(--color-dem)' },
    { to: '/energy/compare', label: 'Compare', desc: 'Side-by-side company analysis', color: 'var(--color-ind)' },
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
    <DashboardShellLayout header={<EnergySectorHeader />}>
      <SectorHero
        eyebrow="Energy transparency"
        titleLine1="Oil money in"
        titleAccent="politics"
        sub="Lobbying, emissions policy, government contracts, and enforcement across the largest energy companies in the United States."
        ctas={[
          { label: 'Browse companies', to: '/energy/companies', primary: true },
          { label: 'Compare companies', to: '/energy/compare' },
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
          linkPrefix="/energy/companies?sector="
          description="Breakdown of tracked companies by energy segment"
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
            linkTo="/energy/companies"
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
                  detailPath: `/energy/${c.company_id}`,
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
            linkTo="/energy/companies"
          />
          <RecentActivityList
            items={activityItems}
            typeBadges={TYPE_BADGES}
            viewCompanyPathPrefix="/energy/"
            accent="var(--color-accent)"
            accentTint="rgba(197,160,40,0.12)"
            formatMoney={fmtMoney}
          />
        </section>
      </div>

      <DataSourceList sources={DATA_SOURCES} />
      <DashboardFooterStrip />
    </DashboardShellLayout>
  );
}
