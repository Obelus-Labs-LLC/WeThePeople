import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Centered status page used for 404 "Not found", "Coming soon", and similar
 * utility screens. Matches the design in
 * `WTP Design - Legal, Utility & Auth.html`:
 *   - Optional art block above the header
 *   - Mono "ERROR NNN" string when a `code` is provided, else a Playfair-
 *     italic uppercase overline
 *   - Big italic Playfair title
 *   - Inter body copy (max 460px)
 *   - Row of up to two buttons, one primary gold + one ghost outline
 *
 * Pass either a `code` (shown as ERROR 404) or an `overline` (uppercase label
 * like "COMING SOON"). Buttons can be an internal route (<Link>), an external
 * URL (<a>), or an `onClick` handler.
 */
export type StatusAction = {
  label: string;
  primary?: boolean;
  to?: string;
  href?: string;
  onClick?: () => void;
};

export interface StatusPageProps {
  art?: React.ReactNode;
  code?: string;
  overline?: string;
  title: string;
  message: string;
  actions?: StatusAction[];
  footer?: React.ReactNode;
}

export default function StatusPage({
  art,
  code,
  overline,
  title,
  message,
  actions = [],
  footer,
}: StatusPageProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div style={{ maxWidth: 580, width: '100%', textAlign: 'center' }}>
        {art}

        {code ? (
          <div
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--color-accent-text)',
              letterSpacing: '0.1em',
              marginBottom: 10,
            }}
          >
            ERROR {code}
          </div>
        ) : overline ? (
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--color-accent-text)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 14,
            }}
          >
            {overline}
          </div>
        ) : null}

        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(34px, 5vw, 48px)',
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            color: 'var(--color-text-1)',
            marginBottom: 16,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            color: 'var(--color-text-2)',
            lineHeight: 1.6,
            marginBottom: 28,
            maxWidth: 460,
            margin: '0 auto 28px',
          }}
        >
          {message}
        </p>

        {actions.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            {actions.map((a, i) => {
              const baseStyle: React.CSSProperties = {
                padding: '11px 20px',
                borderRadius: 9,
                background: a.primary ? 'var(--color-accent)' : 'transparent',
                color: a.primary ? '#07090C' : 'var(--color-text-1)',
                border: a.primary
                  ? 'none'
                  : '1px solid var(--color-border-hover)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'none',
                display: 'inline-block',
              };
              if (a.to) {
                return (
                  <Link key={i} to={a.to} style={baseStyle}>
                    {a.label}
                  </Link>
                );
              }
              if (a.href) {
                return (
                  <a
                    key={i}
                    href={a.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={baseStyle}
                  >
                    {a.label}
                  </a>
                );
              }
              return (
                <button key={i} type="button" onClick={a.onClick} style={baseStyle}>
                  {a.label}
                </button>
              );
            })}
          </div>
        )}

        {footer && <div style={{ marginTop: 24 }}>{footer}</div>}
      </div>
    </div>
  );
}
