import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Home, ArrowRight } from 'lucide-react';

// Primary sector destinations surfaced on the 404 page
const SECTOR_LINKS: Array<{ name: string; route: string; token: string }> = [
  { name: 'Politics', route: '/politics', token: 'var(--color-dem)' },
  { name: 'Finance', route: '/finance', token: 'var(--color-green)' },
  { name: 'Health', route: '/health', token: 'var(--color-red)' },
  { name: 'Technology', route: '/technology', token: 'var(--color-ind)' },
  { name: 'Energy', route: '/energy', token: 'var(--color-accent)' },
];

const NotFoundPage: React.FC = () => {
  const location = useLocation();

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
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        {/* 404 pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--color-accent-dim)',
            border: '1px solid var(--color-border)',
            borderRadius: 999,
            padding: '6px 14px',
            marginBottom: 24,
          }}
        >
          <Search size={14} style={{ color: 'var(--color-accent-text)' }} />
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-text)',
            }}
          >
            404 — page not found
          </span>
        </div>

        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(36px, 6vw, 56px)',
            lineHeight: 1.02,
            color: 'var(--color-text-1)',
            marginBottom: 12,
          }}
        >
          Nothing here
        </h1>
        <p
          style={{
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 12,
            color: 'var(--color-text-3)',
            marginBottom: 8,
            wordBreak: 'break-all',
          }}
        >
          {location.pathname}
        </p>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            color: 'var(--color-text-2)',
            marginBottom: 32,
            lineHeight: 1.6,
          }}
        >
          This page doesn't exist or may have been moved. Try one of the sectors below.
        </p>

        {/* Sector grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 10,
            marginBottom: 28,
          }}
        >
          {SECTOR_LINKS.map((s) => (
            <Link
              key={s.route}
              to={s.route}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: '12px 14px',
                textDecoration: 'none',
                transition: 'all 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: s.token,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--color-text-1)',
                }}
              >
                {s.name}
              </span>
              <ArrowRight size={14} style={{ color: 'var(--color-text-3)', marginLeft: 'auto' }} />
            </Link>
          ))}
        </div>

        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-accent-text)',
            textDecoration: 'none',
            transition: 'color 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
        >
          <Home size={14} />
          Back to home
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;
