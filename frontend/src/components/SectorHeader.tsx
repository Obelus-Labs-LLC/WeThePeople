import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface NavLink {
  label: string;
  to: string;
}

interface SectorHeaderProps {
  sector: string;
  links: NavLink[];
}

const SECTOR_COLORS: Record<string, { bg: string; activeBg: string; activeText: string }> = {
  politics: { bg: 'bg-blue-500', activeBg: 'bg-blue-500/20', activeText: 'text-blue-400' },
  finance: { bg: 'bg-emerald-500', activeBg: 'bg-emerald-500/20', activeText: 'text-emerald-400' },
  health: { bg: 'bg-red-500', activeBg: 'bg-red-500/20', activeText: 'text-red-400' },
  technology: { bg: 'bg-violet-500', activeBg: 'bg-violet-500/20', activeText: 'text-violet-400' },
  energy: { bg: 'bg-orange-500', activeBg: 'bg-orange-500/20', activeText: 'text-orange-400' },
  transportation: { bg: 'bg-blue-500', activeBg: 'bg-blue-500/20', activeText: 'text-blue-400' },
};

export default function SectorHeader({ sector, links }: SectorHeaderProps) {
  const { pathname } = useLocation();
  const colors = SECTOR_COLORS[sector] || SECTOR_COLORS.politics;

  return (
    <nav className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-8">
      {/* Left: WP logo + sector name — links back to landing */}
      <Link to="/" className="flex items-center gap-2 no-underline shrink-0">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors.bg} font-heading text-sm font-black text-white`}>
          WP
        </div>
        <span className="font-heading text-lg font-bold text-white tracking-wide uppercase">
          {sector}
        </span>
      </Link>

      {/* Right: pill-style nav tabs — horizontal scroll on mobile */}
      <div className="flex items-center gap-1 overflow-x-auto flex-nowrap w-full sm:w-auto -mx-1 px-1 scrollbar-hide">
        {links.map((link) => {
          const active = link.to === '/'
            ? pathname === '/'
            : pathname === link.to || pathname.startsWith(link.to + '/');
          return (
            <Link
              key={link.label}
              to={link.to}
              className={`rounded-lg px-3 py-1.5 font-body text-sm font-medium transition-colors no-underline whitespace-nowrap shrink-0 ${
                active
                  ? `${colors.activeBg} ${colors.activeText}`
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ── Pre-configured sector headers ──

const POLITICS_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/politics' },
  { label: 'People', to: '/politics/people' },
  { label: 'Legislation', to: '/politics/legislation' },
  { label: 'Committees', to: '/politics/committees' },
  { label: 'Activity', to: '/politics/activity' },
  { label: 'Trades', to: '/politics/trades' },
  { label: 'Power', to: '/politics/power' },
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
  { label: 'Insider Trades', to: '/finance/insider-trades' },
  { label: 'Compare', to: '/finance/compare' },
];

const HEALTH_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/health' },
  { label: 'Companies', to: '/health/companies' },
  { label: 'Lobbying', to: '/health/lobbying' },
  { label: 'Contracts', to: '/health/contracts' },
  { label: 'Enforcement', to: '/health/enforcement' },
  { label: 'Pipeline', to: '/health/pipeline' },
  { label: 'Compare', to: '/health/compare' },
];

const TECH_LINKS: NavLink[] = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/technology' },
  { label: 'Companies', to: '/technology/companies' },
  { label: 'Patents', to: '/technology/patents' },
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
