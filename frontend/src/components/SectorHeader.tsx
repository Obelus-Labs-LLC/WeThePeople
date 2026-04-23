import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import Logo from './Logo';
import { SECTOR_ACCENTS } from '../lib/sectorAccents';

interface NavLink {
  label: string;
  to: string;
}

// ── Sector switcher data ──────────────────────────────────────────────
// One row per sector that appears in the switcher dropdown. Route is the
// sector dashboard; accent is pulled from the canonical SECTOR_ACCENTS
// palette so the color dot matches each sector's header/tint everywhere
// else in the app.
interface SectorEntry {
  key: string; // matches the `sector` prop passed to <SectorHeader />
  label: string;
  route: string;
}

const SECTOR_SWITCHER: SectorEntry[] = [
  { key: 'politics',       label: 'Politics',           route: '/politics' },
  { key: 'finance',        label: 'Finance',            route: '/finance' },
  { key: 'health',         label: 'Health',             route: '/health' },
  { key: 'technology',     label: 'Technology',         route: '/technology' },
  { key: 'energy',         label: 'Energy',             route: '/energy' },
  { key: 'transportation', label: 'Transportation',     route: '/transportation' },
  { key: 'defense',        label: 'Defense',            route: '/defense' },
  { key: 'chemicals',      label: 'Chemicals',          route: '/chemicals' },
  { key: 'agriculture',    label: 'Agriculture',        route: '/agriculture' },
  { key: 'telecom',        label: 'Telecommunications', route: '/telecom' },
  { key: 'education',      label: 'Education',          route: '/education' },
];

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
 * 52px bar with backdrop-blur, pinned at `top-[52px]` so it sits directly
 * under the global <EcosystemNav /> (which owns `top-0`). Left cluster is
 * the Logo + a *sector switcher button* — hover/click opens a dropdown
 * listing all 11 sectors so the user can jump from e.g. Finance → Defense
 * without a trip back to the landing grid. Right cluster is the familiar
 * underline-style nav tabs.
 *
 * Sibling sites (Verify / Research / Journal) re-skin by passing `accent`
 * + `mark`; the component itself stays sector-agnostic.
 */
function SectorHeader({
  sector,
  links,
  accent = 'var(--color-accent)',
  mark = 'WTP',
}: SectorHeaderProps) {
  const { pathname } = useLocation();

  // ── Sector switcher dropdown state ────────────────────────────────
  // Open on hover (desktop) OR click (touch). A 120ms close delay on
  // mouseleave prevents the menu from snapping shut when the cursor
  // traverses the 2px gap between button and menu.
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      cancelClose();
    };
  }, []);

  // Close the menu on route change (otherwise it lingers after the user
  // picks a sector and the new page mounts with the menu still open).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <nav
      className="sticky top-[52px] z-50 flex items-center justify-between overflow-visible mb-8"
      style={{
        height: 52,
        padding: '0 32px',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'rgba(7, 9, 12, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Left cluster — Logo + sector-switcher dropdown.
          The dropdown wrapper owns the hover intent so both the button
          and the menu share the same onMouseEnter/Leave boundary. */}
      <div
        ref={wrapperRef}
        className="flex items-center shrink-0 relative"
        style={{ gap: 12 }}
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
        <Link
          to="/"
          className="flex items-center no-underline shrink-0"
          style={{ gap: 12 }}
          aria-label="WeThePeople home"
        >
          <Logo size="sm" accent={accent} mark={mark} wordmark={null} />
        </Link>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center no-underline shrink-0 transition-colors"
          style={{
            gap: 6,
            padding: '6px 10px',
            background: open ? 'rgba(235,229,213,0.06)' : 'transparent',
            border: '1px solid transparent',
            borderRadius: 6,
            cursor: 'pointer',
            color: 'var(--color-text-1)',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {sector}
          <ChevronDown
            size={12}
            style={{
              transition: 'transform 0.15s',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              color: 'var(--color-text-3)',
            }}
          />
        </button>

        {/* Dropdown menu — shows all 11 sectors with their accent dot */}
        {open && (
          <div
            role="menu"
            aria-label="Switch sector"
            style={{
              position: 'absolute',
              top: 48,
              left: 0,
              minWidth: 220,
              background: 'rgba(13, 17, 23, 0.98)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              padding: 6,
              boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
              zIndex: 55,
            }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--color-text-3)',
                padding: '8px 10px 6px',
              }}
            >
              Switch sector
            </div>
            {SECTOR_SWITCHER.map((entry) => {
              const isCurrent = entry.key === sector;
              const dot = SECTOR_ACCENTS[entry.key]?.accent || accent;
              return (
                <Link
                  key={entry.key}
                  to={entry.route}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="no-underline flex items-center transition-colors"
                  style={{
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 6,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    fontWeight: isCurrent ? 600 : 500,
                    color: isCurrent ? 'var(--color-text-1)' : 'var(--color-text-2)',
                    background: isCurrent ? 'rgba(235,229,213,0.06)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = 'rgba(235,229,213,0.04)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: dot,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1 }}>{entry.label}</span>
                  {isCurrent && (
                    <span
                      aria-hidden
                      style={{
                        fontSize: 9,
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'var(--color-text-3)',
                      }}
                    >
                      Current
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: underline-style nav tabs */}
      <div
        className="flex items-center flex-nowrap shrink-0 overflow-x-auto scrollbar-hide"
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
