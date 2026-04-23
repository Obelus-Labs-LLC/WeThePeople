import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SearchX, Building2, LayoutGrid, Rows } from 'lucide-react';
import CompanyLogo from '../CompanyLogo';
import type { SectorConfig } from './sectorConfig';
import { sectorCssVars } from '../../lib/sectorAccents';

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
  /** Short uppercase column header, e.g. "Lobbying" */
  label: string;
  /** Numeric value used for sort comparisons */
  value: number;
  /** Optional pre-formatted display string (e.g. "$52.4M"). Falls back to value.toLocaleString() */
  display?: string;
  /** Semantic hex override for this cell — if omitted, column position picks a default */
  accent?: string;
}

export interface SubSectorMeta {
  key: string;
  label: string;
  color: string;
}

// ── Design tokens (matches design HTML: Inner/Sector Pages) ──
// DBL blue / DRD red / T1 cream etc. Used only for opacity-suffix combos
// where CSS custom props can't carry alpha.
const DBL = '#4A7FDE';
const DRD = '#E05555';
const AMB = '#C5A028';
const T3 = 'rgba(235,229,213,0.22)';
const SURF = 'var(--color-surface)';
const SURF2 = 'var(--color-surface-2)';
const B = 'rgba(235,229,213,0.08)';

/** Position-based default colors for stat columns — matches the design HTML
 *  semantic palette (sector accent · blue · red/amber/muted). */
function defaultStatColor(index: number, value: number, sectorAccent: string): string {
  if (index === 0) return sectorAccent; // primary metric (usually lobbying/emissions)
  if (index === 1) return DBL;          // secondary metric (usually contracts)
  if (index === 2) {
    // enforcement-style: red when heavy, amber when moderate, muted otherwise
    if (value > 100) return DRD;
    if (value > 20) return AMB;
    return 'var(--color-text-2)';
  }
  return 'var(--color-text-2)';
}

// ── Styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
  position: 'relative',
};

const contentWrap: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  maxWidth: '1280px',
  margin: '0 auto',
  padding: '28px 40px 96px',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontWeight: 700,
  fontSize: 'clamp(24px, 3.2vw, 32px)',
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
  margin: '0 0 4px',
  color: 'var(--color-text-1)',
};

const trackedStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '13px',
  color: 'var(--color-text-3)',
  margin: 0,
};

// ── Inline toggle group ──

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  accent,
}: {
  options: Array<{ key: T; label: React.ReactNode; title?: string }>;
  value: T;
  onChange: (v: T) => void;
  accent: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        border: `1px solid ${B}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            title={opt.title}
            style={{
              padding: '7px 12px',
              border: 'none',
              cursor: 'pointer',
              background: active ? `${accent}1F` : 'transparent',
              color: active ? accent : 'var(--color-text-3)',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Table row ──

function TableRow<E extends CompanyEntity>({
  company,
  stats,
  subMeta,
  profilePath,
  accent,
  isLast,
  gridTemplate,
}: {
  company: E;
  stats: CompanyStat[];
  subMeta: SubSectorMeta;
  profilePath: (id: string) => string;
  accent: string;
  isLast: boolean;
  gridTemplate: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={profilePath(company.company_id)}
      style={{
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        padding: '14px 20px',
        borderBottom: isLast ? 'none' : `1px solid ${B}`,
        gap: 12,
        alignItems: 'center',
        cursor: 'pointer',
        textDecoration: 'none',
        color: 'var(--color-text-1)',
        background: hover ? SURF2 : 'transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Company: logo + name + ticker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${accent}14`,
            border: `1px solid ${accent}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          <CompanyLogo
            id={company.company_id}
            name={company.display_name}
            logoUrl={company.logo_url ?? null}
            size={28}
            iconFallback
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text-1)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {company.display_name}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              color: 'var(--color-text-3)',
              marginTop: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
            }}
          >
            {company.ticker && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: accent,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                }}
              >
                {company.ticker}
              </span>
            )}
            {company.ticker && company.headquarters && <span>·</span>}
            {company.headquarters && (
              <span
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {company.headquarters}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Metric cells */}
      {stats.map((s, i) => {
        const v = s.value ?? 0;
        return (
          <span
            key={s.label}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 700,
              color: s.accent ?? defaultStatColor(i, v, accent),
              whiteSpace: 'nowrap',
              textAlign: 'right',
            }}
          >
            {s.display ?? v.toLocaleString()}
          </span>
        );
      })}

      {/* Sub-sector tag — rightmost cell */}
      <span
        style={{
          justifySelf: 'end',
          padding: '3px 8px',
          borderRadius: 5,
          background: `${subMeta.color}18`,
          color: subMeta.color,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {subMeta.label}
      </span>
    </Link>
  );
}

// ── Grid card ──

function GridCard<E extends CompanyEntity>({
  company,
  stats,
  subMeta,
  profilePath,
  accent,
}: {
  company: E;
  stats: CompanyStat[];
  subMeta: SubSectorMeta;
  profilePath: (id: string) => string;
  accent: string;
}) {
  const [hover, setHover] = useState(false);

  return (
    <Link
      to={profilePath(company.company_id)}
      style={{
        display: 'block',
        padding: 18,
        borderRadius: 12,
        border: `1px solid ${hover ? 'rgba(235,229,213,0.14)' : B}`,
        background: hover ? SURF2 : SURF,
        textDecoration: 'none',
        color: 'var(--color-text-1)',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 10,
          gap: 10,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: `${accent}18`,
            border: `1px solid ${accent}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 700,
            color: accent,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <CompanyLogo
            id={company.company_id}
            name={company.display_name}
            logoUrl={company.logo_url ?? null}
            size={30}
            iconFallback
          />
        </div>
        <span
          style={{
            padding: '3px 8px',
            borderRadius: 5,
            background: `${subMeta.color}18`,
            color: subMeta.color,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {subMeta.label}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-text-1)',
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {company.display_name}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          color: 'var(--color-text-3)',
          marginBottom: 12,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        {company.ticker && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              color: accent,
              fontWeight: 600,
            }}
          >
            {company.ticker}
          </span>
        )}
        {company.ticker && company.headquarters && <span>·</span>}
        {company.headquarters && (
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {company.headquarters}
          </span>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
          gap: 10,
        }}
      >
        {stats.map((s, i) => {
          const v = s.value ?? 0;
          return (
            <div key={s.label}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: s.accent ?? defaultStatColor(i, v, accent),
                  lineHeight: 1,
                }}
              >
                {s.display ?? v.toLocaleString()}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 10,
                  color: 'var(--color-text-3)',
                  marginTop: 4,
                }}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </Link>
  );
}

// ── Main layout ──

interface SectorCompaniesLayoutProps<E extends CompanyEntity> {
  config: SectorConfig;
  /** Page title. Falls back to `{SectorLabel} Companies`. */
  title?: string;
  subtitle?: string;
  dataCredit?: string;
  entities: E[];
  loading: boolean;
  subSectors: Record<string, { label: string; color: string }>;
  renderStats: (entity: E) => CompanyStat[];
  /** Legacy prop, no longer rendered but kept so existing call sites compile. */
  eyebrowVerb?: string;
}

export function SectorCompaniesLayout<E extends CompanyEntity>({
  config,
  title,
  subtitle,
  dataCredit,
  entities,
  loading,
  subSectors,
  renderStats,
}: SectorCompaniesLayoutProps<E>) {
  const Header = config.Header;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSector = searchParams.get('sector')?.toLowerCase() || null;
  const [search, setSearch] = useState('');
  const [activeSector, setActiveSector] = useState<string | null>(initialSector);
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [sortIndex, setSortIndex] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);

  const resolvedTitle = title ?? `${config.label} Companies`;

  // Sub-sector counts for pill dropdown
  const subSectorRows = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const co of entities) {
      const key = (co.sector_type || '').toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([key, count]) => ({
        key,
        count,
        label: subSectors[key]?.label || key.toUpperCase().replace(/_/g, ' '),
        color: subSectors[key]?.color || config.accent,
      }));
  }, [entities, subSectors, config.accent]);

  // Filter
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

  // Sort: precompute stats once and sort by chosen index
  const sorted = useMemo(() => {
    const withStats = filtered.map((c) => ({ c, stats: renderStats(c) }));
    const clampIdx = Math.min(sortIndex, (withStats[0]?.stats.length ?? 1) - 1);
    withStats.sort((a, b) => {
      const av = a.stats[clampIdx]?.value ?? 0;
      const bv = b.stats[clampIdx]?.value ?? 0;
      return bv - av;
    });
    return withStats;
  }, [filtered, renderStats, sortIndex]);

  // Table grid template: company (1fr) + N metric cols (100px each) + tag (100px)
  const sampleStats = useMemo(() => (entities[0] ? renderStats(entities[0]) : []), [entities, renderStats]);
  const gridTemplate = useMemo(() => {
    const metricCols = sampleStats.map(() => '100px').join(' ');
    return `1fr ${metricCols} 100px`;
  }, [sampleStats]);

  const handleSectorChange = (key: string | null) => {
    setActiveSector(key);
    const sp = new URLSearchParams(searchParams);
    if (key) sp.set('sector', key);
    else sp.delete('sector');
    setSearchParams(sp, { replace: true });
  };

  return (
    <main id="main-content" style={{ ...pageShell, ...sectorCssVars(config.key) }}>
      <Header />

      <div style={contentWrap}>
        {/* Header row: title + toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={titleStyle}>{resolvedTitle}</h1>
            <p style={trackedStyle}>
              {filtered.length.toLocaleString()} of {entities.length.toLocaleString()} entities tracked
              {dataCredit ? ` · ${dataCredit}` : ''}
            </p>
            {subtitle && (
              <p
                style={{
                  ...trackedStyle,
                  marginTop: 8,
                  maxWidth: 640,
                  lineHeight: 1.5,
                  color: 'var(--color-text-2)',
                }}
              >
                {subtitle}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                background: SURF,
                border: `1px solid ${searchFocused ? `${config.accent}55` : B}`,
                borderRadius: 8,
                padding: '5px 10px',
                width: 200,
                transition: 'border-color 0.15s',
              }}
            >
              <Search
                size={12}
                style={{
                  color: searchFocused ? config.accent : 'var(--color-text-3)',
                  marginRight: 6,
                  flexShrink: 0,
                }}
              />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--color-text-1)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                }}
              />
            </div>

            {/* View toggle */}
            <ToggleGroup<'table' | 'grid'>
              options={[
                { key: 'table', label: <Rows size={14} />, title: 'Table view' },
                { key: 'grid', label: <LayoutGrid size={14} />, title: 'Grid view' },
              ]}
              value={view}
              onChange={setView}
              accent={config.accent}
            />

            {/* Sort toggle (only if we have stats) */}
            {sampleStats.length > 0 && (
              <ToggleGroup<string>
                options={sampleStats.map((s, i) => ({ key: String(i), label: s.label }))}
                value={String(sortIndex)}
                onChange={(v) => setSortIndex(Number(v))}
                accent={config.accent}
              />
            )}
          </div>
        </div>

        {/* Sub-sector filter pills (kept for usability — design HTML doesn't show them) */}
        {subSectorRows.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 8,
              marginBottom: 18,
            }}
          >
            <button
              type="button"
              onClick={() => handleSectorChange(null)}
              style={pillStyle(activeSector === null, config.accent)}
            >
              All <span style={pillCountStyle(activeSector === null, config.accent)}>{entities.length}</span>
            </button>
            {subSectorRows.map((r) => {
              const active = activeSector === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => handleSectorChange(active ? null : r.key)}
                  style={pillStyle(active, r.color)}
                >
                  {r.label}
                  <span style={pillCountStyle(active, r.color)}>{r.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <LoadingBlock accent={config.accent} />
        ) : sorted.length === 0 ? (
          <EmptyBlock
            hasAny={entities.length > 0}
            sectorLabel={config.label}
            accent={config.accent}
            onClear={() => {
              setSearch('');
              handleSectorChange(null);
            }}
            showClear={Boolean(search || activeSector)}
          />
        ) : view === 'table' ? (
          <div
            style={{
              background: SURF,
              border: `1px solid ${B}`,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: gridTemplate,
                padding: '10px 20px',
                borderBottom: `1px solid ${B}`,
                gap: 12,
              }}
            >
              <span style={headerCellStyle(false, config.accent)}>Company</span>
              {sampleStats.map((s, i) => {
                const active = sortIndex === i;
                return (
                  <span
                    key={s.label}
                    onClick={() => setSortIndex(i)}
                    style={{
                      ...headerCellStyle(active, config.accent),
                      textAlign: 'right',
                      cursor: 'pointer',
                    }}
                  >
                    {s.label}
                  </span>
                );
              })}
              <span style={{ ...headerCellStyle(false, config.accent), justifySelf: 'end' }}>Type</span>
            </div>
            {/* Rows */}
            {sorted.map(({ c, stats }, i) => {
              const key = (c.sector_type || '').toLowerCase();
              const subMeta: SubSectorMeta = {
                key,
                label: subSectors[key]?.label || key.toUpperCase().replace(/_/g, ' ') || '—',
                color: subSectors[key]?.color || config.accent,
              };
              return (
                <TableRow
                  key={c.company_id}
                  company={c}
                  stats={stats}
                  subMeta={subMeta}
                  profilePath={config.profilePath}
                  accent={config.accent}
                  isLast={i === sorted.length - 1}
                  gridTemplate={gridTemplate}
                />
              );
            })}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {sorted.map(({ c, stats }) => {
              const key = (c.sector_type || '').toLowerCase();
              const subMeta: SubSectorMeta = {
                key,
                label: subSectors[key]?.label || key.toUpperCase().replace(/_/g, ' ') || '—',
                color: subSectors[key]?.color || config.accent,
              };
              return (
                <GridCard
                  key={c.company_id}
                  company={c}
                  stats={stats}
                  subMeta={subMeta}
                  profilePath={config.profilePath}
                  accent={config.accent}
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

// ── Helper styles ──

function pillStyle(active: boolean, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    padding: '5px 10px',
    borderRadius: 999,
    border: `1px solid ${active ? color : B}`,
    background: active ? `${color}1F` : 'transparent',
    color: active ? color : 'var(--color-text-3)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };
}

function pillCountStyle(active: boolean, color: string): React.CSSProperties {
  return {
    padding: '1px 6px',
    borderRadius: 999,
    background: active ? `${color}33` : 'rgba(235,229,213,0.06)',
    color: active ? color : 'var(--color-text-3)',
    fontSize: 9,
    fontWeight: 700,
  };
}

function headerCellStyle(active: boolean, accent: string): React.CSSProperties {
  return {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: active ? accent : T3,
  };
}

// ── Loading / empty blocks ──

function LoadingBlock({ accent }: { accent: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        padding: '96px 24px',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: `2px solid ${accent}`,
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--color-text-3)',
        }}
      >
        Loading companies…
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyBlock({
  hasAny,
  sectorLabel,
  accent,
  onClear,
  showClear,
}: {
  hasAny: boolean;
  sectorLabel: string;
  accent: string;
  onClear: () => void;
  showClear: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '80px 24px',
        borderRadius: 16,
        border: `1px solid ${B}`,
        background: SURF,
      }}
    >
      {hasAny ? (
        <SearchX size={36} color="var(--color-text-3)" />
      ) : (
        <Building2 size={36} color="var(--color-text-3)" />
      )}
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          color: 'var(--color-text-3)',
          margin: 0,
        }}
      >
        {hasAny
          ? 'No companies match your filters.'
          : `${sectorLabel} sector data is not yet available.`}
      </p>
      {showClear && hasAny && (
        <button
          onClick={onClear}
          style={{
            marginTop: 4,
            padding: '7px 14px',
            borderRadius: 8,
            border: `1px solid ${accent}55`,
            background: `${accent}1F`,
            color: accent,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
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
  );
}
