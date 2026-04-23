import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Footer from '../components/Footer';

// ─────────────────────────────────────────────────────────────────────
// Shared legal/content page tokens
// ─────────────────────────────────────────────────────────────────────

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  flex: 1,
  maxWidth: 780,
  width: '100%',
  margin: '0 auto',
  padding: '48px 24px 64px',
};

const backLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  color: 'var(--color-text-2)',
  textDecoration: 'none',
  marginBottom: 32,
  transition: 'color 150ms',
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(32px, 5vw, 48px)',
  lineHeight: 1.05,
  color: 'var(--color-text-1)',
  marginBottom: 8,
};

const sectionHeading: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--color-text-1)',
  marginTop: 32,
  marginBottom: 10,
};

const bodyText: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  lineHeight: 1.65,
  color: 'var(--color-text-2)',
  marginBottom: 12,
};

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div style={pageShell}>
      <div style={contentWrap}>
        <Link
          to="/"
          style={backLink}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
        >
          <ArrowLeft size={14} /> Back to Home
        </Link>

        {/* Logo + brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div
            style={{
              height: 48,
              width: 48,
              borderRadius: 12,
              background: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Inter', sans-serif",
              fontSize: 18,
              fontWeight: 900,
              color: '#07090C',
            }}
          >
            WP
          </div>
          <div>
            <h1 style={{ ...titleStyle, marginBottom: 2, fontSize: 'clamp(28px, 4vw, 36px)' }}>
              WeThePeople
            </h1>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-3)' }}>
              by Obelus Labs LLC
            </p>
          </div>
        </div>

        <section>
          <h2 style={sectionHeading}>Our mission</h2>
          <p style={bodyText}>
            WeThePeople is a civic transparency platform that follows the money from industry to politics. We aggregate public data across eleven sectors — politics, finance, health, technology, energy, transportation, defense, chemicals, agriculture, telecom, and education — and connect the dots between lobbying spend, government contracts, enforcement actions, and political activity.
          </p>
          <p style={bodyText}>
            Every data point on this platform is sourced from official government databases and public records. Every claim is verifiable. Every number links back to its source.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>Why this exists</h2>
          <p style={bodyText}>
            The data we present is already public. It's filed with the Senate, published by the SEC, reported to the FDA, and tracked by the EPA. But it's scattered across dozens of government websites, formatted inconsistently, and nearly impossible to cross-reference.
          </p>
          <p style={bodyText}>
            WeThePeople brings it all together in one place. When a pharmaceutical company spends millions lobbying Congress while receiving billions in government contracts, you should be able to see that. When a politician trades stocks in companies affected by legislation they're voting on, that should be visible too.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>Open source</h2>
          <p style={bodyText}>
            WeThePeople is fully open source. The entire codebase — frontend, backend, data sync jobs, and deployment configuration — is available on GitHub.
          </p>
          <a
            href="https://github.com/Obelus-Labs-LLC/WeThePeople"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
          >
            View on GitHub <ExternalLink size={13} />
          </a>
        </section>

        <section>
          <h2 style={sectionHeading}>Contact</h2>
          <p style={bodyText}>
            WeThePeople is built by{' '}
            <strong style={{ color: 'var(--color-text-1)', fontWeight: 600 }}>Obelus Labs LLC</strong>.
          </p>
          <p style={bodyText}>
            Website:{' '}
            <a
              href="https://wethepeopleforus.com"
              style={{ color: 'var(--color-accent-text)', textDecoration: 'none' }}
            >
              wethepeopleforus.com
            </a>
          </p>
        </section>
      </div>
      <Footer />
    </div>
  );
}
