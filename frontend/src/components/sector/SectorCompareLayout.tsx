import React, { useEffect, useState, useRef } from 'react';
import { ChevronDown, GitCompareArrows, Building2, type LucideIcon } from 'lucide-react';
import type { SectorConfig } from './sectorConfig';
import { sectorCssVars } from '../../lib/sectorAccents';

// ── Generic types ──

export interface CompareMetric {
  label: string;
  key: string;
  format: (v: number | null | undefined) => string;
  lowerIsBetter?: boolean;
}

export interface CompareMetricGroup {
  title: string;
  icon: LucideIcon;
  /** Design-token hex used for the group icon and section rule */
  iconColor?: string;
  metrics: CompareMetric[];
}

export interface CompareEntity {
  id: string;
  name: string;
  ticker?: string | null;
  subtitle?: string | null;
  logo?: string | null;
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

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  marginBottom: '8px',
};

// ── Entity Dropdown ──

function EntityDropdown({
  label,
  value,
  onChange,
  entities,
  excludeId,
  accent,
  accentRGB,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  entities: CompareEntity[];
  excludeId?: string;
  accent: string;
  accentRGB: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = entities.filter((ent) => {
    if (ent.id === excludeId) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return ent.name.toLowerCase().includes(q) || (ent.ticker?.toLowerCase().includes(q));
  });

  const selected = entities.find((e) => e.id === value);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <span style={fieldLabel}>{label}</span>
      <button
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if ((e.key === 'Enter' || e.key === ' ') && !open) {
            e.preventDefault();
            setOpen(true);
          }
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '12px 16px',
          borderRadius: '10px',
          border: '1px solid rgba(235,229,213,0.08)',
          background: 'var(--color-surface)',
          color: 'var(--color-text-1)',
          fontFamily: 'var(--font-body)',
          fontSize: '14px',
          textAlign: 'left',
          cursor: 'pointer',
          transition: 'border-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = `${accent}55`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)';
        }}
      >
        <span
          style={{
            color: selected ? 'var(--color-text-1)' : 'var(--color-text-3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {selected ? (
            <>
              {selected.name}
              {selected.ticker && (
                <span
                  style={{
                    marginLeft: '8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: accent,
                  }}
                >
                  {selected.ticker}
                </span>
              )}
            </>
          ) : (
            'Select…'
          )}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: 'var(--color-text-3)',
            flexShrink: 0,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            marginTop: '4px',
            borderRadius: '10px',
            border: '1px solid rgba(235,229,213,0.08)',
            background: 'var(--color-surface-2)',
            boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
            maxHeight: '288px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '8px', borderBottom: '1px solid rgba(235,229,213,0.05)' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or ticker…"
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(235,229,213,0.05)',
                background: 'var(--color-surface)',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--color-text-1)',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto' }} role="listbox">
            {filtered.length === 0 ? (
              <p
                style={{
                  padding: '12px 16px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  color: 'var(--color-text-3)',
                  margin: 0,
                }}
              >
                No results
              </p>
            ) : (
              filtered.map((ent) => {
                const isSelected = ent.id === value;
                return (
                  <button
                    key={ent.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(ent.id);
                      setOpen(false);
                      setSearch('');
                    }}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 16px',
                      border: 'none',
                      textAlign: 'left',
                      background: isSelected ? `rgba(${accentRGB},0.12)` : 'transparent',
                      color: 'var(--color-text-1)',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(235,229,213,0.04)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '14px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {ent.name}
                    </span>
                    {ent.ticker && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: accent,
                          flexShrink: 0,
                          marginLeft: '12px',
                        }}
                      >
                        {ent.ticker}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Winner logic ──

function getWinner<T>(
  metric: CompareMetric,
  a: T,
  b: T,
): 'a' | 'b' | null {
  const va = (a as unknown as Record<string, number | null>)[metric.key];
  const vb = (b as unknown as Record<string, number | null>)[metric.key];
  if (va == null || vb == null) return null;
  if (va === vb) return null;
  const higher = va > vb ? 'a' : 'b';
  return metric.lowerIsBetter ? (higher === 'a' ? 'b' : 'a') : higher;
}

// ── Entity identity card ──

function EntityCard({
  entity,
  accent,
  accentRGB,
}: {
  entity: CompareEntity;
  accent: string;
  accentRGB: string;
}) {
  return (
    <div
      style={{
        borderRadius: '14px',
        border: '1px solid rgba(235,229,213,0.08)',
        background: 'var(--color-surface)',
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '12px',
          background: `rgba(${accentRGB},0.08)`,
          border: `1px solid ${accent}22`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {entity.logo ? (
          <img
            src={entity.logo}
            alt={entity.name}
            style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'contain' }}
          />
        ) : (
          <Building2 size={24} color={accent} />
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '17px',
              fontWeight: 600,
              color: 'var(--color-text-1)',
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {entity.name}
          </h2>
          {entity.ticker && (
            <span
              style={{
                padding: '3px 10px',
                borderRadius: '999px',
                background: `rgba(${accentRGB},0.14)`,
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                color: accent,
                flexShrink: 0,
              }}
            >
              {entity.ticker}
            </span>
          )}
        </div>
        {entity.subtitle && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--color-text-3)',
              margin: 0,
              textTransform: 'capitalize',
            }}
          >
            {entity.subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main layout ──

interface SectorCompareLayoutProps<E extends { id: string; name: string }, C> {
  config: SectorConfig;
  title: string;
  subtitle: string;
  dataCredit?: string;
  footerNote?: string;
  /** Full list of entities in the sector */
  entities: E[];
  /** Compared entities (API response data) */
  compared: C[];
  /** Map a list entity to a display object for the dropdown */
  entityToDisplay: (e: E) => CompareEntity;
  /** Map a compared entity to a display object for the identity card */
  comparedToDisplay: (e: C) => CompareEntity;
  /** Metric groups to render as tables */
  metricGroups: CompareMetricGroup[];
  /** ID A selection */
  idA: string;
  /** ID B selection */
  idB: string;
  onChangeA: (id: string) => void;
  onChangeB: (id: string) => void;
  onCompare: () => void;
  loading: boolean;
  comparing: boolean;
  labelA?: string;
  labelB?: string;
  selectPlaceholder?: string;
}

export function SectorCompareLayout<
  E extends { id: string; name: string },
  C extends { id: string; name: string },
>({
  config,
  title,
  subtitle,
  dataCredit,
  footerNote,
  entities,
  compared,
  entityToDisplay,
  comparedToDisplay,
  metricGroups,
  idA,
  idB,
  onChangeA,
  onChangeB,
  onCompare,
  loading,
  comparing,
  labelA = 'Entity A',
  labelB = 'Entity B',
}: SectorCompareLayoutProps<E, C>) {
  const Header = config.Header;
  const entA = compared.find((c) => c.id === idA);
  const entB = compared.find((c) => c.id === idB);

  const dropdownEntities = entities.map(entityToDisplay);

  if (loading) {
    return (
      <div style={{ ...pageShell, ...sectorCssVars(config.key), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          role="status"
          style={{
            width: '32px',
            height: '32px',
            border: `2px solid ${config.accent}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <main id="main-content" style={{ ...pageShell, ...sectorCssVars(config.key) }}>
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
            background: 'radial-gradient(ellipse at 50% 120%, var(--color-surface) 0%, transparent 70%)',
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
          <span style={{ position: 'relative', display: 'inline-flex', width: '8px', height: '8px' }}>
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
            {config.label} · Compare
          </span>
        </div>

        {/* Title row with data credit */}
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
            <p style={subtitleStyle}>{subtitle}</p>
          </div>
          {dataCredit && (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--color-text-3)',
                margin: 0,
                paddingBottom: '6px',
              }}
            >
              DATA:{' '}
              <span style={{ color: 'var(--color-text-2)' }}>{dataCredit}</span>
            </p>
          )}
        </div>

        {/* Selector bar */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: '12px',
            margin: '28px 0',
            flexWrap: 'wrap',
          }}
        >
          <EntityDropdown
            label={labelA}
            value={idA}
            onChange={onChangeA}
            entities={dropdownEntities}
            excludeId={idB}
            accent={config.accent}
            accentRGB={config.accentRGB}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '44px',
              borderRadius: '999px',
              border: '1px solid rgba(235,229,213,0.08)',
              background: 'var(--color-surface)',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--color-text-3)',
              }}
            >
              VS
            </span>
          </div>

          <EntityDropdown
            label={labelB}
            value={idB}
            onChange={onChangeB}
            entities={dropdownEntities}
            excludeId={idA}
            accent={config.accent}
            accentRGB={config.accentRGB}
          />

          <button
            onClick={onCompare}
            disabled={!idA || !idB || idA === idB || comparing}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 24px',
              borderRadius: '10px',
              border: `1px solid ${config.accent}55`,
              background: `rgba(${config.accentRGB},0.14)`,
              color: config.accent,
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: !idA || !idB || idA === idB || comparing ? 'not-allowed' : 'pointer',
              opacity: !idA || !idB || idA === idB || comparing ? 0.4 : 1,
              transition: 'all 0.2s',
              height: '44px',
            }}
          >
            {comparing ? (
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  border: `2px solid ${config.accent}`,
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  display: 'inline-block',
                }}
              />
            ) : (
              <GitCompareArrows size={14} />
            )}
            Compare
          </button>
        </div>

        {/* Results */}
        {compared.length >= 2 && entA && entB ? (
          <>
            {/* Identity cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px',
                marginBottom: '32px',
              }}
            >
              <EntityCard
                entity={comparedToDisplay(entA)}
                accent={config.accent}
                accentRGB={config.accentRGB}
              />
              <EntityCard
                entity={comparedToDisplay(entB)}
                accent={config.accent}
                accentRGB={config.accentRGB}
              />
            </div>

            {/* Metric group sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              {metricGroups.map((group) => {
                const GroupIcon = group.icon;
                const iconColor = group.iconColor ?? config.accent;
                const dispA = comparedToDisplay(entA);
                const dispB = comparedToDisplay(entB);
                return (
                  <div key={group.title}>
                    {/* Section header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '14px',
                      }}
                    >
                      <GroupIcon size={14} color={iconColor} />
                      <h2
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 700,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                          color: 'var(--color-text-2)',
                          margin: 0,
                        }}
                      >
                        {group.title}
                      </h2>
                      <div
                        style={{
                          flex: 1,
                          height: '1px',
                          background: 'rgba(235,229,213,0.06)',
                        }}
                      />
                    </div>

                    {/* Table */}
                    <div
                      style={{
                        borderRadius: '14px',
                        border: '1px solid rgba(235,229,213,0.08)',
                        background: 'var(--color-surface)',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Column headers */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1.2fr 1fr 1fr',
                          padding: '12px 20px',
                          borderBottom: '1px solid rgba(235,229,213,0.05)',
                          background: 'rgba(235,229,213,0.02)',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            color: 'var(--color-text-3)',
                          }}
                        >
                          Metric
                        </span>
                        <span
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            color: 'var(--color-text-3)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {dispA.name}
                        </span>
                        <span
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            color: 'var(--color-text-3)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {dispB.name}
                        </span>
                      </div>

                      {/* Metric rows */}
                      {group.metrics.map((metric, idx) => {
                        const winner = getWinner(metric, entA, entB);
                        const valA = (entA as unknown as Record<string, number | null>)[metric.key];
                        const valB = (entB as unknown as Record<string, number | null>)[metric.key];
                        return (
                          <div
                            key={metric.key}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.2fr 1fr 1fr',
                              alignItems: 'center',
                              padding: '14px 20px',
                              borderBottom:
                                idx === group.metrics.length - 1
                                  ? 'none'
                                  : '1px solid rgba(235,229,213,0.04)',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(235,229,213,0.02)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <span
                              style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: '13px',
                                color: 'var(--color-text-2)',
                              }}
                            >
                              {metric.label}
                            </span>
                            <span
                              style={{
                                textAlign: 'center',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: winner === 'a' ? config.accent : 'var(--color-text-1)',
                              }}
                            >
                              {metric.format(valA)}
                            </span>
                            <span
                              style={{
                                textAlign: 'center',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: winner === 'b' ? config.accent : 'var(--color-text-1)',
                              }}
                            >
                              {metric.format(valB)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div
              style={{
                marginTop: '36px',
                paddingTop: '20px',
                borderTop: '1px solid rgba(235,229,213,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              {footerNote && (
                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--color-text-3)',
                    margin: 0,
                  }}
                >
                  {footerNote}
                </p>
              )}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--color-text-3)',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '999px',
                    background: config.accent,
                    display: 'inline-block',
                  }}
                />
                Winner
              </span>
            </div>
          </>
        ) : !comparing ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px 24px',
              borderRadius: '16px',
              border: '1px solid rgba(235,229,213,0.06)',
              background: 'var(--color-surface)',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <GitCompareArrows size={40} color="var(--color-text-3)" style={{ marginBottom: '12px' }} />
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  color: 'var(--color-text-3)',
                  margin: 0,
                }}
              >
                Pick two {config.entityKey === 'institutions' ? 'institutions' : 'companies'} above and hit Compare
              </p>
            </div>
          </div>
        ) : null}

        {comparing && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
            <div
              role="status"
              style={{
                width: '32px',
                height: '32px',
                border: `2px solid ${config.accent}`,
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes tab-ping {
          0% { transform: scale(0.9); opacity: 0.6; }
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}
