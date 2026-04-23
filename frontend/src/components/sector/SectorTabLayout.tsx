import React from 'react';
import type { SectorConfig } from './sectorConfig';
import { sectorCssVars } from '../../lib/sectorAccents';

// ── Shared shell for the 3 per-sector tab pages (Lobbying, Contracts, Enforcement) ──

interface SectorTabLayoutProps {
  config: SectorConfig;
  /** Short uppercase label in accent color. e.g. "Lobbying Activity" */
  eyebrow: string;
  /** Big display title. e.g. "Finance Lobbying Breakdown" */
  title: string;
  /** One-line descriptive subtitle below the title. */
  subtitle: string;
  /** Optional CSVExport component rendered next to the subtitle. */
  rightSlot?: React.ReactNode;
  /** Optional error state — takes precedence over children when set. */
  error?: string | null;
  /** Optional label for the error retry banner ("lobbying data", "contracts", etc.) */
  errorLabel?: string;
  children?: React.ReactNode;
}

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

const eyebrowRow: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  marginTop: '24px',
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
  flex: 1,
};

// ── Component ──

export default function SectorTabLayout({
  config,
  eyebrow,
  title,
  subtitle,
  rightSlot,
  error,
  errorLabel = 'data',
  children,
}: SectorTabLayoutProps) {
  const Header = config.Header;

  if (error) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px', padding: '0 24px' }}>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '16px',
              color: 'var(--color-red)',
              margin: '0 0 8px',
            }}
          >
            Failed to load {errorLabel}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--color-text-3)',
              margin: '0 0 20px',
            }}
          >
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: `1px solid ${config.accent}33`,
              background: `${config.accent}1F`,
              color: config.accent,
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <main id="main-content" style={{ ...pageShell, ...sectorCssVars(config.key) }}>
      {/* Background decor — accent-tinted radial gradient from top */}
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
        {/* Eyebrow with pulse dot */}
        <div style={eyebrowRow}>
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
            {eyebrow}
          </span>
        </div>

        <h1 style={titleStyle}>{title}</h1>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '36px',
          }}
        >
          <p style={subtitleStyle}>{subtitle}</p>
          {rightSlot && <div style={{ flexShrink: 0 }}>{rightSlot}</div>}
        </div>

        {children}
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

// ── Shared primitives for tab pages ──

export const statCard: React.CSSProperties = {
  position: 'relative',
  padding: '20px',
  borderRadius: '14px',
  border: '1px solid rgba(235,229,213,0.08)',
  background: 'var(--color-surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  overflow: 'hidden',
};

export const statLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
};

export const statNumber: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '26px',
  fontWeight: 700,
  lineHeight: 1,
  color: 'var(--color-text-1)',
};

export const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(24px, 3vw, 32px)',
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
  color: 'var(--color-text-1)',
  margin: '0 0 6px',
};

export const sectionSubtitle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '13px',
  color: 'var(--color-text-3)',
  margin: '0 0 20px',
};

export const skeletonCard: React.CSSProperties = {
  height: '96px',
  borderRadius: '14px',
  background: 'var(--color-surface)',
  border: '1px solid rgba(235,229,213,0.06)',
  animation: 'tab-skeleton-pulse 1.4s ease-in-out infinite',
};

export const emptyState: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '80px 24px',
  borderRadius: '16px',
  border: '1px solid rgba(235,229,213,0.06)',
  background: 'var(--color-surface)',
  textAlign: 'center',
};
