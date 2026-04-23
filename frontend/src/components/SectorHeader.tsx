import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from './Logo';

interface NavLink {
  label: string;
  to: string;
}

interface SectorHeaderProps {
  sector: string;
  links: NavLink[];
  /** Accent colour override for Logo + active underline. Defaults to --color-accent. */
  accent?: string;
  /** 3-letter mark inside the Logo box. Defaults to "WTP". */
  mark?: string;
}

/**
 * Sticky sector navigation bar — redesign (Apr 2026).
 *
 * 52px bar with backdrop-blur and a thin bottom border. Left cluster is the
 * new Logo (WTP mark only) paired with the uppercase sector name; right
 * cluster is underline-style nav tabs. Replaces the legacy filled-"WP"
 * square + colored pill active state with a single-accent system.
 *
 * Sibling sites (Verify / Research / Journal) re-skin by passing `accent`
 * + `mark`; the component itself stays sector-agnostic.
 */
export default function SectorHeader({
  sector,
  links,
  accent = 'var(--color-accent)',
  mark = 'WTP',
}: SectorHeaderProps) {
  const { pathname } = useLocation();

  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between overflow-x-auto scrollbar-hide mb-8"
      style={{
        height: 52,
        padding: '0 32px',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'rgba(7, 9, 12, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Left: WTP mark + uppercase sector name — links back to landing */}
      <Link
        to="/"
        className="flex items-center no-underline shrink-0"
        style={{ gap: 12 }}
      >
        <Logo size="sm" accent={accent} mark={mark} wordmark={null} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-1)',
          }}
        >
          {sector}
        </span>
      </Link>

      {/* Right: underline-style nav tabs */}
      <div
        className="flex items-center flex-nowrap shrink-0"
        style={{ gap: 4 }}
      >
        {links.map((link) => {
          const active =
            link.to === '/'
              ? pathname === '/'
              : pathname === link.to || pathname.startsWith(link.to + '/');
          return (
            <Link
              key={link.label}
              to={link.to}
              className={`relative flex items-center no-underline whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'text-[var(--color-text-1)]'
                  : 'text-[var(--color-text-3)] hover:text-[rgba(235,229,213,0.65)]'
              }`}
              style={{
                height: 52,
                padding: '0 12px',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
              }}
            >
              {link.label}
              {active && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: 0,
                    right: 0,
                    height: 1.5,
                    backgroundColor: accent,
                  }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ── Pre-configured sector headers (NavLink arrays preserved verbatim) ──

const POLITICS_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/politics' },
  { label: 'People', to: '/politics/people' },
  { label: 'Legislation', to: '/politics/legislation' },
  { label: 'Committees', to: '/politics/committees' },
  { label: 'Activity', to: '/politics/activity' },
  { label: 'Trades', to: '/politics/trades' },
  { label: 'Compare', to: '/politics/compare' },
  { label: 'Find Rep', to: '/politics/find-rep' },
  { label: 'Influence Loops', to: '/influence/closed-loops' },
];

const FINANCE_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/finance' },
  { label: 'Institutions', to: '/finance/institutions' },
  { label: 'Lobbying', to: '/finance/lobbying' },
  { label: 'Contracts', to: '/finance/contracts' },
  { label: 'Enforcement', to: '/finance/enforcement' },
  // Insider Trades, Market Movers, News, Complaints moved to WTP Research
  { label: 'Compare', to: '/finance/compare' },
];

const HEALTH_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/health' },
  { label: 'Companies', to: '/health/companies' },
  { label: 'Lobbying', to: '/health/lobbying' },
  { label: 'Contracts', to: '/health/contracts' },
  { label: 'Enforcement', to: '/health/enforcement' },
  // Pipeline + FDA Approvals moved to WTP Research
  { label: 'Compare', to: '/health/compare' },
];

const TECH_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/technology' },
  { label: 'Companies', to: '/technology/companies' },
  // Patents moved to WTP Research
  { label: 'Lobbying', to: '/technology/lobbying' },
  { label: 'Contracts', to: '/technology/contracts' },
  { label: 'Enforcement', to: '/technology/enforcement' },
  { label: 'Compare', to: '/technology/compare' },
];

export function PoliticsSectorHeader() {
  return <SectorHeader sector="politics" links={POLITICS_LINKS} />;
}

export function FinanceSectorHeader() {
  return <SectorHeader sector="finance" links={FINANCE_LINKS} />;
}

export function HealthSectorHeader() {
  return <SectorHeader sector="health" links={HEALTH_LINKS} />;
}

export function TechSectorHeader() {
  return <SectorHeader sector="technology" links={TECH_LINKS} />;
}

const ENERGY_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/energy' },
  { label: 'Companies', to: '/energy/companies' },
  { label: 'Lobbying', to: '/energy/lobbying' },
  { label: 'Contracts', to: '/energy/contracts' },
  { label: 'Enforcement', to: '/energy/enforcement' },
  { label: 'Compare', to: '/energy/compare' },
];

export function EnergySectorHeader() {
  return <SectorHeader sector="energy" links={ENERGY_LINKS} />;
}

const TRANSPORTATION_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/transportation' },
  { label: 'Companies', to: '/transportation/companies' },
  { label: 'Lobbying', to: '/transportation/lobbying' },
  { label: 'Contracts', to: '/transportation/contracts' },
  { label: 'Enforcement', to: '/transportation/enforcement' },
  { label: 'Compare', to: '/transportation/compare' },
];

export function TransportationSectorHeader() {
  return <SectorHeader sector="transportation" links={TRANSPORTATION_LINKS} />;
}

const DEFENSE_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/defense' },
  { label: 'Companies', to: '/defense/companies' },
  { label: 'Lobbying', to: '/defense/lobbying' },
  { label: 'Contracts', to: '/defense/contracts' },
  { label: 'Enforcement', to: '/defense/enforcement' },
  { label: 'Compare', to: '/defense/compare' },
];

export function DefenseSectorHeader() {
  return <SectorHeader sector="defense" links={DEFENSE_LINKS} />;
}

const VERIFY_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/verify' },
  { label: 'Submit', to: '/verify/submit' },
  { label: 'Methodology', to: '/verify/methodology' },
];

export function VerifySectorHeader() {
  return <SectorHeader sector="verify" links={VERIFY_LINKS} />;
}

const CHEMICALS_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/chemicals' },
  { label: 'Companies', to: '/chemicals/companies' },
  { label: 'Lobbying', to: '/chemicals/lobbying' },
  { label: 'Contracts', to: '/chemicals/contracts' },
  { label: 'Enforcement', to: '/chemicals/enforcement' },
  { label: 'Compare', to: '/chemicals/compare' },
];

export function ChemicalsSectorHeader() {
  return <SectorHeader sector="chemicals" links={CHEMICALS_LINKS} />;
}

const AGRICULTURE_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/agriculture' },
  { label: 'Companies', to: '/agriculture/companies' },
  { label: 'Lobbying', to: '/agriculture/lobbying' },
  { label: 'Contracts', to: '/agriculture/contracts' },
  { label: 'Enforcement', to: '/agriculture/enforcement' },
  { label: 'Compare', to: '/agriculture/compare' },
];

export function AgricultureSectorHeader() {
  return <SectorHeader sector="agriculture" links={AGRICULTURE_LINKS} />;
}

const TELECOM_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/telecom' },
  { label: 'Companies', to: '/telecom/companies' },
  { label: 'Lobbying', to: '/telecom/lobbying' },
  { label: 'Contracts', to: '/telecom/contracts' },
  { label: 'Enforcement', to: '/telecom/enforcement' },
  { label: 'Compare', to: '/telecom/compare' },
];

export function TelecomSectorHeader() {
  return <SectorHeader sector="telecom" links={TELECOM_LINKS} />;
}

const EDUCATION_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/education' },
  { label: 'Companies', to: '/education/companies' },
  { label: 'Lobbying', to: '/education/lobbying' },
  { label: 'Contracts', to: '/education/contracts' },
  { label: 'Enforcement', to: '/education/enforcement' },
  { label: 'Compare', to: '/education/compare' },
];

export function EducationSectorHeader() {
  return <SectorHeader sector="education" links={EDUCATION_LINKS} />;
}

const CIVIC_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Civic Hub', to: '/civic' },
  { label: 'Promises', to: '/civic/promises' },
  { label: 'Proposals', to: '/civic/proposals' },
  { label: 'Badges', to: '/civic/badges' },
  { label: 'Verify', to: '/civic/verify' },
];

export function CivicSectorHeader() {
  return <SectorHeader sector="civic" links={CIVIC_LINKS} />;
}
