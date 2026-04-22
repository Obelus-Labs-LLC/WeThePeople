import { Link } from 'react-router-dom';
import { ArrowLeft, Database, Shield, Eye, Bot, AlertTriangle, ArrowRight } from 'lucide-react';

// ── Shared styles for journal static pages ──────────────────────────
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
const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: 'var(--color-accent-text)',
};
const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(36px, 5.5vw, 56px)',
  letterSpacing: '-0.025em',
  lineHeight: 1.05,
  color: 'var(--color-text-1)',
};
const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: '26px',
  letterSpacing: '-0.015em',
  color: 'var(--color-text-1)',
};
const proseParagraph: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '16px',
  lineHeight: 1.8,
  color: 'var(--color-text-1)',
};
const cardStyle: React.CSSProperties = {
  borderRadius: '14px',
  border: '1px solid rgba(235,229,213,0.08)',
  background: 'var(--color-surface)',
  padding: '22px',
};
const pillButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '10px 18px',
  borderRadius: '10px',
  border: '1px solid rgba(235,229,213,0.12)',
  background: 'rgba(235,229,213,0.02)',
  color: 'var(--color-text-1)',
  textDecoration: 'none',
  transition: 'all 0.2s',
};

export default function AboutPage() {
  return (
    <main id="main-content" className="flex-1 px-4 py-10 sm:py-16" style={{ color: 'var(--color-text-1)' }}>
      <article className="max-w-[720px] mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 mb-8"
          style={backLinkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
        >
          <ArrowLeft size={12} />
          Back to Journal
        </Link>

        <p className="mb-3" style={eyebrowStyle}>About</p>
        <h1 className="mb-8" style={h1Style}>
          About The Influence Journal
        </h1>

        <div className="space-y-5 mb-14">
          <p style={proseParagraph}>
            The Influence Journal is the investigative arm of WeThePeople, a civic
            transparency platform that tracks how corporations lobby Congress, win
            government contracts, face enforcement actions, and donate to politicians
            across 11 sectors.
          </p>
          <p style={proseParagraph}>
            Every story published here is generated from public government records.
            We analyze data from Senate lobbying disclosures, USASpending.gov federal
            contracts, SEC filings, the Federal Register, FEC campaign finance reports,
            and dozens of other public databases to surface patterns of corporate
            influence that would otherwise remain buried in raw data.
          </p>
          <p
            style={{
              ...proseParagraph,
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: '22px',
              color: 'var(--color-text-1)',
              borderLeft: '3px solid var(--color-accent)',
              paddingLeft: 18,
            }}
          >
            Our goal is simple: follow the money from industry to politics.
          </p>
        </div>

        {/* AI Disclosure */}
        <h2 className="mb-6" style={h2Style}>How Stories Are Produced</h2>
        <div className="mb-14" style={cardStyle}>
          <div className="flex items-start gap-3">
            <Bot size={20} style={{ color: 'var(--color-accent-text)', flexShrink: 0, marginTop: 4 }} />
            <div className="space-y-3" style={{ ...proseParagraph, fontSize: '14px', lineHeight: 1.7, color: 'var(--color-text-2)' }}>
              <p>
                <strong style={{ color: 'var(--color-text-1)' }}>
                  Stories on The Influence Journal are generated using a combination of algorithmic pattern detection and AI.
                </strong>{' '}
                We believe in full transparency about this process:
              </p>
              <ol className="list-decimal list-inside space-y-2 ml-1">
                <li>
                  <strong style={{ color: 'var(--color-text-1)' }}>Pattern detection algorithms</strong> scan
                  public government databases for noteworthy patterns: lobbying spikes, contract windfalls,
                  enforcement gaps, stock trading overlaps with legislative activity, and more.
                </li>
                <li>
                  <strong style={{ color: 'var(--color-text-1)' }}>Structured skeletons</strong> are generated
                  algorithmically from the raw data, with every dollar amount, count, and date pulled directly
                  from government records.
                </li>
                <li>
                  <strong style={{ color: 'var(--color-text-1)' }}>AI narrative enhancement</strong> (using
                  Anthropic's Claude) may be used to transform structured data into readable prose. When used,
                  the AI is bound by strict rules: it cannot invent numbers, cannot editorialize, cannot accuse
                  anyone of wrongdoing, and must include legal disclaimers.
                </li>
                <li>
                  <strong style={{ color: 'var(--color-text-1)' }}>Automated fact-checking</strong> re-verifies
                  every key number against the source database before any story reaches the review queue.
                </li>
                <li>
                  <strong style={{ color: 'var(--color-text-1)' }}>Human editorial review</strong> is required
                  before any story is published. No story goes live automatically.
                </li>
              </ol>
              <p
                className="mt-3 pt-3"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  lineHeight: 1.6,
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-3)',
                  borderTop: '1px solid rgba(235,229,213,0.08)',
                }}
              >
                Each story's byline indicates how it was generated: "Algorithmically Generated" for pure
                template-based stories, or "AI-Enhanced" for stories where Claude was used for narrative prose.
                Our entire pipeline is{' '}
                <a
                  href="https://github.com/Obelus-Labs-LLC/WeThePeople"
                  style={{
                    color: 'var(--color-accent-text)',
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  open source
                </a>{' '}
                and auditable.
              </p>
            </div>
          </div>
        </div>

        {/* Principles */}
        <h2 className="mb-6" style={h2Style}>Our Principles</h2>
        <div className="grid gap-4 mb-14">
          {[
            {
              icon: Database,
              title: 'Data-First',
              description:
                'Every claim is backed by public government data. We cite our sources with direct links so you can verify every finding independently.',
            },
            {
              icon: Eye,
              title: 'Transparent Methodology',
              description:
                'Our data collection, analysis, and story generation pipeline is documented and open source. We publish our methodology so you know exactly how we work.',
            },
            {
              icon: Shield,
              title: 'No Editorial Opinions',
              description:
                'We present the data and let readers draw their own conclusions. Our stories contain facts and context, not opinions or partisan framing.',
            },
            {
              icon: Bot,
              title: 'AI Transparency',
              description:
                'Every story discloses whether it was algorithmically generated or AI-enhanced. We never hide the role of automation in our process.',
            },
            {
              icon: AlertTriangle,
              title: 'Corrections & Accountability',
              description:
                'When we get something wrong, we fix it publicly and promptly. All corrections, clarifications, and retractions are documented in our correction log.',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex gap-4" style={cardStyle}>
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    background: 'rgba(197,160,40,0.12)',
                    border: '1px solid rgba(197,160,40,0.28)',
                  }}
                >
                  <Icon size={20} style={{ color: 'var(--color-accent-text)' }} />
                </div>
                <div>
                  <h3
                    className="mb-1"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-1)',
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px',
                      lineHeight: 1.65,
                      color: 'var(--color-text-2)',
                    }}
                  >
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Data sources */}
        <h2 className="mb-4" style={h2Style}>Data Sources</h2>
        <p
          className="mb-5"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            lineHeight: 1.7,
            color: 'var(--color-text-2)',
          }}
        >
          Our investigations draw from 30+ public data sources across 11 sectors:
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 mb-14" style={{ listStyle: 'none', paddingLeft: 0 }}>
          {[
            'Senate LDA (Lobbying)',
            'USASpending.gov (Contracts)',
            'SEC EDGAR (Filings)',
            'Federal Register (Enforcement)',
            'FEC (Campaign Finance)',
            'Congress.gov (Legislation)',
            'House Financial Disclosures (Trades)',
            'OpenFDA (Health)',
            'USPTO PatentsView (Tech)',
            'EPA GHGRP (Emissions)',
            'NHTSA (Vehicle Safety)',
            'ClinicalTrials.gov (Health)',
          ].map((source) => (
            <li
              key={source}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                letterSpacing: '0.04em',
                color: 'var(--color-text-2)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <span
                aria-hidden
                style={{
                  color: 'var(--color-accent-text)',
                  marginTop: 1,
                  flexShrink: 0,
                }}
              >
                &#8226;
              </span>
              {source}
            </li>
          ))}
        </ul>

        {/* Links */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          {[
            { label: 'Coverage Balance', to: '/coverage' },
            { label: 'Corrections & Retractions', to: '/corrections' },
            { label: 'Verify Our Data', to: '/verify-our-data' },
          ].map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="inline-flex items-center gap-2"
              style={pillButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(197,160,40,0.35)';
                e.currentTarget.style.color = 'var(--color-accent-text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(235,229,213,0.12)';
                e.currentTarget.style.color = 'var(--color-text-1)';
              }}
            >
              {l.label}
              <ArrowRight size={12} />
            </Link>
          ))}
          {[
            { label: 'View Full Methodology', href: 'https://wethepeopleforus.com/methodology' },
            { label: 'Explore WeThePeople', href: 'https://wethepeopleforus.com' },
          ].map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="inline-flex items-center gap-2"
              style={pillButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(197,160,40,0.35)';
                e.currentTarget.style.color = 'var(--color-accent-text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(235,229,213,0.12)';
                e.currentTarget.style.color = 'var(--color-text-1)';
              }}
            >
              {l.label}
              <ArrowRight size={12} />
            </a>
          ))}
        </div>
      </article>
    </main>
  );
}
