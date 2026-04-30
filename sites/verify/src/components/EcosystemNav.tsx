/**
 * EcosystemNav — Cross-site navigation bar for the WTP ecosystem.
 *
 * Matches the "WTP Ecosystem Sites" design spec (Apr 2026):
 *   - 52px tall, blurred translucent dark background
 *   - WTP brand mark on left (gold-bordered "WTP" + WeThePeople wordmark)
 *   - Three-site switcher (Verify · Research · Journal) with the active site
 *     rendered with the site's tinted background + accent text
 *   - Active site identifier on the right with mark badge + display name +
 *     pulsing dot in the site's accent color
 *
 * Each site is its own Vercel deployment, so "switching" navigates to the
 * sibling subdomain. Pass `active` to highlight the current site.
 *
 * Usage:
 *   <EcosystemNav active="verify" />
 *   <EcosystemNav active="research" />
 *   <EcosystemNav active="journal" />
 *   <EcosystemNav active="core" />   // main wethepeopleforus.com site
 *
 * IMPLEMENTATION NOTE: This file is inlined per-site (rather than imported
 * from `sites/shared/EcosystemNav.tsx`) because TypeScript's Bundler
 * moduleResolution cannot walk up into node_modules outside the project
 * root, so a shared file in `sites/shared/` can't resolve `react/jsx-runtime`.
 * Keep the three copies (verify / research / journal) in sync.
 */

// No React import needed — all three sites set `jsx: "react-jsx"` so the
// automatic runtime handles JSX → React calls without an explicit import.

export type EcosystemSite = 'core' | 'civic' | 'verify' | 'research' | 'journal';

interface EcosystemNavProps {
  active: EcosystemSite;
}

interface SiteDef {
  key: EcosystemSite;
  name: string;
  display: string; // shown in the active-site identifier on the right
  href: string;
  accent: string;
  dim: string;
  text: string;
  mark: string;
}

// Per-site brand colors. Verify=emerald, Research=violet, Journal=crimson.
// "core" reuses the gold WTP brand color so the main site identifier still
// reads on the right when the home/dashboard is active.
const SITES: Record<Exclude<EcosystemSite, 'core'>, SiteDef> & { core: SiteDef } = {
  core: {
    key: 'core',
    name: 'WeThePeople',
    display: 'WeThePeople',
    href: 'https://wethepeopleforus.com',
    accent: '#C5A028',
    dim: 'rgba(197,160,40,0.12)',
    text: '#D8B84A',
    mark: 'WTP',
  },
  civic: {
    key: 'civic',
    name: 'Civic Hub',
    display: 'Civic Hub',
    href: 'https://wethepeopleforus.com/civic',
    accent: '#C5A028',
    dim: 'rgba(197,160,40,0.12)',
    text: '#D8B84A',
    mark: 'CIV',
  },
  verify: {
    key: 'verify',
    name: 'Verify',
    display: 'Verify',
    href: 'https://verify.wethepeopleforus.com',
    accent: '#10B981',
    dim: 'rgba(16,185,129,0.12)',
    text: '#3DD5C7',
    mark: 'VFY',
  },
  research: {
    key: 'research',
    name: 'Research',
    display: 'Research',
    href: 'https://research.wethepeopleforus.com',
    accent: '#8B5CF6',
    dim: 'rgba(139,92,246,0.12)',
    text: '#A78BFA',
    mark: 'RSH',
  },
  journal: {
    key: 'journal',
    name: 'Journal',
    display: 'The Influence Journal',
    href: 'https://journal.wethepeopleforus.com',
    accent: '#E63946',
    dim: 'rgba(230,57,70,0.12)',
    text: '#EF5765',
    mark: 'JNL',
  },
};

// Order shown in the switcher. "core" is represented by the WTP brand mark on
// the far left, not as a button, so it doesn't appear here.
const SWITCHER_ORDER: Exclude<EcosystemSite, 'core'>[] = ['civic', 'verify', 'research', 'journal'];

// Tokenless palette — these colors are baked into the design spec rather than
// driven by per-site CSS vars, since the nav must look identical across all
// three sites and the main app.
const T2 = 'rgba(235,229,213,0.5)';
const T3 = 'rgba(235,229,213,0.22)';
const BORDER = 'rgba(255,255,255,0.06)';
const GOLD = '#C5A028';

const PLAYFAIR = "'Playfair Display', Georgia, serif";
const INTER = "'Inter', sans-serif";

export function EcosystemNav({ active }: EcosystemNavProps) {
  const activeSite = SITES[active];
  // Sibling sites do not host the auth context, so the buttons just
  // hand off to the core site. After auth the user can come back via
  // the switcher pill. The `next` param is preserved so the core
  // site can bounce them back here on success once that flow is
  // wired up.
  const coreLogin = `${SITES.core.href}/login?next=${encodeURIComponent(
    typeof window !== 'undefined' ? window.location.href : '/',
  )}`;
  const coreSignup = `${SITES.core.href}/signup?next=${encodeURIComponent(
    typeof window !== 'undefined' ? window.location.href : '/',
  )}`;

  return (
    <>
      {/* Skip-link for keyboard users — kept invisible until focused */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        style={{
          fontFamily: INTER,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          padding: '8px 14px',
          borderRadius: 8,
          background: activeSite.accent,
          color: '#07090C',
          textDecoration: 'none',
        }}
      >
        Skip to main content
      </a>

      <style>{`
        @keyframes wtp-eco-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>

      <nav
        aria-label="WeThePeople ecosystem"
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 52,
          padding: '0 28px',
          borderBottom: `1px solid ${BORDER}`,
          background: 'rgba(7,9,12,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          flexShrink: 0,
          gap: 0,
          zIndex: 50,
          position: 'sticky',
          top: 0,
        }}
      >
        {/* WTP home link — gold-bordered "WTP" + wordmark */}
        <a
          href={SITES.core.href}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingRight: 20,
            marginRight: 16,
            borderRight: `1px solid ${BORDER}`,
            textDecoration: 'none',
            height: 52,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 24,
              height: 24,
              border: '1.5px solid rgba(197,160,40,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: PLAYFAIR,
              fontSize: 8,
              fontWeight: 700,
              fontStyle: 'italic',
              color: GOLD,
            }}
          >
            WTP
          </div>
          <span style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: T2 }}>
            WeThePeople
          </span>
        </a>

        {/* Site switcher */}
        <div role="tablist" style={{ display: 'flex', gap: 2 }}>
          {SWITCHER_ORDER.map((key) => {
            const site = SITES[key];
            const isActive = active === key;
            return (
              <a
                key={key}
                href={site.href}
                role="tab"
                aria-selected={isActive}
                style={{
                  padding: '5px 14px',
                  borderRadius: 6,
                  border: 'none',
                  fontFamily: INTER,
                  fontSize: 12,
                  fontWeight: 500,
                  textDecoration: 'none',
                  background: isActive ? site.dim : 'transparent',
                  color: isActive ? site.text : T3,
                  transition: 'all 0.15s',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = T2;
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = T3;
                }}
              >
                {site.name}
              </a>
            );
          })}
        </div>

        {/* Right cluster:
              - Active-site identifier badge (mark + display name +
                pulsing dot in the site's accent color). This is the
                branding element the user wants kept on every site.
              - Log in (transparent, bordered) + Sign up (filled
                gold) buttons sitting to the right of the badge.
            Auth on sibling sites links back to the core domain. */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 28,
                height: 28,
                border: `1.5px solid ${activeSite.accent}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: INTER,
                fontSize: 9,
                fontWeight: 700,
                color: activeSite.accent,
                letterSpacing: '0.05em',
              }}
            >
              {activeSite.mark}
            </div>
            <span
              className="hidden sm:inline"
              style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: '#EBE5D5' }}
            >
              {activeSite.display}
            </span>
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: activeSite.accent,
                marginLeft: 4,
                animation: 'wtp-eco-pulse 2s ease-in-out infinite',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a
              href={coreLogin}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontFamily: INTER,
                fontSize: 13,
                fontWeight: 600,
                color: T2,
                background: 'transparent',
                border: `1px solid ${BORDER}`,
                textDecoration: 'none',
              }}
            >
              Log in
            </a>
            <a
              href={coreSignup}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontFamily: INTER,
                fontSize: 13,
                fontWeight: 600,
                color: '#07090C',
                background: GOLD,
                border: `1px solid ${GOLD}`,
                textDecoration: 'none',
              }}
            >
              Sign up
            </a>
          </div>
        </div>
      </nav>
    </>
  );
}

export default EcosystemNav;
