import React from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

// ── Public types ──

interface ResearchStat {
  label: string;
  value: string;
  icon?: LucideIcon;
  accent?: string;
}

// ── Shared animation variants ──

export const researchContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

export const researchItemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 120, damping: 22 },
  },
};

// ── Layout shell ──

interface ResearchToolLayoutProps {
  /** Section header component (e.g. <TechSectorHeader />). */
  sectorHeader?: React.ReactNode;
  /** Eyebrow pulse color token, e.g. 'var(--color-dem)'. Defaults to accent. */
  eyebrow: {
    label: string;
    color?: string;
  };
  /** H1 title */
  title: string;
  /** Supporting description beneath the title */
  description?: string;
  /** Accent color token (CSS var) used for eyebrow pulse / highlights */
  accent?: string;
  /** Stat cards rendered at the top of the page */
  stats?: ResearchStat[];
  /** Page loading state — shows skeleton shimmers */
  loading?: boolean;
  /** Error message if data fetch fails */
  error?: string | null;
  onRetry?: () => void;
  children: React.ReactNode;
}

export function ResearchToolLayout({
  sectorHeader,
  eyebrow,
  title,
  description,
  accent = 'var(--color-accent)',
  stats,
  loading = false,
  error,
  onRetry,
  children,
}: ResearchToolLayoutProps) {
  const pulseColor = eyebrow.color ?? accent;

  if (error) {
    return (
      <div style={pageStyle}>
        <DecorLayer />
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '18px', color: 'var(--color-red)', marginBottom: '8px' }}>
              {title} failed to load
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-text-3)' }}>{error}</p>
            <button
              onClick={onRetry ?? (() => window.location.reload())}
              style={{
                marginTop: '16px',
                padding: '8px 18px',
                borderRadius: '8px',
                border: '1px solid rgba(235,229,213,0.12)',
                background: accent,
                color: '#0A0A0F',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <DecorLayer accent={accent} />
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          margin: '0 auto',
          maxWidth: '1400px',
          padding: '48px 32px 64px',
        }}
      >
        <motion.div
          variants={researchContainerVariants}
          initial="hidden"
          animate="visible"
          style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}
        >
          <motion.div variants={researchItemVariants} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sectorHeader}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
              <span style={{ position: 'relative', display: 'inline-flex', height: '8px', width: '8px' }}>
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '999px',
                    background: pulseColor,
                    opacity: 0.45,
                    animation: 'research-ping 1.6s cubic-bezier(0,0,0.2,1) infinite',
                  }}
                />
                <span
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    height: '8px',
                    width: '8px',
                    borderRadius: '999px',
                    background: pulseColor,
                    boxShadow: `0 0 10px ${pulseColor}`,
                  }}
                />
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: pulseColor,
                }}
              >
                {eyebrow.label}
              </span>
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: 'clamp(40px, 5vw, 64px)',
                letterSpacing: '-0.02em',
                lineHeight: 1.02,
                color: 'var(--color-text-1)',
                margin: 0,
              }}
            >
              {title}
            </h1>
            {description && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '16px',
                  lineHeight: 1.6,
                  color: 'var(--color-text-3)',
                  margin: 0,
                  maxWidth: '640px',
                }}
              >
                {description}
              </p>
            )}
          </motion.div>

          {stats && stats.length > 0 && (
            <StatGrid stats={stats} loading={loading} accent={accent} />
          )}

          <motion.div variants={researchItemVariants}>{children}</motion.div>
        </motion.div>
      </div>

      <style>{`
        @keyframes research-ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        @keyframes research-shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──

function StatGrid({ stats, loading, accent }: { stats: ResearchStat[]; loading: boolean; accent: string }) {
  const cols = Math.min(Math.max(stats.length, 2), 4);
  return (
    <motion.div
      variants={researchContainerVariants}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '16px' }}
    >
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label + i}
          variants={researchItemVariants}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '14px',
            border: '1px solid rgba(235,229,213,0.08)',
            background: 'var(--color-surface)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            minHeight: '108px',
          }}
        >
          {loading ? (
            <div
              style={{
                flex: 1,
                background: 'linear-gradient(90deg, rgba(235,229,213,0.05) 0%, rgba(235,229,213,0.12) 50%, rgba(235,229,213,0.05) 100%)',
                backgroundSize: '200px 100%',
                animation: 'research-shimmer 1.4s ease-in-out infinite',
                borderRadius: '8px',
              }}
            />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-3)',
                  }}
                >
                  {stat.label}
                </span>
                {stat.icon && <stat.icon size={16} color="var(--color-text-3)" />}
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '28px',
                  fontWeight: 600,
                  color: stat.accent ?? 'var(--color-text-1)',
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </span>
            </>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── Shared styles ──

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
  position: 'relative',
};

function DecorLayer({ accent = 'var(--color-accent)' }: { accent?: string } = {}) {
  return (
    <div style={{ pointerEvents: 'none', position: 'fixed', inset: 0, zIndex: 0 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% -20%, ${accent} 0%, transparent 60%)`,
          opacity: 0.06,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(235,229,213,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(235,229,213,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.5,
        }}
      />
    </div>
  );
}

// ── Secondary building blocks ──

export function ResearchSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section variants={researchItemVariants} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--color-text-1)',
              margin: 0,
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--color-text-3)',
                margin: '6px 0 0',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

export function ResearchRowCard({
  children,
  accent,
  onClick,
  hoverable = true,
}: {
  children: React.ReactNode;
  accent?: string;
  onClick?: () => void;
  hoverable?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 18px',
        borderRadius: '12px',
        border: '1px solid rgba(235,229,213,0.08)',
        background: 'var(--color-surface)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.2s, background 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!hoverable) return;
        e.currentTarget.style.borderColor = accent ? `${accent}33` : 'rgba(235,229,213,0.18)';
      }}
      onMouseLeave={(e) => {
        if (!hoverable) return;
        e.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)';
      }}
    >
      {children}
    </div>
  );
}

export function ResearchEmptyState({ text, icon: Icon }: { text: string; icon?: LucideIcon }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        borderRadius: '14px',
        border: '1px dashed rgba(235,229,213,0.1)',
        background: 'var(--color-surface)',
      }}
    >
      {Icon && <Icon size={40} color="var(--color-text-3)" style={{ marginBottom: '12px', opacity: 0.4 }} />}
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '14px',
          color: 'var(--color-text-3)',
          margin: 0,
        }}
      >
        {text}
      </p>
    </div>
  );
}
