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
const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '0.75rem',
  marginBottom: '1.5rem',
  fontFamily: 'var(--font-body)',
  fontSize: '14px',
  lineHeight: 1.6,
};
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '1px solid rgba(235,229,213,0.16)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  verticalAlign: 'top',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid rgba(235,229,213,0.06)',
  color: 'var(--color-text-1)',
  verticalAlign: 'top',
};
const tdMonoStyle: React.CSSProperties = {
  ...tdStyle,
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--color-text-2)',
  whiteSpace: 'nowrap',
};
const calloutStyle: React.CSSProperties = {
  border: '1px solid rgba(197,160,40,0.28)',
  background: 'rgba(197,160,40,0.04)',
  borderRadius: '10px',
  padding: '14px 18px',
  marginTop: '0.5rem',
  marginBottom: '1.5rem',
  fontFamily: 'var(--font-body)',
  fontSize: '14px',
  lineHeight: 1.7,
  color: 'var(--color-text-1)',
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
      'Public editorial standards for The Influence Journal, mapped explicitly to the SPJ Code of Ethics and AP guidelines on generative AI. How we verify, correct, disclose AI use, and stay independent.',
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
          Every claim in every story passes through Veritas, our verification
          engine. Veritas is a deterministic source-matching layer, not a
          language model. It performs structured comparisons of each claim
          against the underlying primary-source records: lookup by record ID
          where one is asserted, BM25 lexical matching against the originating
          government dataset where one is not, double-count detection across
          time windows, cross-record contradiction checks, source-tier scoring,
          and a cross-reference against our verified-fact vault. The engine
          does not generate text. It approves, rejects, or flags claims for
          editorial review based on whether the cited source supports them.
          Stories whose claims cannot be verified to at least our defined
          floor are not published. The verification methodology is publicly
          documented at <Link to="/verify-our-data" style={{ color: 'var(--color-accent-text)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>/verify-our-data</Link>.
        </p>

        <h2 style={h2Style}>Mapping to the SPJ Code of Ethics</h2>
        <p style={proseStyle}>
          The Society of Professional Journalists Code of Ethics is the
          working journalist's universal reference. Our standards above are
          designed to satisfy each of its four principles. We disclose where
          we differ from common practice, and where we are stricter.
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>SPJ principle</th>
              <th style={thStyle}>How we apply it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}><strong>Seek Truth and Report It.</strong> Take responsibility for the accuracy of work; verify before releasing; identify sources clearly.</td>
              <td style={tdStyle}>Every claim is matched against a primary-source record by Veritas before publication. Every figure carries its time window in the same sentence — multi-year totals are never presented as single-year figures. Every entity named in a story must be primary-source attested in a specific filing or document; entities inferred from sector classification are excluded.</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>Minimize Harm.</strong> Show compassion; weigh consequences of publication; balance public's need for information against potential harm.</td>
              <td style={tdStyle}>Investigative stories that name a specific company, official, or private individual receive a request for comment at least 24 hours before publication, listing the specific claims we intend to make. We do not publish private individuals' addresses, phone numbers, or family details. We use neutral, non-loaded language; we do not imply causation between donations and votes without explicit evidence.</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>Act Independently.</strong> Avoid conflicts; refuse gifts and favors that compromise integrity; disclose unavoidable conflicts.</td>
              <td style={tdStyle}>We accept no payment for coverage. We have no advertisers. Every funding source is published on our public funding-disclosure page as it is received. No single funding source will exceed 40% of our annual operating revenue. When a story involves an entity that is also a funder, contributor, or formal partner, that relationship is disclosed in the story.</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>Be Accountable and Transparent.</strong> Explain ethical choices; respond promptly to questions; acknowledge mistakes and correct them.</td>
              <td style={tdStyle}>Corrections are recorded on our public corrections page; we do not silently edit published stories and we do not remove stories from the archive when correcting or retracting them. Every story page carries a "Report an error" button. The verification engine is open source and the methodology is public. The complete data flow from primary source to platform to story is documented at /methodology.</td>
            </tr>
          </tbody>
        </table>
        <p style={{ ...proseStyle, fontSize: '14px', color: 'var(--color-text-3)' }}>
          Reference: <a href="https://www.spj.org/ethicscode.asp" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-text)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>SPJ Code of Ethics</a> (revised 2014).
        </p>

        <h2 style={h2Style}>Mapping to the AP guidelines on generative AI</h2>
        <p style={proseStyle}>
          The Associated Press's standards on the use of generative AI in news
          gathering and publishing set the bar for any newsroom that uses
          machine-generated content. Because portions of our story drafts are
          assembled by language models from structured data skeletons, we hold
          ourselves explicitly to AP's framework.
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>AP guideline</th>
              <th style={thStyle}>How we apply it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}><strong>Generative AI cannot be used to create publishable content without human review.</strong></td>
              <td style={tdStyle}>Every story passes through human editorial review before publication, regardless of how the draft was produced. The story queue is reviewed by an editor; algorithmic drafts are not auto-published. Our Twitter bot stays paused unless a human reviewer signs off on each story flagged for posting.</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>AI use must be disclosed to the audience.</strong></td>
              <td style={tdStyle}>Every story carries a label indicating how it was produced: "Algorithmically Generated" for template-driven data briefs, "AI-Enhanced" for stories where a language model wrote narrative prose from a structured skeleton, and "Human-Written" for stories drafted by a human reporter. The label appears on the story page above the byline, not buried in a footer.</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>The same editorial standards apply to AI-generated content as to human-written content.</strong></td>
              <td style={tdStyle}>Every standard on this page applies regardless of who or what produced the draft. The same time-window discipline, primary-source attestation, right-of-response, and verification floor apply to algorithmic and AI-enhanced stories. There is no separate, lower bar for machine-generated copy.</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>AI output is unreliable and may include fabrications; it must be verified against primary sources before publication.</strong></td>
              <td style={tdStyle}>Veritas runs against every claim in every draft before the editor sees it. Veritas itself is not a language model; it is a deterministic source-matching layer. If a draft contains a claim that cannot be matched to a primary-source record, that claim is removed or the story is held back for revision. We do not use language models to verify language-model output.</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>Do not enter confidential or unpublished material into AI tools.</strong></td>
              <td style={tdStyle}>Our story-generation pipeline operates exclusively on already-public data: federal lobbying disclosures, FEC filings, SEC EDGAR filings, FARA registrations, USASpending contracts, congressional roll-call votes, and similar public records. No private-source documents, embargoed material, or unpublished tips are sent to language model APIs.</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>Be cautious about AI-generated images and audio in news contexts.</strong></td>
              <td style={tdStyle}>We do not publish AI-generated images or audio. Story illustrations are either source-document screenshots, charts generated deterministically from our own data, or stock photography credited to its source.</td>
            </tr>
          </tbody>
        </table>
        <p style={{ ...proseStyle, fontSize: '14px', color: 'var(--color-text-3)' }}>
          Reference: <a href="https://www.ap.org/about/news-values-and-principles/standards-around-generative-ai/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-text)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>AP Standards Around Generative AI</a>.
        </p>

        <div style={calloutStyle}>
          <strong style={{ display: 'block', marginBottom: 6, fontFamily: 'var(--font-display)', fontSize: '15px' }}>
            A note on Veritas and the AP standard.
          </strong>
          AP's guidance is explicit: AI-generated output cannot itself verify
          AI-generated output. Veritas is built around that constraint. It does
          not call any language model. It performs structured lookups against
          primary-source datasets, BM25 lexical matching, and rule-based
          contradiction detection. The verification verdict on any given claim
          can be reproduced by re-running Veritas against the same inputs and
          will return the same result. This is a different category of system
          than an LLM-as-judge, and the distinction matters for any reader who
          is evaluating whether our verification is meaningful.
        </div>

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
            <span>2026-05-04: Added explicit mapping to the SPJ Code of Ethics and the AP guidelines on generative AI. Reframed Veritas as a deterministic source-matching layer (it is not a language model). Expanded the AI disclosure section.</span>
          </li>
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
