import React, { useRef, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import SpotlightCard from '../SpotlightCard';

/**
 * Shared building blocks for sector dashboards — redesign (Apr 2026).
 *
 * Each sector dashboard (Finance, Health, Tech, Energy, Transportation,
 * Defense, Chemicals, Agriculture, Telecom, Education) composes these
 * same primitives so they all share the stat-card, sector-distribution,
 * sub-nav, and data-sources patterns from the design handoff, while
 * keeping their own domain data wiring.
 */

// ─────────────────────────────────────────────────────────────────────
// StatCard — surface bg, hover reveals 3px left accent bar
// ─────────────────────────────────────────────────────────────────────

export interface StatCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
  to: string;
  subLabel?: string;
}

export function StatCard({ label, value, icon: Icon, color, to, subLabel }: StatCardProps) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => navigate(to)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative w-full text-left focus:outline-none"
      style={{
        background: hovered ? 'var(--color-surface-2)' : 'var(--color-surface)',
        border: `1px solid ${hovered ? 'var(--color-border-hover)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: 24,
        cursor: 'pointer',
        transition: 'background 0.2s, border-color 0.2s',
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 3,
          height: '100%',
          background: color,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.2s',
        }}
      />
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-3)',
          }}
        >
          {label}
        </span>
        <Icon size={16} style={{ color, opacity: 0.6 }} />
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 36,
          fontWeight: 700,
          color: 'var(--color-text-1)',
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {subLabel && (
        <div
          style={{
            marginTop: 6,
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: 'var(--color-text-3)',
          }}
        >
          {subLabel}
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SectorHero — eyebrow + italic Playfair headline + italic sub + two CTAs
// ─────────────────────────────────────────────────────────────────────

export interface SectorHeroCTA {
  label: string;
  to: string;
  primary?: boolean;
  external?: boolean;
  badge?: string;
}

export interface SectorHeroProps {
  eyebrow: string;
  titleLine1: string;
  titleLine2?: string;
  titleAccent?: string;
  titleTrail?: string;
  sub: string;
  ctas: SectorHeroCTA[];
  rightSlot: React.ReactNode;
}

export function SectorHero({
  eyebrow, titleLine1, titleLine2, titleAccent, titleTrail, sub, ctas, rightSlot,
}: SectorHeroProps) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 32,
        marginBottom: 48,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="flex flex-col justify-center"
      >
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-text)',
            marginBottom: 16,
          }}
        >
          {eyebrow}
        </p>
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(40px, 5.5vw, 68px)',
            lineHeight: 1.0,
            letterSpacing: '-0.01em',
            color: 'var(--color-text-1)',
            margin: 0,
          }}
        >
          {titleLine1}
          {titleLine2 && (
            <>
              <br />
              {titleLine2}
            </>
          )}
          {titleAccent && (
            <>
              {' '}
              <span style={{ color: 'var(--color-accent-text)' }}>{titleAccent}</span>
            </>
          )}
          {titleTrail || '.'}
        </h1>
        <p
          style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 18,
            lineHeight: 1.5,
            color: 'var(--color-text-2)',
            marginTop: 20,
            maxWidth: 520,
          }}
        >
          {sub}
        </p>
        <div className="flex flex-wrap" style={{ gap: 12, marginTop: 28 }}>
          {ctas.map((cta) => {
            const style: React.CSSProperties = cta.primary
              ? {
                  gap: 8,
                  padding: '12px 20px',
                  borderRadius: 'var(--radius-card)',
                  background: 'var(--color-accent)',
                  color: '#07090C',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                }
              : {
                  gap: 8,
                  padding: '12px 20px',
                  borderRadius: 'var(--radius-card)',
                  background: 'transparent',
                  border: '1px solid var(--color-border-hover)',
                  color: 'var(--color-text-2)',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                };
            const body = (
              <>
                {cta.label}
                {cta.primary && <ArrowRight size={14} />}
                {cta.badge && (
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--color-research)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {cta.badge}
                  </span>
                )}
              </>
            );
            return cta.external ? (
              <a
                key={cta.label}
                href={cta.to}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center no-underline"
                style={style}
              >
                {body}
              </a>
            ) : (
              <Link
                key={cta.label}
                to={cta.to}
                className="inline-flex items-center no-underline"
                style={style}
              >
                {body}
              </Link>
            );
          })}
        </div>
      </motion.div>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}
      >
        {rightSlot}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SectorDistribution — stacked hairline bar + legend cards
// ─────────────────────────────────────────────────────────────────────

export interface SectorDistributionProps {
  title?: string;
  description?: string;
  bySector: Record<string, number>;
  total: number;
  getColor: (key: string) => string;
  getLabel: (key: string) => string;
  linkPrefix: string; // e.g. "/finance/companies?sector="
}

const distroContainerV = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const distroItemV = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 100, damping: 20 },
  },
};

export function SectorDistribution({
  title = 'Sector distribution',
  description = 'Breakdown of tracked companies by industry segment',
  bySector, total, getColor, getLabel, linkPrefix,
}: SectorDistributionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  const sectors = useMemo(
    () =>
      Object.entries(bySector)
        .map(([key, count]) => ({
          key,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count),
    [bySector, total],
  );

  return (
    <motion.div
      ref={ref}
      variants={distroContainerV}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="w-full"
    >
      <motion.div variants={distroItemV} style={{ marginBottom: 16 }}>
        <h2
          style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: 22,
            color: 'var(--color-text-1)',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: 'var(--color-text-3)',
            margin: '4px 0 0',
          }}
        >
          {description}
        </p>
      </motion.div>

      <motion.div
        variants={distroItemV}
        className="flex overflow-hidden"
        style={{ height: 10, borderRadius: 6, gap: 1 }}
      >
        {sectors.map((sector, idx) => (
          <motion.div
            key={sector.key}
            className="h-full"
            initial={{ width: 0, opacity: 0 }}
            animate={isInView ? { width: `${sector.percentage}%`, opacity: 1 } : { width: 0, opacity: 0 }}
            transition={{ duration: 1, delay: 0.15 + idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
            style={{ background: getColor(sector.key) }}
          />
        ))}
      </motion.div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginTop: 16,
        }}
      >
        {sectors.map((sector) => (
          <Link
            key={sector.key}
            to={`${linkPrefix}${encodeURIComponent(sector.key)}`}
            className="no-underline"
          >
            <motion.div
              variants={distroItemV}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <div className="flex items-center" style={{ gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: getColor(sector.key),
                  }}
                />
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-3)',
                  }}
                >
                  {getLabel(sector.key)}
                </span>
              </div>
              <div className="flex items-end" style={{ gap: 8 }}>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--color-text-1)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                  }}
                >
                  {sector.count}
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: 'var(--color-text-3)',
                    marginBottom: 2,
                  }}
                >
                  {sector.percentage.toFixed(1)}%
                </span>
              </div>
            </motion.div>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SectorDistributionCard — wraps SectorDistribution in a SpotlightCard
// ─────────────────────────────────────────────────────────────────────

export function SectorDistributionCard(props: SectorDistributionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      style={{ marginBottom: 48 }}
    >
      <SpotlightCard
        className=""
        spotlightColor="rgba(197, 160, 40, 0.08)"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ padding: 24 }}>
          <SectorDistribution {...props} />
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SubNavTiles — 4-tile row of category shortcuts
// ─────────────────────────────────────────────────────────────────────

export interface SubNavLink {
  to: string;
  label: string;
  desc: string;
  color: string;
  external?: boolean;
}

export function SubNavTiles({ links }: { links: SubNavLink[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.7 }}
      className="grid"
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        marginBottom: 48,
      }}
    >
      {links.map((link) => {
        const content = (
          <>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: link.color,
                margin: 0,
              }}
            >
              {link.label}
              {link.external && (
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--color-text-3)',
                    letterSpacing: 0,
                    marginLeft: 6,
                    textTransform: 'none',
                  }}
                >
                  ↗
                </span>
              )}
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: 'var(--color-text-3)',
                margin: '4px 0 0',
              }}
            >
              {link.desc}
            </p>
          </>
        );
        const tileStyle: React.CSSProperties = {
          display: 'block',
          padding: 18,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          transition: 'background 0.2s, border-color 0.2s',
        };
        return link.external ? (
          <a
            key={link.to}
            href={link.to}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline"
            style={tileStyle}
          >
            {content}
          </a>
        ) : (
          <Link key={link.to} to={link.to} className="no-underline" style={tileStyle}>
            {content}
          </Link>
        );
      })}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SectionHeading — italic Playfair h2 + right-aligned link
// ─────────────────────────────────────────────────────────────────────

export function SectionHeading({
  title, linkLabel, linkTo, external,
}: {
  title: string;
  linkLabel?: string;
  linkTo?: string;
  external?: boolean;
}) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
      <h2
        style={{
          fontFamily: "'Playfair Display', serif",
          fontStyle: 'italic',
          fontWeight: 700,
          fontSize: 22,
          color: 'var(--color-text-1)',
          letterSpacing: '-0.01em',
          margin: 0,
        }}
      >
        {title}
      </h2>
      {linkLabel && linkTo && (
        external ? (
          <a
            href={linkTo}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              color: 'var(--color-accent-text)',
            }}
          >
            {linkLabel} ↗
          </a>
        ) : (
          <Link
            to={linkTo}
            className="no-underline"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              color: 'var(--color-accent-text)',
            }}
          >
            {linkLabel} →
          </Link>
        )
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DataSourceList — bulleted list in a grid
// ─────────────────────────────────────────────────────────────────────

export function DataSourceList({ sources }: { sources: string[] }) {
  return (
    <div
      style={{
        marginTop: 48,
        paddingTop: 24,
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--color-text-3)',
        }}
      >
        Data sources
      </span>
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '10px 24px',
          marginTop: 14,
        }}
      >
        {sources.map((source) => (
          <div key={source} className="flex items-center" style={{ gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 2,
                background: 'var(--color-border-hover)',
              }}
            />
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--color-text-3)',
              }}
            >
              {source}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DashboardFooterStrip — back to sectors link + wordmark
// ─────────────────────────────────────────────────────────────────────

export function DashboardFooterStrip() {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        marginTop: 48,
        paddingTop: 18,
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <Link
        to="/"
        className="no-underline"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: 'var(--color-text-3)',
        }}
      >
        ← All sectors
      </Link>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: 'var(--color-text-3)',
          opacity: 0.4,
        }}
      >
        WeThePeople
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LoadingSpinner — shared across dashboards
// ─────────────────────────────────────────────────────────────────────

export function DashboardLoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-bg)' }}>
      <div
        className="animate-spin"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2px solid var(--color-border)',
          borderTopColor: 'var(--color-accent)',
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DashboardShellLayout — min-height bg wrapper + max-width container
// ─────────────────────────────────────────────────────────────────────

export function DashboardShellLayout({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {header}
      <div className="mx-auto" style={{ maxWidth: 1400, padding: '24px 32px 80px' }}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FeaturedCompanyRow — logo + name/ticker + sector chip
// ─────────────────────────────────────────────────────────────────────

export interface FeaturedCompanyItem {
  id: string;
  displayName: string;
  ticker?: string;
  sectorKey: string;
  logo: React.ReactNode;
  detailPath: string;
}

export function FeaturedCompanyRow({
  item,
  getSectorColor,
  getSectorLabel,
}: {
  item: FeaturedCompanyItem;
  getSectorColor: (key: string) => string;
  getSectorLabel: (key: string) => string;
}) {
  return (
    <Link
      to={item.detailPath}
      className="no-underline flex items-center"
      style={{
        gap: 14,
        padding: 14,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        transition: 'background 0.2s, border-color 0.2s',
      }}
    >
      {item.logo}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text-1)',
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.displayName}
        </p>
        {item.ticker && (
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: 'var(--color-text-3)',
              margin: '2px 0 0',
            }}
          >
            {item.ticker}
          </p>
        )}
      </div>
      <span
        style={{
          padding: '3px 8px',
          borderRadius: 'var(--radius-pill)',
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          background: 'var(--color-surface-2)',
          color: getSectorColor(item.sectorKey),
        }}
      >
        {getSectorLabel(item.sectorKey).toUpperCase()}
      </span>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────
// RecentActivityList — typed activity items with expand-on-click
// ─────────────────────────────────────────────────────────────────────

export interface ActivityItemShape {
  id: string | number;
  title: string;
  type: string;
  company_id?: string;
  company_name?: string;
  date?: string;
  description?: string;
  url?: string;
  meta?: {
    award_amount?: number;
    penalty_amount?: number;
    income?: number;
    patent_number?: string;
    num_claims?: number;
  } & Record<string, any>;
}

export interface RecentActivityListProps {
  items: ActivityItemShape[];
  typeBadges: Record<string, { bg: string; color: string }>;
  viewCompanyPathPrefix: string; // e.g. "/technology/" → `${prefix}${company_id}`
  accent: string; // for the view-company pill
  accentTint: string; // e.g. "rgba(155,127,204,0.12)"
  emptyMessage?: string;
  formatMoney: (n: number) => string;
}

export function RecentActivityList({
  items,
  typeBadges,
  viewCompanyPathPrefix,
  accent,
  accentTint,
  emptyMessage = 'No recent activity data available',
  formatMoney,
}: RecentActivityListProps) {
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  if (items.length === 0) {
    return (
      <SpotlightCard
        className=""
        spotlightColor="rgba(197, 160, 40, 0.08)"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: 'var(--color-text-3)',
              margin: 0,
            }}
          >
            {emptyMessage}
          </p>
        </div>
      </SpotlightCard>
    );
  }

  return (
    <SpotlightCard
      className=""
      spotlightColor="rgba(197, 160, 40, 0.08)"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((item, idx) => {
          const isExpanded = expandedId === item.id;
          const badge = typeBadges[item.type] || {
            bg: 'var(--color-surface-2)',
            color: 'var(--color-text-3)',
          };
          return (
            <button
              key={item.id}
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
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
                      fontWeight: 500,
                      color: 'var(--color-text-1)',
                      margin: 0,
                      overflow: isExpanded ? 'visible' : 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: isExpanded ? 'normal' : 'nowrap',
                    }}
                  >
                    {item.title}
                  </p>
                  <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background: badge.bg,
                        color: badge.color,
                      }}
                    >
                      {item.type}
                    </span>
                    {item.company_name && (
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10,
                          color: 'var(--color-text-3)',
                        }}
                      >
                        {item.company_name}
                      </span>
                    )}
                    {item.date && (
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10,
                          color: 'var(--color-text-3)',
                          opacity: 0.6,
                        }}
                      >
                        {item.date}
                      </span>
                    )}
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {item.description && (
                        <p
                          style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 12,
                            color: 'var(--color-text-2)',
                            lineHeight: 1.5,
                            margin: 0,
                          }}
                        >
                          {item.description}
                        </p>
                      )}
                      {item.meta?.award_amount != null && (
                        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--color-text-3)', margin: 0 }}>
                          Award: {formatMoney(item.meta.award_amount)}
                        </p>
                      )}
                      {item.meta?.penalty_amount != null && (
                        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--color-text-3)', margin: 0 }}>
                          Penalty: {formatMoney(item.meta.penalty_amount)}
                        </p>
                      )}
                      {item.meta?.income != null && (
                        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--color-text-3)', margin: 0 }}>
                          Income: {formatMoney(item.meta.income)}
                        </p>
                      )}
                      {item.meta?.patent_number && (
                        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--color-text-3)', margin: 0 }}>
                          Patent #{item.meta.patent_number}
                          {item.meta.num_claims ? ` (${item.meta.num_claims} claims)` : ''}
                        </p>
                      )}
                      <div className="flex items-center" style={{ gap: 8 }}>
                        {item.company_id && (
                          <Link
                            to={`${viewCompanyPathPrefix}${item.company_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="no-underline"
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: accentTint,
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 10,
                              color: accent,
                            }}
                          >
                            View company →
                          </Link>
                        )}
                        {item.url && (
                          <a
                            href={item.url}
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
                            Source →
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp size={12} style={{ color: 'var(--color-text-3)', flexShrink: 0 }} />
                ) : (
                  <ChevronDown size={12} style={{ color: 'var(--color-text-3)', flexShrink: 0 }} />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </SpotlightCard>
  );
}
