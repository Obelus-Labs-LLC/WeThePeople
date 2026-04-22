/**
 * ToolHeader — Shared header for all research tool pages.
 * Renders: back link, eyebrow (accent-colored), Playfair italic title, description.
 */
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ToolHeaderProps {
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  /** Accent color token; defaults to research violet */
  accent?: string;
}

const backLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  textDecoration: 'none',
  transition: 'color 0.2s',
};

export function ToolHeader({
  eyebrow,
  title,
  description,
  accent = 'var(--color-research)',
}: ToolHeaderProps) {
  return (
    <div className="flex flex-col gap-4 mb-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5"
        style={backLinkStyle}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
      >
        <ArrowLeft size={12} />
        Back to Research Tools
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <span
            style={{
              height: 7,
              width: 7,
              borderRadius: '999px',
              background: accent,
              boxShadow: `0 0 10px ${accent}`,
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: accent,
            }}
          >
            {eyebrow}
          </span>
        </div>
        <h1
          className="mb-3"
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(36px, 5.5vw, 56px)',
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            color: 'var(--color-text-1)',
          }}
        >
          {title}
        </h1>
        <p
          className="max-w-2xl"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '16px',
            lineHeight: 1.7,
            color: 'var(--color-text-2)',
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

/** Consistent search input style for tool pages */
export const toolSearchInputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: '12px',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  padding: '14px 14px 14px 44px',
  fontFamily: 'var(--font-body)',
  fontSize: '15px',
  color: 'var(--color-text-1)',
  outline: 'none',
  transition: 'border-color 0.2s',
};

/** Card style for result rows */
export const resultCardStyle: React.CSSProperties = {
  borderRadius: '14px',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  padding: '20px 22px',
  transition: 'border-color 0.2s, background 0.2s',
};

/** Mono label style (stats, filter tags) */
export const monoLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
};
