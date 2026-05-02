import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Branded 404 for the Verify subdomain. Replaces the previous
 * silently-falls-back-to-HomePage catch-all so:
 *  - A typo in the URL doesn't look like the home page
 *  - Search engines and analytics see real 404s instead of OK 200s
 *  - The user gets a clear way to recover
 */
export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <main
      id="main-content"
      className="flex-1 flex items-center justify-center"
      role="main"
      style={{ color: 'var(--color-text-1)' }}
    >
      <div className="max-w-md mx-auto text-center px-4 py-20">
        <p
          className="mb-4"
          style={{
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-text)',
          }}
        >
          404 · Page Not Found
        </p>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(32px, 5vw, 44px)',
            lineHeight: 1.1,
            marginBottom: 16,
          }}
        >
          We couldn&rsquo;t find that.
        </h1>
        <p
          className="mb-8"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--color-text-2)',
          }}
        >
          The link may be broken, or the verification may have been removed.
          Try the home page or browse the verification vault.
        </p>
        <div className="flex items-center justify-center gap-5 flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2"
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-text)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={14} />
            Back to home
          </button>
          <button
            type="button"
            onClick={() => navigate('/vault')}
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-text-2)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Browse vault
          </button>
        </div>
      </div>
    </main>
  );
}
