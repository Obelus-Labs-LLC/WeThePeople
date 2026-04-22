import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ExternalLink, ArrowLeft, Newspaper, ArrowUpRight } from 'lucide-react';

const JOURNAL_BASE = 'https://journal.wethepeopleforus.com';

/**
 * Replaces the previous /stories and /stories/:slug routes.
 * The Journal site now hosts all published investigative stories —
 * this page lands users with a clear handoff CTA and passes any
 * slug through so deep links resolve on the Journal side.
 */
export default function MovedToJournalPage() {
  const { slug } = useParams<{ slug?: string }>();

  const journalUrl = slug ? `${JOURNAL_BASE}/stories/${slug}` : JOURNAL_BASE;
  const isDetail = Boolean(slug);

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
      <div style={{ maxWidth: 560, width: '100%' }}>
        <div
          style={{
            borderRadius: 16,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            padding: '44px 36px',
            textAlign: 'center',
          }}
        >
          {/* Icon badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'var(--color-accent-dim)',
              marginBottom: 20,
            }}
          >
            <Newspaper size={24} style={{ color: 'var(--color-accent-text)' }} />
          </div>

          {/* Pill badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--color-accent-dim)',
              border: '1px solid var(--color-border)',
              borderRadius: 999,
              padding: '6px 14px',
              marginBottom: 20,
            }}
          >
            <ArrowUpRight size={12} style={{ color: 'var(--color-accent-text)' }} />
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-accent-text)',
              }}
            >
              Moved to the Journal
            </span>
          </div>

          {/* Title */}
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(28px, 4vw, 40px)',
              lineHeight: 1.05,
              color: 'var(--color-text-1)',
              marginBottom: 12,
            }}
          >
            {isDetail ? 'Read this story on the Journal' : 'Stories live on the Journal'}
          </h1>

          {/* Description */}
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: 'var(--color-text-2)',
              lineHeight: 1.65,
              marginBottom: 28,
              maxWidth: 440,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Investigative stories, cross-sector exposes, and narrative analysis now live on{' '}
            <span style={{ color: 'var(--color-text-1)', fontWeight: 500 }}>The Journal</span>, our
            dedicated editorial platform. All data citations still resolve back to the main site.
          </p>

          {/* CTA */}
          <a
            href={journalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--color-accent)',
              color: '#07090C',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '12px 20px',
              borderRadius: 10,
              textDecoration: 'none',
              transition: 'opacity 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            {isDetail ? 'Open this story' : 'Open the Journal'}
            <ExternalLink size={14} />
          </a>

          {/* Slug echo */}
          {slug && (
            <div
              style={{
                marginTop: 20,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 11,
                color: 'var(--color-text-3)',
                letterSpacing: '0.02em',
                wordBreak: 'break-all',
              }}
            >
              /stories/{slug}
            </div>
          )}

          {/* Navigation links */}
          <div
            style={{
              marginTop: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: 'var(--color-text-3)',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-3)'; }}
            >
              <ArrowLeft size={12} />
              Back to home
            </Link>
            <span style={{ color: 'var(--color-border-hover)' }}>|</span>
            <Link
              to="/politics"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: 'var(--color-text-3)',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-3)'; }}
            >
              Browse sectors
            </Link>
          </div>
        </div>

        {/* Footnote */}
        <p
          style={{
            marginTop: 20,
            textAlign: 'center',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 10,
            color: 'var(--color-text-3)',
            letterSpacing: '0.04em',
          }}
        >
          journal.wethepeopleforus.com
        </p>
      </div>
    </div>
  );
}
