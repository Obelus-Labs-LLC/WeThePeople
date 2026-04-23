import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Footer from '../components/Footer';
import { LEGAL_LAST_UPDATED } from '../config';

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
const lastUpdated: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 12,
  color: 'var(--color-text-3)',
  marginBottom: 32,
};
const sectionHeading: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--color-text-1)',
  marginTop: 28,
  marginBottom: 10,
};
const bodyText: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  lineHeight: 1.65,
  color: 'var(--color-text-2)',
  marginBottom: 12,
};
const listStyle: React.CSSProperties = {
  paddingLeft: 20,
  marginBottom: 12,
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  lineHeight: 1.75,
  color: 'var(--color-text-2)',
};

export default function PrivacyPolicyPage() {
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

        <h1 style={titleStyle}>Privacy policy</h1>
        <p style={lastUpdated}>Last updated: {LEGAL_LAST_UPDATED}</p>

        <section>
          <h2 style={sectionHeading}>1. Information we collect</h2>
          <p style={bodyText}>
            WeThePeople is a civic transparency platform. We do not require user accounts or collect personal information to use the site. We may collect:
          </p>
          <ul style={listStyle}>
            <li>
              <strong style={{ color: 'var(--color-text-1)', fontWeight: 600 }}>Usage data:</strong>{' '}
              Anonymous page views, navigation patterns, and feature usage through standard web analytics.
            </li>
            <li>
              <strong style={{ color: 'var(--color-text-1)', fontWeight: 600 }}>Technical data:</strong>{' '}
              Browser type, device type, and IP address for security and performance monitoring.
            </li>
          </ul>
        </section>

        <section>
          <h2 style={sectionHeading}>2. How we use information</h2>
          <p style={bodyText}>
            Any data collected is used solely to improve site performance, fix bugs, and understand which features are most valuable to users. We do not sell, rent, or share any data with third parties for marketing purposes.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>3. Cookies</h2>
          <p style={bodyText}>
            We may use essential cookies for site functionality. We do not use tracking cookies for advertising. Third-party services (such as our hosting provider) may set their own cookies subject to their privacy policies.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>4. Third-party data sources</h2>
          <p style={bodyText}>
            All data displayed on WeThePeople is sourced from publicly available government databases and APIs including Congress.gov, Senate LDA, USASpending.gov, SEC EDGAR, OpenFDA, USPTO, and others. We do not collect or store personal data about the public officials displayed — all information is a matter of public record.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>5. Data retention</h2>
          <p style={bodyText}>
            Analytics data is retained for up to 12 months and then deleted. We do not maintain user profiles or persistent identifiers.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>6. Your rights</h2>
          <p style={bodyText}>
            Since we do not collect personal information requiring accounts, there is no personal data to request, modify, or delete. If you have questions about your data, contact us at the address below.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>7. Contact</h2>
          <p style={bodyText}>
            For privacy-related inquiries, contact Obelus Labs LLC at{' '}
            <span style={{ color: 'var(--color-accent-text)' }}>privacy@obeluslabs.com</span>.
          </p>
        </section>
      </div>
      <Footer />
    </div>
  );
}
