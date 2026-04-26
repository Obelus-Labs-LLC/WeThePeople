import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';

export default function NotFoundPage() {
  usePageMeta({
    title: 'Page Not Found',
    description: 'The page you are looking for does not exist.',
  });

  return (
    <main id="main-content" className="flex-1 px-4 py-20" role="main">
      <div className="max-w-xl mx-auto text-center">
        <p
          className="mb-4"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-text)',
          }}
        >
          404 · Page Not Found
        </p>
        <h1
          className="mb-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(40px, 6vw, 64px)',
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            color: 'var(--color-text-1)',
          }}
        >
          We couldn&rsquo;t find that page
        </h1>
        <p
          className="mb-8"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '16px',
            lineHeight: 1.65,
            color: 'var(--color-text-2)',
          }}
        >
          The link may be broken, or the story may have moved. Try the homepage,
          our coverage report, or the corrections page.
        </p>
        <div className="flex items-center justify-center gap-5 flex-wrap">
          <Link
            to="/"
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
            <ArrowLeft size={14} />
            Back to Journal
          </Link>
          <Link
            to="/coverage"
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
            Coverage Report
          </Link>
          <Link
            to="/corrections"
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
            Corrections
          </Link>
        </div>
      </div>
    </main>
  );
}
