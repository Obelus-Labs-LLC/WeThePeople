import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Footer from '../components/Footer';

const DATA_SOURCES = [
  { source: 'Senate LDA', dataType: 'Lobbying filings', sectors: 'All', frequency: 'Quarterly', notes: 'Filing-level data from the Senate Lobbying Disclosure Act database' },
  { source: 'USASpending.gov', dataType: 'Government contracts', sectors: 'All', frequency: 'Monthly', notes: 'Federal contracts only; award-level detail' },
  { source: 'Federal Register', dataType: 'Enforcement actions', sectors: 'All', frequency: 'Weekly', notes: 'Rules, notices, and enforcement actions' },
  { source: 'Congress.gov', dataType: 'Votes, bills', sectors: 'Politics', frequency: 'Daily', notes: 'House and Senate roll call votes, bill text and status' },
  { source: 'OpenFDA', dataType: 'Adverse events, recalls', sectors: 'Health', frequency: 'Monthly', notes: 'FAERS database for drug adverse event reports' },
  { source: 'ClinicalTrials.gov', dataType: 'Clinical trials', sectors: 'Health', frequency: 'Monthly', notes: 'Active and completed clinical trial registrations' },
  { source: 'SEC EDGAR', dataType: 'Insider trades, filings', sectors: 'Finance', frequency: 'Daily', notes: 'Form 4 insider transaction data' },
  { source: 'USPTO', dataType: 'Patents', sectors: 'Technology', frequency: 'Monthly', notes: 'Published patent grants via PatentsView API' },
  { source: 'EPA GHGRP', dataType: 'Emissions data', sectors: 'Energy', frequency: 'Annual', notes: 'Facility-level greenhouse gas reporting' },
];

const LIMITATIONS = [
  'Congressional trade data is sourced from STOCK Act financial disclosure filings. Some House financial disclosure PDFs are scanned images and could not be parsed (~6 filings).',
  'OpenSanctions entity checks (sanctions, PEP, watchlist) require an API key that may not be configured in all environments.',
  'Enforcement records may not be exhaustive. Some agencies publish enforcement data on inconsistent schedules.',
  'AI-generated summaries are available for votes and enforcement actions. Lobbying and contract summaries are pending due to cost constraints.',
  'Stock fundamental data (Alpha Vantage) is limited to 25 requests per day on the free tier, so coverage may be incomplete.',
];

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: 820,
  margin: '0 auto',
  padding: '48px 24px 80px',
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
  fontSize: 'clamp(40px, 6vw, 56px)',
  lineHeight: 1.02,
  color: 'var(--color-text-1)',
  marginBottom: 12,
};

const leadStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 16,
  color: 'var(--color-text-2)',
  lineHeight: 1.6,
  marginBottom: 48,
  maxWidth: 620,
};

const sectionHeading: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--color-text-1)',
  marginBottom: 14,
};

const bodyText: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  color: 'var(--color-text-2)',
  lineHeight: 1.65,
  marginBottom: 12,
};

const mutedNote: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  color: 'var(--color-text-3)',
  marginBottom: 16,
};

const tableHeaderStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  textAlign: 'left',
  padding: '12px 14px',
  borderBottom: '1px solid var(--color-border)',
};

const tableCellMono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 12,
  color: 'var(--color-text-1)',
  padding: '12px 14px',
  whiteSpace: 'nowrap',
};

const tableCell: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  color: 'var(--color-text-2)',
  padding: '12px 14px',
  lineHeight: 1.45,
};

export default function MethodologyPage() {
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

        <h1 style={titleStyle}>Methodology</h1>
        <p style={leadStyle}>
          How WeThePeople collects, processes, and presents public accountability data across eleven sectors.
        </p>

        {/* Overview */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>Overview</h2>
          <p style={bodyText}>
            WeThePeople aggregates publicly available government data to illuminate the connections between industry and politics. The platform tracks lobbying expenditures, government contracts, enforcement actions, insider trading, and other data across eleven sectors: Politics, Finance, Health, Technology, Energy, Transportation, Defense, Chemicals, Agriculture, Telecommunications, and Education.
          </p>
          <p style={bodyText}>
            Every sector is recontextualized through a political influence lens. Rather than duplicating financial data portals, the platform focuses on answering: who is spending money to influence government, who is receiving government money, and who is being held accountable.
          </p>
          <p style={bodyText}>
            All data is sourced from official government APIs and public records. No data is behind paywalls, and no proprietary analysis or scoring is applied. The raw records are linked to their original sources so users can verify every data point.
          </p>
        </section>

        {/* Data Sources Table */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>Data sources</h2>
          <p style={mutedNote}>
            All data is sourced from official U.S. government APIs and public databases.
          </p>
          <div
            style={{
              overflowX: 'auto',
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  <th style={tableHeaderStyle}>Source</th>
                  <th style={tableHeaderStyle}>Data type</th>
                  <th style={tableHeaderStyle}>Sectors</th>
                  <th style={tableHeaderStyle}>Frequency</th>
                  <th style={tableHeaderStyle}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {DATA_SOURCES.map((row, idx) => (
                  <tr
                    key={row.source}
                    style={{
                      borderTop: idx === 0 ? 'none' : '1px solid var(--color-border)',
                    }}
                  >
                    <td style={tableCellMono}>{row.source}</td>
                    <td style={tableCell}>{row.dataType}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 10,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: 'var(--color-accent-text)',
                          background: 'var(--color-accent-dim)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 999,
                          padding: '3px 10px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.sectors}
                      </span>
                    </td>
                    <td style={{ ...tableCellMono, color: 'var(--color-text-3)' }}>{row.frequency}</td>
                    <td style={{ ...tableCell, color: 'var(--color-text-3)', maxWidth: 260 }}>{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Known Limitations */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>Known limitations</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {LIMITATIONS.map((item, idx) => (
              <li
                key={idx}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    marginTop: 8,
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: 'var(--color-accent)',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    color: 'var(--color-text-2)',
                    lineHeight: 1.6,
                  }}
                >
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Disclaimer */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>Disclaimer</h2>
          <div
            style={{
              padding: 20,
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}
          >
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: 'var(--color-text-2)',
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              This platform aggregates publicly available data from U.S. government sources. We do not create or verify the underlying records. Data accuracy depends on the originating agencies. This platform is for informational purposes only and does not constitute financial, legal, or investment advice. Use of this site does not create any professional relationship.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section>
          <h2 style={sectionHeading}>Questions or corrections</h2>
          <p style={bodyText}>
            If you find data discrepancies or have questions about our methodology, please open an issue on our{' '}
            <a
              href="https://github.com/Obelus-Labs-LLC/WeThePeople"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--color-accent-text)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
            >
              GitHub repository
            </a>
            . WeThePeople is open source and we welcome community contributions.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
