import { ArrowRight } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';

/**
 * EditorialReviewPage
 *
 * Replaces every journal route while the journal is paused for an editorial
 * review against research/EDITORIAL_STANDARDS.md. The router (App.tsx) renders
 * this page for all paths when VITE_JOURNAL_REVIEW_MODE === '1' (default ON).
 *
 * Why we keep the subdomain alive instead of leaving it 404-ing: existing
 * tweets, search results, and inbound links from the main site land here
 * with a clear, honest message rather than dead pages.
 */
export default function EditorialReviewPage() {
  usePageMeta({
    title: 'In Editorial Review — The Influence Journal',
    description:
      'The Influence Journal is offline for an editorial review. The core data tools at wethepeopleforus.com remain available.',
    canonical: 'https://journal.wethepeopleforus.com/',
  });

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-20"
      role="main"
      style={{ color: 'var(--color-text-1)' }}
    >
      <div className="max-w-2xl mx-auto">
        <p
          className="mb-6"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-text)',
          }}
        >
          Status · In Editorial Review
        </p>

        <h1
          className="mb-6"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(40px, 6vw, 64px)',
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            color: 'var(--color-text-1)',
          }}
        >
          The Influence Journal is offline.
        </h1>

        <p
          className="mb-5"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '18px',
            lineHeight: 1.65,
            color: 'var(--color-text-2)',
          }}
        >
          We took the journal down on our own initiative to review every
          published story against a stricter editorial standard. The data
          underneath every story is sourced from federal records, but the
          generation pipeline has known accuracy issues we want to fix
          before the journal continues to publish.
        </p>

        <p
          className="mb-5"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '18px',
            lineHeight: 1.65,
            color: 'var(--color-text-2)',
          }}
        >
          Until the review is complete, no stories are visible here. The
          rest of the platform is unaffected: the politician, company, and
          sector pages on{' '}
          <a
            href="https://wethepeopleforus.com"
            style={{ color: 'var(--color-accent-text)', textDecoration: 'underline' }}
          >
            wethepeopleforus.com
          </a>{' '}
          run on the same federal source data and remain available, as do
          the research tools at{' '}
          <a
            href="https://research.wethepeopleforus.com"
            style={{ color: 'var(--color-accent-text)', textDecoration: 'underline' }}
          >
            research.wethepeopleforus.com
          </a>
          .
        </p>

        <p
          className="mb-10"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '16px',
            lineHeight: 1.65,
            color: 'var(--color-text-2)',
          }}
        >
          We would rather be slower and right than fast and wrong. When the
          journal returns, every story will have been reviewed end to end,
          carry an honest verification label, and link back to the primary
          source for every claim.
        </p>

        <div className="flex items-center gap-5 flex-wrap">
          <a
            href="https://wethepeopleforus.com"
            className="inline-flex items-center gap-2 no-underline"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-text)',
            }}
          >
            Visit the platform
            <ArrowRight size={14} />
          </a>
          <a
            href="mailto:editor@wethepeopleforus.com?subject=Influence%20Journal"
            className="no-underline"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-text-2)',
            }}
          >
            Contact the editor
          </a>
        </div>

        <hr
          className="my-12"
          style={{ border: 0, borderTop: '1px solid var(--color-border, #2a2a2a)' }}
        />

        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            lineHeight: 1.6,
            letterSpacing: '0.04em',
            color: 'var(--color-text-3, var(--color-text-2))',
          }}
        >
          The Influence Journal is part of WeThePeople, a civic transparency
          platform. Every story is built from public federal data. Editorial
          standards governing this review are documented internally and will
          be published alongside the journal&rsquo;s return.
        </p>
      </div>
    </main>
  );
}
