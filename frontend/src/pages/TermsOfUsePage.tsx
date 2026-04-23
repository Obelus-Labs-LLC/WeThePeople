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

export default function TermsOfUsePage() {
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

        <h1 style={titleStyle}>Terms of use</h1>
        <p style={lastUpdated}>Last updated: {LEGAL_LAST_UPDATED}</p>

        <section>
          <h2 style={sectionHeading}>1. Acceptance of terms</h2>
          <p style={bodyText}>
            By accessing or using WeThePeople ("the Service"), operated by Obelus Labs LLC, you agree to be bound by these Terms of Use. If you do not agree to these terms, do not use the Service.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>2. Nature of the Service</h2>
          <p style={bodyText}>
            WeThePeople is a civic transparency tool that aggregates publicly available data about government officials, lobbying activity, government contracts, enforcement actions, and related financial disclosures. The Service is provided for informational and educational purposes only.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>3. No financial or legal advice</h2>
          <p style={bodyText}>
            Nothing on this platform constitutes financial, investment, legal, or tax advice. Information about stock trades, lobbying expenditures, and government contracts is presented as-is from public sources. You should consult qualified professionals before making any financial or legal decisions.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>4. Data accuracy</h2>
          <p style={bodyText}>
            We make reasonable efforts to ensure data accuracy by sourcing from official government APIs and databases. However, we do not guarantee the completeness, accuracy, or timeliness of any data. Source data may contain errors, delays, or omissions from the originating agencies.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>5. Intellectual property</h2>
          <p style={bodyText}>
            The WeThePeople platform, including its design, code, and original content, is owned by Obelus Labs LLC. The underlying data is sourced from public records and is not owned by us. The platform source code is available under an open-source license on GitHub.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>6. Prohibited use</h2>
          <p style={bodyText}>
            You may not use the Service to: scrape data at scale without permission, misrepresent data or its sources, harass or defame any individual, or engage in any activity that violates applicable law.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>7. Limitation of liability</h2>
          <p style={bodyText}>
            Obelus Labs LLC shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of or inability to use the Service, or from any data inaccuracies or omissions.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>8. Changes to terms</h2>
          <p style={bodyText}>
            We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 style={sectionHeading}>9. Contact</h2>
          <p style={bodyText}>
            For questions about these terms, contact Obelus Labs LLC at{' '}
            <span style={{ color: 'var(--color-accent-text)' }}>legal@obeluslabs.com</span>.
          </p>
        </section>
      </div>
      <Footer />
    </div>
  );
}
