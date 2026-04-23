import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { SECTORS } from '../data/sectors';

const ComingSoonPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const sector = SECTORS.find((s) => s.slug === slug);

  if (!sector) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-bg)',
          color: 'var(--color-text-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(28px, 4vw, 36px)',
              color: 'var(--color-text-1)',
              marginBottom: 8,
            }}
          >
            Sector not found
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: 'var(--color-text-2)',
              marginBottom: 20,
            }}
          >
            We couldn't find the sector you're looking for.
          </p>
          <Link
            to="/"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
            }}
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          width: '100%',
          margin: '0 auto',
          padding: '48px 24px 80px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: 'var(--color-text-2)',
            textDecoration: 'none',
            marginBottom: 48,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
        >
          <ArrowLeft size={14} /> All sectors
        </Link>

        {/* Pill indicator */}
        <div
          style={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            alignItems: 'center',
            gap: 8,
            background: 'var(--color-accent-dim)',
            border: '1px solid var(--color-border)',
            borderRadius: 999,
            padding: '6px 14px',
            marginBottom: 16,
          }}
        >
          <Clock size={14} style={{ color: 'var(--color-accent-text)' }} />
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-text)',
            }}
          >
            Coming soon
          </span>
        </div>

        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(40px, 6vw, 64px)',
            lineHeight: 1.02,
            color: 'var(--color-text-1)',
            marginBottom: 8,
          }}
        >
          {sector.name}
        </h1>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 16,
            color: 'var(--color-text-2)',
            marginBottom: 32,
            lineHeight: 1.55,
          }}
        >
          {sector.tagline}
        </p>

        <div
          style={{
            padding: 24,
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            marginBottom: 24,
          }}
        >
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: 'var(--color-text-2)',
              lineHeight: 1.65,
              marginBottom: 12,
            }}
          >
            We're building transparency tools for the{' '}
            <span style={{ color: 'var(--color-text-1)', fontWeight: 500 }}>{sector.name}</span>{' '}
            sector. Our team is gathering public data sources, building connectors, and making real information accessible to everyone.
          </p>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-text-3)',
              lineHeight: 1.6,
            }}
          >
            Want to be notified when this sector launches? Stay tuned.
          </p>
        </div>

        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            alignItems: 'center',
            gap: 6,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-hover)',
            borderRadius: 10,
            padding: '10px 18px',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-text-1)',
            textDecoration: 'none',
            transition: 'background-color 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-surface)'; }}
        >
          ← Back to all sectors
        </Link>
      </div>
    </div>
  );
};

export default ComingSoonPage;
