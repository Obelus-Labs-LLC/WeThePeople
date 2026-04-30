import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';

/**
 * Public funding disclosure page.
 *
 * The point of this page is to commit to disclosure BEFORE money lands,
 * so the policy is documented and visible to funders, journalists, and
 * skeptical readers. As donations / grants / partnerships arrive, they
 * are logged here with date, amount or amount-tier, and any conditions.
 *
 * Placeholder state (current): the page describes the policy and shows
 * an empty disclosures list. As real funding lands, append entries to
 * the DISCLOSURES array. Eventually this can move to a JSON file or a
 * /admin route, but at our current scale a tracked array in source
 * control is the cleanest record.
 */

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
  fontWeight: 900,
  fontSize: 'clamp(36px, 5.5vw, 56px)',
  letterSpacing: '-0.025em',
  lineHeight: 1.05,
  color: 'var(--color-text-1)',
};
const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: '24px',
  letterSpacing: '-0.015em',
  color: 'var(--color-text-1)',
  marginTop: '2.25rem',
  marginBottom: '0.75rem',
};
const proseStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '16px',
  lineHeight: 1.75,
  color: 'var(--color-text-1)',
  marginBottom: '1rem',
};
const bulletItemStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '15px',
  lineHeight: 1.7,
  color: 'var(--color-text-1)',
  marginBottom: '0.6rem',
  display: 'flex',
  gap: 10,
};
const bulletDot: React.CSSProperties = {
  color: 'var(--color-accent-text)',
  flexShrink: 0,
  marginTop: 6,
  fontWeight: 700,
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

interface Disclosure {
  date: string;
  source: string;
  category: 'grant' | 'donation' | 'partnership' | 'fiscal_sponsorship';
  amount: string;
  conditions?: string;
}

const DISCLOSURES: Disclosure[] = [
  // Append entries here as funding lands. Format example:
  // {
  //   date: '2026-05-15',
  //   source: 'Knight Foundation Civic-Tech Rapid Response',
  //   category: 'grant',
  //   amount: '$10,000',
  //   conditions: 'No coverage restrictions; reporting due 2027-05',
  // },
];

export default function FundingPage() {
  usePageMeta({
    title: 'Funding Disclosure — The Influence Journal',
    description:
      'How WeThePeople is funded, our independence commitments, and a public log of every funding source.',
    canonical: 'https://journal.wethepeopleforus.com/about/funding',
  });

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-10 sm:py-16"
      style={{ color: 'var(--color-text-1)' }}
    >
      <article className="max-w-[720px] mx-auto">
        <Link
          to="/about"
          className="inline-flex items-center gap-1.5 mb-8"
          style={backLinkStyle}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = 'var(--color-text-1)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = 'var(--color-text-3)')
          }
        >
          <ArrowLeft size={12} />
          About
        </Link>

        <p className="mb-3" style={eyebrowStyle}>
          Editorial Policy
        </p>
        <h1 className="mb-6" style={h1Style}>
          Funding Disclosure
        </h1>

        <p style={proseStyle}>
          Independent journalism requires both money and independence
          from the money. We disclose every source of funding publicly,
          and we operate under explicit rules that prevent funders from
          shaping coverage. This page documents both.
        </p>

        <h2 style={h2Style}>Our independence commitments</h2>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {[
            'We accept no payment for coverage. We do not have advertisers.',
            'No single funding source will exceed 40% of our annual operating revenue.',
            'We will not accept funding that conditions coverage of any specific entity, party, or position.',
            'When a story involves an entity that is also a funder, partner, or formal contributor, that relationship is disclosed inline within the story.',
            'We disclose every funding source on this page within 30 days of receipt.',
            'We are pre-501(c)(3) and operate under fiscal sponsorship by Aspiration Tech (in progress as of April 2026). Our fiscal sponsor does not direct our editorial decisions.',
          ].map((line) => (
            <li key={line} style={bulletItemStyle}>
              <span aria-hidden style={bulletDot}>&#8226;</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <h2 style={h2Style}>What we will not accept</h2>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {[
            'Funding from any entity that we currently cover or expect to cover, where the funding could create a conflict of interest. This includes corporations whose lobbying or contracts we report on.',
            'Funding from political action committees, candidate committees, party committees, or 527 organizations.',
            'Funding from foreign governments or entities registered under the Foreign Agents Registration Act.',
            'Funding from anonymous sources. All funders are disclosed.',
            'Funding contingent on specific coverage outcomes or non-coverage of specific entities.',
          ].map((line) => (
            <li key={line} style={bulletItemStyle}>
              <span aria-hidden style={bulletDot}>&#8226;</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <h2 style={h2Style}>Funding sources</h2>
        {DISCLOSURES.length === 0 ? (
          <div
            style={{
              padding: '32px 24px',
              textAlign: 'center',
              borderRadius: '14px',
              border: '1px solid rgba(235,229,213,0.08)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-2)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              letterSpacing: '0.04em',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--color-text-3)',
                marginBottom: 12,
              }}
            >
              No funding sources to disclose
            </div>
            <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.65 }}>
              We have not yet accepted any external funding. Operating
              costs are currently covered out of pocket by the founder.
              When the first grant, donation, or fiscal-sponsorship
              transfer lands, this page will be updated within 30 days.
            </p>
          </div>
        ) : (
          <div className="space-y-3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {DISCLOSURES.map((d, i) => (
              <div
                key={i}
                style={{
                  padding: '18px 20px',
                  borderRadius: '12px',
                  border: '1px solid rgba(235,229,213,0.08)',
                  background: 'var(--color-surface)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-3)',
                    marginBottom: 6,
                  }}
                >
                  {d.date} · {d.category.replace(/_/g, ' ')}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 900,
                    fontSize: 18,
                    color: 'var(--color-text-1)',
                    marginBottom: 4,
                  }}
                >
                  {d.source}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 14,
                    color: 'var(--color-text-2)',
                  }}
                >
                  {d.amount}
                </div>
                {d.conditions && (
                  <div
                    style={{
                      marginTop: 6,
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      color: 'var(--color-text-3)',
                      fontStyle: 'italic',
                    }}
                  >
                    Conditions: {d.conditions}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <h2 style={h2Style}>How to fund this work</h2>
        <p style={proseStyle}>
          We accept individual donations, foundation grants, and research
          partnerships. To inquire about supporting WeThePeople, contact
          us at{' '}
          <a
            href="mailto:editor@wethepeopleforus.com"
            style={{
              color: 'var(--color-accent-text)',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            editor@wethepeopleforus.com
          </a>
          .
        </p>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-12">
          {[
            { label: 'Editorial Standards', to: '/standards' },
            { label: 'Methodology', to: '/methodology' },
            { label: 'Corrections', to: '/corrections' },
            { label: 'About', to: '/about' },
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
        </div>
      </article>
    </main>
  );
}
