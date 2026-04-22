/**
 * EcosystemNav — Cross-site navigation bar for the WTP ecosystem.
 * Token-driven version to match the Influence Journal redesign (Apr 2026).
 */

interface EcosystemNavProps {
  active: 'core' | 'research' | 'journal' | 'verify';
}

const sites = [
  { key: 'core' as const,     label: 'WeThePeople', href: 'https://wethepeopleforus.com' },
  { key: 'research' as const, label: 'Research',    href: 'https://research.wethepeopleforus.com' },
  { key: 'journal' as const,  label: 'Journal',     href: 'https://journal.wethepeopleforus.com' },
  { key: 'verify' as const,   label: 'Veritas',     href: 'https://verify.wethepeopleforus.com' },
];

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  padding: '6px 10px',
  textDecoration: 'none',
};

export function EcosystemNav({ active }: EcosystemNavProps) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          padding: '8px 14px',
          borderRadius: '8px',
          background: 'var(--color-accent)',
          color: '#07090C',
          textDecoration: 'none',
        }}
      >
        Skip to main content
      </a>
      <nav
        className="w-full"
        style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'rgba(7,9,12,0.82)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between" style={{ height: 40 }}>
          <div className="flex items-center gap-1">
            {sites.map((site, i) => (
              <span key={site.key} className="flex items-center">
                {i > 0 && (
                  <span
                    aria-hidden
                    style={{
                      color: 'var(--color-text-3)',
                      margin: '0 2px',
                      opacity: 0.5,
                    }}
                  >
                    |
                  </span>
                )}
                {site.key === active ? (
                  <span
                    style={{
                      ...labelStyle,
                      color: 'var(--color-accent-text)',
                    }}
                  >
                    {site.label}
                  </span>
                ) : (
                  <a
                    href={site.href}
                    style={{
                      ...labelStyle,
                      color: 'var(--color-text-3)',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
                  >
                    {site.label}
                  </a>
                )}
              </span>
            ))}
          </div>
          <a
            href="https://wethepeopleforus.com/login"
            style={{
              ...labelStyle,
              color: 'var(--color-text-3)',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
          >
            Log in
          </a>
        </div>
      </nav>
    </>
  );
}
