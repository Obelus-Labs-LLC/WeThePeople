import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';

/**
 * Editorial Standards page.
 *
 * This is the press-credential-grade existence proof: a public, dated,
 * specific statement of what The Influence Journal publishes, what it
 * refuses, how it corrects, and how it handles independence. State
 * press galleries and the Periodical Press Gallery look for this kind
 * of page when reviewing credential applications.
 *
 * Tone is intentionally formal and short. The audience here is press
 * gallery reviewers, funders, and skeptical readers, not the casual
 * disengaged user. Story pages and AboutPage carry the audience-
 * friendly framing of the same ideas.
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

export default function StandardsPage() {
  usePageMeta({
    title: 'Editorial Standards — The Influence Journal',
    description:
      'How The Influence Journal decides what to publish, how we verify, how we correct, and how we stay independent.',
    canonical: 'https://journal.wethepeopleforus.com/standards',
  });

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-10 sm:py-16"
      style={{ color: 'var(--color-text-1)' }}
    >
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

        <p className="mb-3" style={eyebrowStyle}>
          Editorial Policy
        </p>
        <h1 className="mb-6" style={h1Style}>
          Editorial Standards
        </h1>

        <p style={proseStyle}>
          The Influence Journal is the publishing arm of WeThePeople, an open civic
          transparency platform. Every story we publish is governed by the standards
          on this page. We update this page when our practices change; the change log
          appears at the bottom.
        </p>

        <h2 style={h2Style}>What we publish</h2>
        <p style={proseStyle}>
          We publish original reporting and data briefs that draw exclusively from
          public records: lobbying disclosures, federal contracts, congressional
          stock trades, foreign agent registrations, campaign finance filings,
          enforcement actions, roll call votes, and bill texts. Every claim links to
          its underlying source record. Where we make a join across multiple records,
          we link to all of them.
        </p>

        <h2 style={h2Style}>What we will not publish</h2>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {[
            'Stories that imply causation between donations and votes without explicit evidence of a causal relationship.',
            'Stories about entities whose identity in our database fails our entity-validation checks.',
            'Stories that depend on non-public sources we cannot link to or describe.',
            'Stories that endorse or oppose any specific candidate, party, or position.',
            'Stories generated by AI without human editorial review.',
            'Stories that name an individual or company without offering a documented opportunity to respond before publication when the story is investigative in nature.',
          ].map((line) => (
            <li key={line} style={bulletItemStyle}>
              <span aria-hidden style={bulletDot}>&#8226;</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <h2 style={h2Style}>How we verify</h2>
        <p style={proseStyle}>
          Every claim in every story passes through Veritas, our open-source
          verification engine. Veritas applies deterministic rule-based checks
          against the underlying data, including double-count detection,
          cross-record contradiction checks, source-tier scoring, and a
          cross-reference against our verified-fact vault. Stories whose claims
          cannot be verified to at least our defined floor are not published.
          The verification methodology is publicly documented and the engine is
          open source.
        </p>

        <h2 style={h2Style}>How we handle errors</h2>
        <p style={proseStyle}>
          When we discover an error in a published story, we correct it promptly
          and record the correction on our public corrections page. Corrections
          name what changed, why it changed, and when. If an error is severe
          enough that the story should not have been published, we retract the
          story and explain why. We do not silently edit published stories. We
          do not remove stories from the archive when we correct or retract them.
        </p>

        <h2 style={h2Style}>How we stay independent</h2>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {[
            'We accept no payment for coverage. We do not have advertisers.',
            'We disclose every funding source on our public funding disclosure page as it is received.',
            'No single funding source will exceed 40% of our annual operating revenue.',
            'We are pre-501(c)(3) and operate under fiscal sponsorship by Aspiration. Our fiscal sponsor does not direct our editorial decisions.',
            'We will not accept funding that conditions coverage of any specific entity, party, or position.',
            'When a story involves an entity that is also a funder, contributor, or formal partner, that relationship is disclosed in the story.',
          ].map((line) => (
            <li key={line} style={bulletItemStyle}>
              <span aria-hidden style={bulletDot}>&#8226;</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <h2 style={h2Style}>Right of response</h2>
        <p style={proseStyle}>
          For investigative stories that name a specific company, official, or
          private individual, we send a request for comment to that party at least
          24 hours before publication, listing the specific claims we intend to
          publish about them. Responses received before publication are reflected
          in the story. Responses received after publication are appended to the
          story as updates and dated.
        </p>

        <h2 style={h2Style}>AI disclosure</h2>
        <p style={proseStyle}>
          Every story carries a label indicating how it was produced:
          &ldquo;Algorithmically Generated&rdquo; for template-driven data briefs,
          &ldquo;AI-Enhanced&rdquo; for stories where a language model wrote
          narrative prose from a structured skeleton, and &ldquo;Human-Written&rdquo;
          for stories drafted by a human reporter. Every story passes through human
          editorial review before publication regardless of the production label.
        </p>

        <h2 style={h2Style}>Editorial governance</h2>
        <p style={proseStyle}>
          The Influence Journal currently operates under the editorial direction
          of Dshon Smith, founder of WeThePeople. We are recruiting an editorial
          advisory committee and will publish member names here as the committee
          forms. Our long-term plan is to spin out the journal under independent
          501(c)(3) status with a board of directors.
        </p>

        <h2 style={h2Style}>Reporting an error</h2>
        <p style={proseStyle}>
          Every story page includes a &ldquo;Report an error&rdquo; button. Reports
          go directly to the editorial team and are reviewed promptly. If you
          believe a story contains a factual error, that is the fastest path to a
          correction. You can also email{' '}
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

        <h2 style={h2Style}>Change log</h2>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          <li style={bulletItemStyle}>
            <span aria-hidden style={bulletDot}>&#8226;</span>
            <span>2026-04-28: Initial publication of editorial standards.</span>
          </li>
        </ul>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-12">
          {[
            { label: 'Methodology', to: '/methodology' },
            { label: 'Funding Disclosure', to: '/about/funding' },
            { label: 'Corrections', to: '/corrections' },
            { label: 'Verify Our Data', to: '/verify-our-data' },
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
