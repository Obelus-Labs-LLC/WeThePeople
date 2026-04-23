import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Footer from '../components/Footer';
import { LEGAL_LAST_UPDATED } from '../config';

// Shared tokens (kept inline to avoid new shared-component overhead)
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

export default function DisclaimerPage() {
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

        <h1 style={titleStyle}>Disclaimer</h1>
        <p style={lastUpdated}>Last updated: {LEGAL_LAST_UPDATED}</p>

        <section>
          <h2 style={sectionHeading}>General disclaimer</h2>
          <p style={bodyText}>
            WeThePeople is a civic transparency platform that aggregates publicly available data from government sources. The information presented on this site is for general informational purposes only and should not be construed as professional advice of any kind.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>Financial data</h2>
          <p style={bodyText}>
            Information about congressional stock trades, insider trading, stock fundamentals, and financial disclosures is sourced from public filings and third-party data providers. This data may be delayed, incomplete, or contain errors.{' '}
            <strong style={{ color: 'var(--color-text-1)', fontWeight: 600 }}>
              Nothing on this platform constitutes a recommendation to buy, sell, or hold any security.
            </strong>
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>Political data</h2>
          <p style={bodyText}>
            Voting records, legislative actions, lobbying disclosures, and campaign finance data are sourced from Congress.gov, the Senate Lobbying Disclosure Act database, the Federal Election Commission, and other official sources. We present this data as reported by these agencies without editorial judgment.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>Enforcement data</h2>
          <p style={bodyText}>
            Enforcement actions displayed on this platform are sourced from the Federal Register, SEC, FDA, EPA, FTC, and other regulatory agencies. The presence of an enforcement action does not imply guilt or wrongdoing — many enforcement proceedings result in settlements without admission of liability.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>Data sources</h2>
          <p style={bodyText}>We source data from the following public APIs and databases:</p>
          <ul style={listStyle}>
            <li>Congress.gov API (votes, bills, legislative actions)</li>
            <li>Senate Lobbying Disclosure Act API (lobbying filings)</li>
            <li>USASpending.gov (government contracts)</li>
            <li>Federal Register API (enforcement actions, regulations)</li>
            <li>SEC EDGAR (financial filings, insider trades)</li>
            <li>OpenFDA (adverse events, recalls, clinical trials)</li>
            <li>USPTO (patent data)</li>
            <li>EPA ECHO (environmental enforcement, emissions)</li>
            <li>Quiver Quantitative (congressional stock trades)</li>
            <li>AInvest (congressional trade filing delays)</li>
          </ul>
        </section>

        <section>
          <h2 style={sectionHeading}>No warranty</h2>
          <p style={bodyText}>
            This platform is provided "as is" without warranty of any kind. Obelus Labs LLC makes no representations about the accuracy, reliability, completeness, or timeliness of the content. Use at your own risk.
          </p>
        </section>
      </div>
      <Footer />
    </div>
  );
}
