import React, { useEffect, useState } from 'react';
import { DollarSign, Landmark, Shield, FlaskConical } from 'lucide-react';
import { HealthSectorHeader } from '../components/SectorHeader';
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
  getHealthDashboardStats,
  getHealthCompanies,
  type HealthDashboardStats,
  type CompanyListItem,
} from '../api/health';
import { fmtNum } from '../utils/format';
import { LOCAL_LOGOS } from '../data/healthLogos';

// ─────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────────
// Sub-sector token map
// ─────────────────────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  pharma: 'var(--color-red)',
  insurer: 'var(--color-dem)',
  biotech: 'var(--color-green)',
  pharmacy: 'var(--color-accent)',
  distributor: 'var(--color-ind)',
};

const SECTOR_LABELS: Record<string, string> = {
  pharma: 'PHARMA',
  insurer: 'INSURERS',
  biotech: 'BIOTECH',
  pharmacy: 'PHARMACY',
  distributor: 'DISTRIBUTORS',
};

const getSectorColor = (s: string) => SECTOR_COLORS[s.toLowerCase()] || 'var(--color-text-3)';
const getSectorLabel = (s: string) => SECTOR_LABELS[s.toLowerCase()] || s.toUpperCase();

// Recent activity uses sector_type as the "type" key so each alert is
// colored by its own sector — map each sector key to a badge.
const TYPE_BADGES: Record<string, { bg: string; color: string }> = {
  pharma: { bg: 'rgba(230,57,70,0.12)', color: 'var(--color-red)' },
  insurer: { bg: 'rgba(74,127,222,0.12)', color: 'var(--color-dem)' },
  biotech: { bg: 'rgba(46,196,182,0.12)', color: 'var(--color-green)' },
  pharmacy: { bg: 'rgba(197,160,40,0.12)', color: 'var(--color-accent)' },
  distributor: { bg: 'rgba(155,127,204,0.12)', color: 'var(--color-ind)' },
};

const DATA_SOURCES = [
  'Senate LDA (Lobbying)',
  'USASpending (Contracts)',
  'FDA Enforcement',
  'OpenFDA',
  'ClinicalTrials.gov',
  'CMS Open Payments',
  'SEC EDGAR',
];

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function HealthDashboardPage() {
  const [stats, setStats] = useState<HealthDashboardStats | null>(null);
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getHealthDashboardStats(),
      getHealthCompanies({ limit: 100 }),
    ])
      .then(([statsRes, compRes]) => {
        if (cancelled) return;
        setStats(statsRes);
        setCompanies(compRes.companies || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <DashboardLoadingSpinner />;

  const statCards: StatCardProps[] = [
    { label: 'Lobbying spend', value: formatMoney(stats?.total_lobbying_spend || 0), icon: DollarSign, color: 'var(--color-dem)', to: '/health/lobbying' },
    { label: 'Gov contracts', value: formatMoney(stats?.total_contract_value || 0), icon: Landmark, color: 'var(--color-green)', to: '/health/contracts' },
    { label: 'Enforcement actions', value: fmtNum(stats?.total_enforcement || 0), icon: Shield, color: 'var(--color-red)', to: '/health/enforcement' },
    { label: 'Clinical trials', value: fmtNum(stats?.total_trials || 0), icon: FlaskConical, color: 'var(--color-accent)', to: '/health/companies' },
  ];

  const subNavLinks: SubNavLink[] = [
    { to: '/health/companies', label: 'Companies', desc: 'Full company directory', color: 'var(--color-red)' },
    { to: 'https://research.wethepeopleforus.com/pipeline', label: 'Clinical pipeline', desc: 'Active trials & phases (WTP Research)', color: 'var(--color-research)', external: true },
    { to: 'https://research.wethepeopleforus.com/fda-approvals', label: 'FDA approvals', desc: 'Recent FDA actions (WTP Research)', color: 'var(--color-research)', external: true },
    { to: '/health/compare', label: 'Compare', desc: 'Side-by-side company analysis', color: 'var(--color-green)' },
  ];

  const featured = companies.slice(0, 6);

  const activityItems: ActivityItemShape[] = companies
    .filter((c) => (c.recall_count || 0) > 0 || (c.adverse_event_count || 0) > 0)
    .slice(0, 5)
    .map((c, idx) => ({
      id: idx,
      title: `${c.display_name} — ${c.recall_count || 0} recalls, ${c.adverse_event_count || 0} adverse events`,
      type: c.sector_type,
      company_id: c.company_id,
      company_name: c.display_name,
    }));

  return (
    <DashboardShellLayout sector="health" header={<HealthSectorHeader />}>
      <SectorHero
        eyebrow="Healthcare transparency"
        titleLine1="Pharma's"
        titleLine2="political"
        titleAccent="influence"
        sub="Lobbying, contracts, enforcement actions, and clinical trials across the nation's largest healthcare and pharma companies."
        ctas={[
          { label: 'Browse companies', to: '/health/companies', primary: true },
          { label: 'Clinical pipeline', to: 'https://research.wethepeopleforus.com/pipeline', external: true, badge: 'Research' },
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
          total={stats.total_companies || 0}
          getColor={getSectorColor}
          getLabel={getSectorLabel}
          linkPrefix="/health/companies?sector="
          description="Breakdown of tracked companies by healthcare segment"
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
            linkTo="/health/companies"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {featured.map((company) => (
              <FeaturedCompanyRow
                key={company.company_id}
                item={{
                  id: company.company_id,
                  displayName: company.display_name,
                  ticker: company.ticker ?? undefined,
                  sectorKey: company.sector_type,
                  logo: (
                    <CompanyLogo
                      id={company.company_id}
                      name={company.display_name}
                      logoUrl={company.logo_url}
                      localLogos={LOCAL_LOGOS}
                      size={40}
                      iconFallback
                    />
                  ),
                  detailPath: `/health/${company.company_id}`,
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
            linkTo="/health/companies"
          />
          <RecentActivityList
            items={activityItems}
            typeBadges={TYPE_BADGES}
            viewCompanyPathPrefix="/health/"
            accent="var(--color-red)"
            accentTint="rgba(230,57,70,0.12)"
            formatMoney={formatMoney}
          />
        </section>
      </div>

      <DataSourceList sources={DATA_SOURCES} />
      <DashboardFooterStrip />
    </DashboardShellLayout>
  );
}
