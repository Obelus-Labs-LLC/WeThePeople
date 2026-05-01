import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';

/**
 * Public methodology pages.
 *
 * Three sub-pages, served by the same component switching on the
 * `topic` route param:
 *   /methodology/detectors       — what each detector does, what it
 *                                  flags, what it doesn't
 *   /methodology/verification    — how Veritas verifies claims
 *   /methodology/corrections     — how we handle errors after
 *                                  publication
 *
 * Audience: press-credential reviewers, funders, journalists, and
 * skeptical readers. Tone is formal and specific — these pages stand
 * in for "show your work." Story pages and the audience-friendly
 * site copy live elsewhere.
 *
 * Plus a /methodology index page that links to all three.
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
const h3Style: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-text-1)',
  marginTop: '1.5rem',
  marginBottom: '0.5rem',
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

interface PageContent {
  eyebrow: string;
  title: string;
  metaDescription: string;
  body: React.ReactNode;
}

const PAGES: Record<string, PageContent> = {
  detectors: {
    eyebrow: 'Methodology',
    title: 'Story Detectors',
    metaDescription:
      'How WeThePeople detects newsworthy patterns in public records: the 13 detectors, what they flag, what they refuse to flag.',
    body: (
      <>
        <p style={proseStyle}>
          Every story published in The Influence Journal starts with one of
          thirteen pattern detectors. Each detector is a deterministic SQL
          query that scans public records for a specific structural signal.
          Detectors do not write narrative; they surface candidates. Stories
          are written from those candidates after passing verification and
          editorial review.
        </p>

        <h2 style={h2Style}>What each detector looks for</h2>

        <h3 style={h3Style}>Top spender</h3>
        <p style={proseStyle}>
          Identifies the largest lobbying spender in a sector that does not
          already have recent coverage. Filters by sector, deduplicates by
          filing UUID, and excludes entities already covered in the prior
          7 days.
        </p>

        <h3 style={h3Style}>Contract windfall</h3>
        <p style={proseStyle}>
          Identifies entities receiving an outsized share of federal
          contract value relative to sector peers. Validates that the
          contract-issuing agencies match the entity&apos;s sector to catch
          misattribution at the detection layer.
        </p>

        <h3 style={h3Style}>Penalty gap</h3>
        <p style={proseStyle}>
          Identifies entities that have substantial federal contract value
          and substantial lobbying spend but no recent enforcement actions
          against them. The signal is the gap, not an allegation.
        </p>

        <h3 style={h3Style}>Lobby-then-win</h3>
        <p style={proseStyle}>
          Identifies entities that increased lobbying spend targeting a
          specific agency, then received contracts from that agency within
          six months. Correlation only; the detector does not assert the
          lobbying caused the contract.
        </p>

        <h3 style={h3Style}>Lobby-contract loop</h3>
        <p style={proseStyle}>
          Identifies entities with both substantial lobbying spend on
          appropriations issues and federal contracts in the same time
          window. Flags the structural pattern; does not allege impropriety.
        </p>

        <h3 style={h3Style}>Tax lobbying</h3>
        <p style={proseStyle}>
          Identifies entities concentrating lobbying disclosures on tax
          policy issues. Quantifies share of total lobbying spend devoted
          to tax matters.
        </p>

        <h3 style={h3Style}>Budget lobbying</h3>
        <p style={proseStyle}>
          Identifies entities lobbying on budget or appropriations issues
          while also receiving federal contracts. Quantifies overlap.
        </p>

        <h3 style={h3Style}>Trade before legislation</h3>
        <p style={proseStyle}>
          Identifies congressional stock trades by members within 30 days
          before or after action on a bill the member sponsored or
          cosponsored. Cross-references trade dates against bill action
          dates. Insider trading rules for Congress are weaker than for
          civilians; the detector reports the timing without alleging
          wrongdoing.
        </p>

        <h3 style={h3Style}>Trade cluster</h3>
        <p style={proseStyle}>
          Identifies clusters of congressional trades in the same security
          across multiple members within a short window. The signal is
          the cluster.
        </p>

        <h3 style={h3Style}>PAC committee pipeline</h3>
        <p style={proseStyle}>
          Identifies corporate or trade-association PACs that direct a
          disproportionate share of contributions to members of the
          committees with oversight authority over their industry.
          Measures concentration, not motive.
        </p>

        <h3 style={h3Style}>Contract timing</h3>
        <p style={proseStyle}>
          Identifies federal contracts awarded within 90 days of the
          contract-receiving entity making PAC donations to members of
          the appropriations committees relevant to that contract.
        </p>

        <h3 style={h3Style}>Enforcement disappearance</h3>
        <p style={proseStyle}>
          Identifies entities that historically had enforcement actions
          and then increased lobbying spend, after which enforcement
          activity fell to zero. The pattern, not a claim of cause.
        </p>

        <h3 style={h3Style}>FARA domestic overlap</h3>
        <p style={proseStyle}>
          Identifies lobbying firms registered as foreign agents under the
          Foreign Agents Registration Act that simultaneously lobby for
          domestic corporate clients. Maps the overlap.
        </p>

        <h3 style={h3Style}>Revolving door</h3>
        <p style={proseStyle}>
          Identifies lobbying firms whose lobbyists previously worked at
          the agencies their firm now lobbies. Approximation:
          high-frequency agency mentions in a firm&apos;s filings paired
          with prior employment records.
        </p>

        <h2 style={h2Style}>What detectors do not do</h2>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {[
            'Detectors do not assign motive.',
            'Detectors do not assert causation between donations and votes, or between lobbying and outcomes.',
            'Detectors do not generate narrative prose. The story drafted from a detector finding goes through Veritas verification and human editorial review before publication.',
            'Detectors do not flag candidates for a specific party, candidate, or position. The same query runs across the entire dataset.',
            'Detectors do not surface stories about entities whose identity in our database fails the entity-validation checks (see /standards).',
          ].map((line) => (
            <li key={line} style={bulletItemStyle}>
              <span aria-hidden style={bulletDot}>&#8226;</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <h2 style={h2Style}>Detector source code</h2>
        <p style={proseStyle}>
          All detector logic is open source. The full implementation lives
          at{' '}
          <a
            href="https://github.com/Obelus-Labs-LLC/WeThePeople/blob/main/jobs/detect_stories.py"
            style={{
              color: 'var(--color-accent-text)',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
            target="_blank"
            rel="noopener noreferrer"
          >
            jobs/detect_stories.py
          </a>
          . If you find a bug or want to propose a new detector, open an
          issue or pull request on the repository.
        </p>
      </>
    ),
  },

  verification: {
    eyebrow: 'Methodology',
    title: 'Verification (Veritas)',
    metaDescription:
      'How WeThePeople verifies every claim before publication: the Veritas engine, claim provenance, the verification tiers.',
    body: (
      <>
        <p style={proseStyle}>
          Every claim in every published story passes through Veritas, an
          open-source claim-verification engine that runs as a separate
          service. Veritas is designed to be explicit about what each
          claim depends on and what would falsify it.
        </p>

        <h2 style={h2Style}>How Veritas works</h2>
        <p style={proseStyle}>
          When a story draft is submitted, Veritas decomposes it into
          discrete claims. Each claim is tagged with one of three
          provenance types:
        </p>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          <li style={bulletItemStyle}>
            <span aria-hidden style={bulletDot}>&#8226;</span>
            <span>
              <strong>internal</strong> — the claim is a direct fact from
              the WeThePeople database, where every row links to its
              underlying public record (Senate LDA filing, USASpending
              contract, FEC report, etc.). Veritas verifies the claim by
              looking up the row in the vault of canonical pre-verified
              facts. If the row matches, the claim is verified at the
              highest confidence tier.
            </span>
          </li>
          <li style={bulletItemStyle}>
            <span aria-hidden style={bulletDot}>&#8226;</span>
            <span>
              <strong>external</strong> — the claim depends on a source
              outside our database (a news article, a court filing, a
              press release). Veritas checks the claim against
              corroborating sources at known reliability tiers. Tier-1
              and Tier-2 sources at score ≥70 verify the claim. Tier-3
              alone is insufficient.
            </span>
          </li>
          <li style={bulletItemStyle}>
            <span aria-hidden style={bulletDot}>&#8226;</span>
            <span>
              <strong>inferred</strong> — the claim is a conclusion
              drawn from other facts rather than a directly sourced
              statement. Veritas hard-rejects inferred claims by
              default. Any sentence that depends on inference rather
              than evidence cannot be published.
            </span>
          </li>
        </ul>

        <h2 style={h2Style}>The verification tiers on every story</h2>
        <p style={proseStyle}>
          Each published story carries one of three verification tiers
          near the byline:
        </p>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {[
            ['Verified', 'every claim in the story passed Veritas at high or vault-hit confidence.'],
            ['Partially verified', 'most claims verified at high confidence, with one or more at partial or unknown. The story is still published with the disclosure visible.'],
            ['Unverified', 'a story that did not pass the verification gate would not be published. This tier exists in the schema for legacy stories pre-verification, which are clearly labeled.'],
          ].map(([label, rest]) => (
            <li key={label} style={bulletItemStyle}>
              <span aria-hidden style={bulletDot}>&#8226;</span>
              <span><strong>{label}</strong> — {rest}</span>
            </li>
          ))}
        </ul>

        <h2 style={h2Style}>What Veritas does not do</h2>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {[
            'Veritas does not edit prose. It evaluates claims, not language.',
            'Veritas does not catch implication. A story can pass Veritas with each individual claim true while the assembled narrative implies a relationship the data does not support. A separate implication-review pass runs in the editor stage to flag this class of issue.',
            'Veritas does not infer. It looks up; it does not deduce. Inferred claims are auto-rejected.',
            'Veritas is not a fact-checking opinion. It is a deterministic check against records and corroborating sources.',
          ].map((line) => (
            <li key={line} style={bulletItemStyle}>
              <span aria-hidden style={bulletDot}>&#8226;</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <h2 style={h2Style}>Veritas source code</h2>
        <p style={proseStyle}>
          Veritas is being open-sourced as a separately maintained
          project. The verification logic, source-tier scoring rules, and
          vault structure are all public. Updates and the public
          repository will be linked here as soon as the public release
          lands.
        </p>
      </>
    ),
  },

  corrections: {
    eyebrow: 'Methodology',
    title: 'Corrections',
    metaDescription:
      'How WeThePeople handles errors in published stories: detection, correction, retraction, and the public corrections page.',
    body: (
      <>
        <p style={proseStyle}>
          We make mistakes. When we discover an error in a published
          story we correct it promptly, document the correction
          publicly, and keep the original record intact. This page
          describes the process step by step.
        </p>

        <h2 style={h2Style}>How errors are detected</h2>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {[
            'Reader reports submitted via the "Report an error" button on every story page route directly to the editor for review.',
            'Internal cross-checks against the underlying database, run when claims appear to drift from the source records.',
            'Tipster reports submitted via the public tip line.',
            'Periodic re-verification of older stories: Veritas runs a stale-reverify cron that re-checks every claim against the latest data. Claims that no longer verify trigger a review of the story.',
          ].map((line) => (
            <li key={line} style={bulletItemStyle}>
              <span aria-hidden style={bulletDot}>&#8226;</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <h2 style={h2Style}>What happens when we find an error</h2>
        <p style={proseStyle}>
          We classify each issue into one of three categories.
        </p>

        <h3 style={h3Style}>Correction</h3>
        <p style={proseStyle}>
          A factual statement in the story is wrong. We update the story
          in place with the correction visible in a banner, and we add a
          dated entry to the corrections page describing what changed
          and why. The original incorrect text is retained in the
          correction record.
        </p>

        <h3 style={h3Style}>Update</h3>
        <p style={proseStyle}>
          New information has come to light that materially changes the
          story or adds context. We append the new information to the
          story with a dated &ldquo;Update&rdquo; line. The original
          text is unchanged.
        </p>

        <h3 style={h3Style}>Retraction</h3>
        <p style={proseStyle}>
          The story should not have been published. We mark the story
          retracted, replace the body with a retraction notice that
          explains why, and add an entry to the corrections page. The
          original story content is preserved internally for the audit
          trail. Readers see the retraction notice; the broken claim is
          not republished.
        </p>

        <h2 style={h2Style}>What we will not do</h2>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {[
            'We will not silently edit a published story.',
            'We will not remove a corrected or retracted story from the public archive. The record stays.',
            'We will not require a reporter or reader to submit a correction request through any process other than the public form on the story page.',
            'We will not respond to take-down requests by altering the published record. Take-down requests are reviewed for libel risk and routed to legal counsel; the story stays unless it is retracted on the merits.',
          ].map((line) => (
            <li key={line} style={bulletItemStyle}>
              <span aria-hidden style={bulletDot}>&#8226;</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <h2 style={h2Style}>The public corrections page</h2>
        <p style={proseStyle}>
          Every correction, update, and retraction is listed on{' '}
          <Link
            to="/corrections"
            style={{
              color: 'var(--color-accent-text)',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            our corrections page
          </Link>
          . The page is publicly accessible and indexed by search engines.
        </p>
      </>
    ),
  },

  'editorial-standards': {
    eyebrow: 'Methodology',
    title: 'Editorial Standards',
    metaDescription:
      "The Influence Journal's editorial standard: what every story must do, what disqualifies a story, and the verification labels we use.",
    body: (
      <>
        <p style={proseStyle}>
          Every story in The Influence Journal is built to survive editorial
          scrutiny from a working political reporter. Our editorial standard
          is internal-facing. It governs what stories we generate, what
          stories we reject, and what verification label we publish under.
          The full text is documented internally; this page summarizes it
          for readers.
        </p>

        <h2 style={h2Style}>The core principle</h2>
        <p style={proseStyle}>
          We build stories from facts, not from categories. The data tells
          us what the story is. We do not pick a frame ("Revolving Door,"
          "STOCK Act Violation," "Enforcement Gap") and then look for facts
          to fit it. We examine the facts first, identify what is genuinely
          anomalous or newsworthy, then assign the appropriate framing, or
          decline to publish if no story is supported.
        </p>

        <h2 style={h2Style}>What makes something a story</h2>
        <p style={proseStyle}>
          A finding qualifies as a story only if at least one of these
          applies:
        </p>
        <ul style={{ marginBottom: '1.25rem', paddingLeft: 0, listStyle: 'none' }}>
          {[
            'Anomaly against baseline: the pattern deviates significantly from sector norms.',
            'Temporal correlation with policy events: activity clusters around specific votes, hearings, contract awards, or regulatory actions.',
            'Closed-loop evidence: the data shows a complete cycle, e.g. lobbying then committee assignment then vote then donation.',
            'Disclosed conflict: a documented financial interest intersects with a documented official action by the same person or entity.',
            'Verified revolving-door movement: a specific named individual moved from agency X to lobbying firm Y, attested in public records.',
          ].map((t, i) => (
            <li key={i} style={bulletItemStyle}><span style={bulletDot}>•</span><span>{t}</span></li>
          ))}
        </ul>
        <p style={proseStyle}>
          Specialization, ownership, and donation are baseline behaviors,
          not stories. "Lobbying firm specializes in agency it lobbies" is
          not a story. "Politician owns stocks" is not a story. "Company
          donates to politicians" is not a story.
        </p>

        <h2 style={h2Style}>Required structure</h2>
        <p style={proseStyle}>
          Every story carries six sections in this order: a headline that
          states a specific verifiable fact (entity, action, magnitude,
          time period, no vague intensifiers); a 50-75 word lede; a
          200-300 word "Finding" with full numerical context and a
          baseline comparison; a 150-200 word "Why This Matters" naming
          a specific public-interest stake; a mandatory 75-125 word
          "What the Data Doesn't Show" section that states the limits
          of the dataset; and a "Verification & Methodology" block.
        </p>

        <h2 style={h2Style}>Time-window rule</h2>
        <p style={proseStyle}>
          Every dollar figure in a story carries its time window in the
          same sentence. We do not write "Company X earned $16.3M" without
          specifying the period. We write "$16.3M between 2020 and 2025"
          or "$16.3M in fiscal year 2024." Multi-year totals may not be
          presented as single-year figures. This rule applies to breakdown
          sentences too: when a sentence breaks down a total into
          components, the time window is repeated or back-referenced.
        </p>

        <h2 style={h2Style}>Entity-reference rule</h2>
        <p style={proseStyle}>
          Every named entity (politician, company, lobbying firm, client,
          agency) in a story must be directly attested in the source
          filings — not inferred from sector classification, not
          pattern-matched from related entities. If we cannot point to a
          specific filing ID, SEC submission, or government record that
          names them, the entity is removed.
        </p>

        <h2 style={h2Style}>Verification labels</h2>
        <p style={proseStyle}>
          Every published story carries one of two verification labels.
          We do not use a "Partially Verified" label.
        </p>
        <ul style={{ marginBottom: '1.25rem', paddingLeft: 0, listStyle: 'none' }}>
          <li style={bulletItemStyle}>
            <span style={bulletDot}>•</span>
            <span>
              <strong>Fully verified.</strong> Every claim in the story has
              been confirmed against a primary source by a human reviewer.
            </span>
          </li>
          <li style={bulletItemStyle}>
            <span style={bulletDot}>•</span>
            <span>
              <strong>Algorithmically generated, not human-verified.</strong>
              The story was built from primary-source data by our pipeline
              and passes every automated check, but no human has reviewed
              it end to end.
            </span>
          </li>
        </ul>

        <h2 style={h2Style}>Headline rules</h2>
        <p style={proseStyle}>
          Headlines state a specific verifiable fact and stay under 140
          characters. They name the entity, the action, the magnitude,
          and the time period. They do not editorialize, imply wrongdoing
          where none is established, or use vague intensifiers ("massive,"
          "stunning," "shocking," "staggering"). Headlines that contain
          "after [X did Y]" framing imply causation and are rejected.
        </p>

        <h2 style={h2Style}>Anti-padding rules</h2>
        <p style={proseStyle}>
          We cut anything that doesn't add factual content. No restating
          the same finding in different words across sections. No "this
          matters because" followed by generic civic values. No speculative
          paragraphs about what "could" or "might" be true without data
          support. No conclusion paragraphs that summarize what was already
          said.
        </p>

        <h2 style={h2Style}>What this is for</h2>
        <p style={proseStyle}>
          The journal was taken offline for editorial review on
          2026-05-01 after a working political journalist engaged
          seriously with WeThePeople. We chose to be slower and right
          rather than fast and wrong. Every story published from that
          point forward conforms to this standard or is not published.
        </p>
      </>
    ),
  },

  index: {
    eyebrow: 'Methodology',
    title: 'How We Work',
    metaDescription:
      'Methodology pages: how WeThePeople detects stories, verifies claims, and handles corrections.',
    body: (
      <>
        <p style={proseStyle}>
          The Influence Journal publishes investigations and data briefs
          built from public records. Every step of how we identify, verify,
          and correct that work is documented on the pages linked below.
          We update these pages when our practices change.
        </p>

        <div className="grid gap-3 mt-8" style={{ display: 'grid', gap: 12 }}>
          {[
            {
              to: '/methodology/editorial-standards',
              title: 'Editorial Standards',
              desc: "What every story must do, what disqualifies a story, the time-window rule, the entity-reference rule, and the two verification labels we use.",
            },
            {
              to: '/methodology/detectors',
              title: 'Story Detectors',
              desc: 'The thirteen pattern detectors that surface candidates from public records, what each one flags, and what they refuse to flag.',
            },
            {
              to: '/methodology/verification',
              title: 'Verification (Veritas)',
              desc: 'How every claim in every story is verified before publication, the three claim provenance types, and what the verification tiers mean.',
            },
            {
              to: '/methodology/corrections',
              title: 'Corrections Process',
              desc: 'How we detect, classify, and publish corrections, updates, and retractions on stories already published.',
            },
          ].map((card) => (
            <Link
              key={card.to}
              to={card.to}
              style={{
                display: 'block',
                padding: '20px 22px',
                borderRadius: '14px',
                border: '1px solid rgba(235,229,213,0.08)',
                background: 'var(--color-surface)',
                textDecoration: 'none',
                color: 'var(--color-text-1)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor =
                  'rgba(197,160,40,0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor =
                  'rgba(235,229,213,0.08)';
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: '20px',
                  marginBottom: 6,
                }}
              >
                {card.title}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  lineHeight: 1.6,
                  color: 'var(--color-text-2)',
                }}
              >
                {card.desc}
              </div>
            </Link>
          ))}
        </div>
      </>
    ),
  },
};

export default function MethodologyPage() {
  const { topic } = useParams<{ topic?: string }>();
  const key = (topic && PAGES[topic]) ? topic : 'index';
  const page = PAGES[key];

  usePageMeta({
    title: `${page.title} — The Influence Journal`,
    description: page.metaDescription,
    canonical: `https://journal.wethepeopleforus.com/methodology${
      key === 'index' ? '' : `/${key}`
    }`,
  });

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-10 sm:py-16"
      style={{ color: 'var(--color-text-1)' }}
    >
      <article className="max-w-[720px] mx-auto">
        <Link
          to={key === 'index' ? '/' : '/methodology'}
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
          {key === 'index' ? 'Back to Journal' : 'Methodology overview'}
        </Link>

        <p className="mb-3" style={eyebrowStyle}>
          {page.eyebrow}
        </p>
        <h1 className="mb-6" style={h1Style}>
          {page.title}
        </h1>

        {page.body}

        {key !== 'index' && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-12">
            {[
              { label: 'Editorial Standards', to: '/standards' },
              { label: 'Corrections', to: '/corrections' },
              { label: 'About', to: '/about' },
            ].map((l) => (
              <Link
                key={l.label}
                to={l.to}
                className="inline-flex items-center gap-2"
                style={pillButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor =
                    'rgba(197,160,40,0.35)';
                  e.currentTarget.style.color = 'var(--color-accent-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    'rgba(235,229,213,0.12)';
                  e.currentTarget.style.color = 'var(--color-text-1)';
                }}
              >
                {l.label}
                <ArrowRight size={12} />
              </Link>
            ))}
          </div>
        )}
      </article>
    </main>
  );
}
