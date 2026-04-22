import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, SearchX, MapPin, Building2 } from 'lucide-react';
import CompanyLogo from '../CompanyLogo';
import type { SectorConfig } from './sectorConfig';

// ── Public types ──

export interface CompanyEntity {
  company_id: string;
  display_name: string;
  ticker?: string | null;
  headquarters?: string | null;
  logo_url?: string | null;
  sector_type: string;
}

export interface CompanyStat {
  label: string;
  value: number;
  accent?: string;
}

export interface SubSectorMeta {
  /** Raw sector_type key (lowercased). */
  key: string;
  /** Human-readable label for the pill. */
  label: string;
  /** Hex color for the pill/tag. */
  color: string;
}

// ── Shared styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
  position: 'relative',
};

const decorWrap: React.CSSProperties = {
  pointerEvents: 'none',
  position: 'fixed',
  inset: 0,
  zIndex: 0,
};

const contentWrap: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  maxWidth: '1400px',
  margin: '0 auto',
  padding: '40px 32px 96px',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(36px, 5.5vw, 60px)',
  lineHeight: 1.02,
  letterSpacing: '-0.02em',
  margin: '14px 0 14px',
  color: 'var(--color-text-1)',
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '15px',
  lineHeight: 1.65,
  color: 'var(--color-text-2)',
  margin: 0,
  maxWidth: '640px',
};

// ── Filter pill ──

function FilterPill({
  label,
  count,
  active,
  color,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        whiteSpace: 'nowrap',
        padding: '8px 14px',
        borderRadius: '999px',
        border: `1px solid ${active ? color : 'rgba(235,229,213,0.08)'}`,
        background: active ? `${color}18` : 'transparent',
        color: active ? color : 'var(--color-text-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = `${color}55`;
          e.currentTarget.style.color = color;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)';
          e.currentTarget.style.color = 'var(--color-text-3)';
        }
      }}
    >
      {label}
      <span
        style={{
          padding: '2px 8px',
          borderRadius: '999px',
          background: active ? `${color}30` : 'rgba(235,229,213,0.06)',
          color: active ? color : 'var(--color-text-3)',
          fontSize: '10px',
          fontWeight: 700,
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ── Company card ──

function CompanyCard<E extends CompanyEntity>({
  company,
  index,
  subMeta,
  stats,
  profilePath,
  accent,
  accentRGB,
}: {
  company: E;
  index: number;
  subMeta: SubSectorMeta;
  stats: CompanyStat[];
  profilePath: (id: string) => string;
  accent: string;
  accentRGB: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 18) * 0.02 }}
    >
      <Link
        to={profilePath(company.company_id)}
        style={{
          display: 'block',
          textDecoration: 'none',
          height: '100%',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          style={{
            position: 'relative',
            height: '100%',
            padding: '22px',
            borderRadius: '16px',
            border: `1px solid ${hovered ? `${accent}44` : 'rgba(235,229,213,0.08)'}`,
            background: 'var(--color-surface)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
            transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
            boxShadow: hovered
              ? `0 16px 40px rgba(${accentRGB},0.12)`
              : '0 2px 12px rgba(0,0,0,0.22)',
            overflow: 'hidden',
          }}
        >
          {/* Accent halo */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle at 80% -20%, rgba(${accentRGB},0.10), transparent 50%)`,
              opacity: hovered ? 1 : 0.5,
              transition: 'opacity 0.2s',
              pointerEvents: 'none',
            }}
          />

          {/* Top row: logo + sub-sector tag */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: '16px',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                background: `rgba(${accentRGB},0.06)`,
                border: `1px solid ${accent}22`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CompanyLogo
                id={company.company_id}
                name={company.display_name}
                logoUrl={company.logo_url ?? null}
                size={40}
                iconFallback
              />
            </div>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: `1px solid ${subMeta.color}40`,
                background: `${subMeta.color}15`,
                color: subMeta.color,
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
              }}
            >
              {subMeta.label}
            </span>
          </div>

          {/* Name + ticker */}
          <h3
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--color-text-1)',
              margin: '0 0 4px',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              position: 'relative',
            }}
          >
            {company.display_name}
          </h3>
          {company.ticker && (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: accent,
                margin: '0 0 10px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                position: 'relative',
              }}
            >
              {company.ticker}
            </p>
          )}

          {/* HQ */}
          {company.headquarters && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '18px',
                position: 'relative',
              }}
            >
              <MapPin size={12} color="var(--color-text-3)" style={{ flexShrink: 0 }} />
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  color: 'var(--color-text-3)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {company.headquarters}
              </span>
            </div>
          )}

          {/* Flex spacer */}
          <div style={{ flex: 1 }} />

          {/* Stats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
              gap: '10px',
              paddingTop: '14px',
              borderTop: '1px solid rgba(235,229,213,0.06)',
              position: 'relative',
            }}
          >
            {stats.map((stat) => (
              <div key={stat.label}>
                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-3)',
                    margin: '0 0 4px',
                  }}
                >
                  {stat.label}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: stat.accent ?? 'var(--color-text-1)',
                    margin: 0,
                  }}
                >
                  {stat.value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ── Main layout ──

interface SectorCompaniesLayoutProps<E extends CompanyEntity> {
  config: SectorConfig;
  title?: string;
  subtitle?: string;
  dataCredit?: string;
  entities: E[];
  loading: boolean;
  /** Map of sector_type (lowercased) -> { label, color } */
  subSectors: Record<string, { label: string; color: string }>;
  /** Render the 3 footer stats for a card */
  renderStats: (entity: E) => CompanyStat[];
  /** Used as the eyebrow verb, e.g. "Directory", "Explorer" */
  eyebrowVerb?: string;
}

export function SectorCompaniesLayout<E extends CompanyEntity>({
  config,
  title = 'Company Explorer',
  subtitle,
  dataCredit,
  entities,
  loading,
  subSectors,
  renderStats,
  eyebrowVerb = 'Directory',
}: SectorCompaniesLayoutProps<E>) {
  const Header = config.Header;
  const [searchParams] = useSearchParams();
  const initialSector = searchParams.get('sector')?.toLowerCase() || null;
  const [search, setSearch] = useState('');
  const [activeSector, setActiveSector] = useState<string | null>(initialSector);
  const [searchFocused, setSearchFocused] = useState(false);

  const subSectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const co of entities) {
      const key = (co.sector_type || '').toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [entities]);

  const subSectorRows = useMemo(
    () =>
      Object.entries(subSectorCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([key, count]) => ({
          key,
          count,
          label:
            subSectors[key]?.label ||
            key.toUpperCase().replace(/_/g, ' '),
          color: subSectors[key]?.color || config.accent,
        })),
    [subSectorCounts, subSectors, config.accent],
  );

  const filtered = useMemo(() => {
    let list = entities;
    if (activeSector) {
      list = list.filter((c) => (c.sector_type || '').toLowerCase() === activeSector);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.display_name.toLowerCase().includes(q) ||
          (c.ticker && c.ticker.toLowerCase().includes(q)) ||
          c.company_id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [entities, activeSector, search]);

  return (
    <main id="main-content" style={pageShell}>
      {/* Background decor */}
      <div style={decorWrap} aria-hidden>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at 50% -10%, ${config.accent} 0%, transparent 55%)`,
            opacity: 0.07,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at 50% 120%, var(--color-surface) 0%, transparent 70%)',
            opacity: 0.5,
          }}
        />
      </div>

      <Header />

      <div style={contentWrap}>
        {/* Eyebrow */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            marginTop: '24px',
          }}
        >
          <span
            style={{
              position: 'relative',
              display: 'inline-flex',
              width: '8px',
              height: '8px',
            }}
          >
            <span
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '999px',
                background: config.accent,
                opacity: 0.5,
                animation: 'tab-ping 1.4s ease-out infinite',
              }}
            />
            <span
              style={{
                position: 'relative',
                width: '8px',
                height: '8px',
                borderRadius: '999px',
                background: config.accent,
                boxShadow: `0 0 10px rgba(${config.accentRGB},0.55)`,
              }}
            />
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: config.accent,
            }}
          >
            {config.label} · {eyebrowVerb}
          </span>
        </div>

        {/* Title row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '12px',
          }}
        >
          <div>
            <h1 style={titleStyle}>{title}</h1>
            {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '6px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--color-text-3)',
              }}
            >
              Showing
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '24px',
                fontWeight: 700,
                color: config.accent,
                lineHeight: 1,
              }}
            >
              {filtered.length}
              <span
                style={{
                  fontSize: '14px',
                  color: 'var(--color-text-3)',
                  marginLeft: '6px',
                }}
              >
                / {entities.length}
              </span>
            </span>
            {dataCredit && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--color-text-3)',
                  marginTop: '4px',
                }}
              >
                DATA: {dataCredit}
              </span>
            )}
          </div>
        </div>

        {/* Search + filters */}
        <div style={{ margin: '28px 0 24px' }}>
          <div
            style={{
              position: 'relative',
              maxWidth: '480px',
              marginBottom: '16px',
            }}
          >
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: searchFocused ? config.accent : 'var(--color-text-3)',
                transition: 'color 0.2s',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search by name or ticker…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={{
                width: '100%',
                padding: '12px 14px 12px 42px',
                borderRadius: '10px',
                border: `1px solid ${searchFocused ? `${config.accent}55` : 'rgba(235,229,213,0.08)'}`,
                background: 'var(--color-surface)',
                color: 'var(--color-text-1)',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '4px',
            }}
          >
            <FilterPill
              label="All"
              count={entities.length}
              active={activeSector === null}
              color={config.accent}
              onClick={() => setActiveSector(null)}
            />
            {subSectorRows.map(({ key, count, label, color }) => (
              <FilterPill
                key={key}
                label={label}
                count={count}
                active={activeSector === key}
                color={color}
                onClick={() => setActiveSector(activeSector === key ? null : key)}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '96px 24px',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                border: `2px solid ${config.accent}`,
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--color-text-3)',
              }}
            >
              Loading companies…
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px 24px',
              gap: '12px',
              borderRadius: '16px',
              border: '1px solid rgba(235,229,213,0.06)',
              background: 'var(--color-surface)',
            }}
          >
            {entities.length === 0 ? (
              <Building2 size={40} color="var(--color-text-3)" />
            ) : (
              <SearchX size={40} color="var(--color-text-3)" />
            )}
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--color-text-3)',
                margin: 0,
              }}
            >
              {entities.length === 0
                ? `${config.label} sector data is not yet available.`
                : 'No companies match your filters.'}
            </p>
            {entities.length > 0 && (search || activeSector) && (
              <button
                onClick={() => {
                  setSearch('');
                  setActiveSector(null);
                }}
                style={{
                  marginTop: '8px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${config.accent}55`,
                  background: `rgba(${config.accentRGB},0.12)`,
                  color: config.accent,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}
          >
            {filtered.map((co, idx) => {
              const key = (co.sector_type || '').toLowerCase();
              const subMeta: SubSectorMeta = {
                key,
                label:
                  subSectors[key]?.label ||
                  key.toUpperCase().replace(/_/g, ' '),
                color: subSectors[key]?.color || config.accent,
              };
              return (
                <CompanyCard
                  key={co.company_id}
                  company={co}
                  index={idx}
                  subMeta={subMeta}
                  stats={renderStats(co)}
                  profilePath={config.profilePath}
                  accent={config.accent}
                  accentRGB={config.accentRGB}
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
