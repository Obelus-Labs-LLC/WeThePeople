import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import Logo from './Logo';

/**
 * Site footer — redesign (Apr 2026).
 *
 * Token-driven: surface bg, border tokens, text-3 links with text-2 hover,
 * monospaced copyright line. Uses new <Logo> instead of the legacy blue
 * square. Sponsor banner retains the heart-on-GitHub CTA but re-skinned
 * in --color-red to match the system.
 */
export default function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Top row — brand + nav */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-6">
          <Logo size="sm" />

          <div
            className="flex flex-wrap gap-6"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
            }}
          >
            {[
              { to: '/about', label: 'About', external: false },
              { to: '/privacy', label: 'Privacy Policy', external: false },
              { to: '/terms', label: 'Terms of Use', external: false },
              { to: '/disclaimer', label: 'Disclaimer', external: false },
              { to: '/methodology', label: 'Methodology', external: false },
              // Stories moved to the journal sub-site. Linking to /stories
              // hits MovedToJournalPage which immediately bounces — confusing
              // to land on. Send users straight to the journal.
              { to: 'https://journal.wethepeopleforus.com', label: 'Journal ↗', external: true },
            ].map((link) =>
              link.external ? (
                <a
                  key={link.to}
                  href={link.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-underline transition-colors text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.to}
                  to={link.to}
                  className="no-underline transition-colors text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
                >
                  {link.label}
                </Link>
              ),
            )}
          </div>
        </div>

        {/* Support banner */}
        <div
          className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{
            backgroundColor: 'rgba(230, 57, 70, 0.06)', // --color-red dim
            border: '1px solid rgba(230, 57, 70, 0.18)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
          }}
        >
          <div className="flex items-center gap-3">
            <Heart
              className="w-5 h-5 shrink-0"
              style={{ color: 'var(--color-red)' }}
            />
            <div>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--color-text-1)',
                  margin: 0,
                }}
              >
                Support this open-source project
              </p>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: 'var(--color-text-3)',
                  margin: '2px 0 0',
                }}
              >
                WeThePeople is free and open source. Help us keep it running.
              </p>
            </div>
          </div>
          <a
            href="https://github.com/sponsors/Obelus-Labs-LLC"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-2 no-underline transition-colors"
            style={{
              backgroundColor: 'rgba(230, 57, 70, 0.10)',
              border: '1px solid rgba(230, 57, 70, 0.22)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 16px',
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--color-red)',
            }}
          >
            <Heart className="w-4 h-4" />
            Sponsor on GitHub
          </a>
        </div>

        {/* Disclaimer text */}
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--color-text-3)',
            marginBottom: 16,
          }}
        >
          Data sourced from public records including Congress.gov, Senate LDA,
          USASpending.gov, Federal Register, SEC EDGAR, OpenFDA, USPTO, EPA
          ECHO, and other government APIs. This platform is for informational
          purposes only and does not constitute financial, legal, or investment
          advice.
        </p>

        {/* Bottom row — copyright + external links */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-4"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: 'var(--color-text-3)',
            }}
          >
            &copy; {new Date().getFullYear()} Obelus Labs LLC. All rights reserved.
          </span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/Obelus-Labs-LLC/WeThePeople"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline transition-colors text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
              }}
            >
              Open Source on GitHub
            </a>
            <a
              href="https://x.com/WTPForUs"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
              aria-label="Follow us on X"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
