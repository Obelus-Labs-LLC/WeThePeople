/**
 * EcosystemNav — Cross-site navigation bar for the WTP ecosystem (core site).
 *
 * Matches the "WTP Ecosystem Sites" design spec (Apr 2026). Lives as a 52px
 * sticky bar at the top of every page on wethepeopleforus.com so users can
 * jump to the sibling sites (Verify / Research / Journal) without hunting
 * for a link.
 *
 *   - Left: gold-bordered "WTP" mark + wordmark, links to /
 *   - Center: pill switcher (Verify / Research / Journal) — each link
 *     navigates to the sibling subdomain
 *   - Right: active-site identifier — gold mark + "WeThePeople" +
 *     pulsing dot in the core accent
 *
 * This file is the core-site inline copy. The sibling sites keep their own
 * inlined copies under `sites/{verify,research,journal}/src/components/`
 * because TypeScript's Bundler moduleResolution cannot walk up into a
 * sibling project's node_modules. Keep the four copies in sync visually.
 */

type EcosystemSite = 'core' | 'verify' | 'research' | 'journal';

interface EcosystemNavProps {
  /** Highlights the current site in the switcher. Defaults to 'core'. */
  active?: EcosystemSite;
}

interface SiteDef {
  key: EcosystemSite;
  name: string;
  display: string;
  href: string;
  accent: string;
  dim: string;
  text: string;
  mark: string;
}

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

const SWITCHER_ORDER: Exclude<EcosystemSite, 'core'>[] = ['verify', 'research', 'journal'];

// Tokenless palette — baked so the nav looks identical across all sites.
const T1 = '#EBE5D5';
const T2 = 'rgba(235,229,213,0.5)';
const T3 = 'rgba(235,229,213,0.22)';
const BORDER = 'rgba(255,255,255,0.06)';
const GOLD = '#C5A028';

const PLAYFAIR = "'Playfair Display', Georgia, serif";
const INTER = "'Inter', sans-serif";

export default function EcosystemNav({ active = 'core' }: EcosystemNavProps) {
  const activeSite = SITES[active];

  return (
    <>
      <style>{`
        @keyframes wtp-eco-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>

      <nav
        aria-label="WeThePeople ecosystem"
        className="sticky top-0 z-[60]"
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

        {/* Active site identifier (right side) */}
        <div
          style={{
            marginLeft: 'auto',
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
            style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: T1 }}
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
      </nav>
    </>
  );
}
