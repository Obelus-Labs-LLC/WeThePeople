import { Link } from 'react-router-dom';

const LINKS: Array<{ label: string; to?: string; href?: string }> = [
  { label: 'About', to: '/about' },
  { label: 'Subscribe', to: '/subscribe' },
  { label: 'Coverage', to: '/coverage' },
  { label: 'Verify Data', to: '/verify-our-data' },
  { label: 'Corrections', to: '/corrections' },
  { label: 'Main Site', href: 'https://wethepeopleforus.com' },
  { label: 'Research', href: 'https://research.wethepeopleforus.com' },
  { label: 'Methodology', href: 'https://wethepeopleforus.com/methodology' },
  { label: 'GitHub', href: 'https://github.com/Obelus-Labs-LLC/WeThePeople' },
];

const linkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  transition: 'color 0.2s',
  textDecoration: 'none',
};

export function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        padding: '36px 16px 44px',
        marginTop: 64,
      }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                style={{
                  height: 6,
                  width: 6,
                  borderRadius: '999px',
                  background: 'var(--color-journal)',
                  boxShadow: '0 0 8px var(--color-journal)',
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.24em',
                  textTransform: 'uppercase',
                  color: 'var(--color-journal)',
                }}
              >
                WeThePeople Research
              </span>
            </div>
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: '22px',
                letterSpacing: '-0.02em',
                color: 'var(--color-text-1)',
                lineHeight: 1.1,
              }}
            >
              The Influence Journal
            </p>
            <p
              className="mt-1"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--color-text-3)',
              }}
            >
              Part of the WeThePeople ecosystem
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LINKS.map((l) =>
              l.to ? (
                <Link
                  key={l.label}
                  to={l.to}
                  style={linkStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent-text)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
                >
                  {l.label}
                </Link>
              ) : (
                <a
                  key={l.label}
                  href={l.href}
                  // Footer links to other ecosystem sites and external
                  // resources — open in a new tab so the visitor's
                  // current story stays in their browser history.
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent-text)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
                >
                  {l.label}
                </a>
              )
            )}
          </nav>
        </div>
      </div>
    </footer>
  );
}
