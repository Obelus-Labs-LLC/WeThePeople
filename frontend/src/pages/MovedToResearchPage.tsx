import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const RESEARCH_BASE = 'https://research.wethepeopleforus.com';
const REDIRECT_DELAY_SECONDS = 5;

// Research is a sibling subdomain with its own visual identity; the spec uses
// a violet accent to signal the hand-off (vs. WTP gold). Two tones: a lighter
// text/border color, and a deeper hue with transparency for the card bg.
const PURPLE_ACCENT = '#A78BFA';
const PURPLE_BORDER = 'rgba(139,92,246,0.25)';
const PURPLE_BG = 'rgba(139,92,246,0.06)';

/**
 * Mapping of original route paths to display info + research URLs.
 */
const TOOL_INFO: Record<
  string,
  { title: string; description: string; researchPath: string }
> = {
  patents: {
    title: 'Patent Search',
    description:
      'Search and analyze USPTO patent filings across technology companies.',
    researchPath: '/patents',
  },
  pipeline: {
    title: 'Clinical Trial Pipeline',
    description:
      'Track active clinical trials, phases, and drug development pipelines.',
    researchPath: '/pipeline',
  },
  'fda-approvals': {
    title: 'FDA Approvals',
    description:
      'Browse recent FDA drug and device approvals and regulatory actions.',
    researchPath: '/fda-approvals',
  },
  'insider-trades': {
    title: 'Insider Trades Dashboard',
    description:
      'Track corporate insider buying and selling activity across financial institutions.',
    researchPath: '/insider-trades',
  },
  'market-movers': {
    title: 'Market Movers',
    description:
      'See the biggest market movers and stock price changes across tracked institutions.',
    researchPath: '/market-movers',
  },
  news: {
    title: 'News & Regulatory',
    description:
      'Latest financial news, regulatory developments, and sector analysis.',
    researchPath: '/news',
  },
  complaints: {
    title: 'Consumer Complaints',
    description:
      'CFPB consumer complaint data across financial institutions.',
    researchPath: '/complaints',
  },
};

const PATH_TO_TOOL: Record<string, string> = {
  '/technology/patents': 'patents',
  '/health/pipeline': 'pipeline',
  '/health/fda-approvals': 'fda-approvals',
  '/finance/insider-trades': 'insider-trades',
  '/finance/market-movers': 'market-movers',
  '/finance/news': 'news',
  '/finance/complaints': 'complaints',
};

/**
 * 301 redirect landing page for tools that have moved to the Research
 * subdomain. Matches the design: violet "Moved · 301 Redirect" overline,
 * italic Playfair headline, pitch copy, then a purple-accented handoff card
 * with the destination URL, title, and inline arrow — followed by an
 * auto-redirect countdown with spinner.
 */
export default function MovedToResearchPage() {
  const { pathname } = useLocation();
  const toolKey = PATH_TO_TOOL[pathname] || '';
  const info = TOOL_INFO[toolKey];
  const researchUrl = info ? `${RESEARCH_BASE}${info.researchPath}` : RESEARCH_BASE;

  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_DELAY_SECONDS);

  useEffect(() => {
    // Tick down every second, then kick off the actual redirect. We use
    // window.location.href (not React Router) because this is a cross-origin
    // hand-off to the research subdomain.
    const interval = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    const timeout = window.setTimeout(() => {
      window.location.href = researchUrl;
    }, REDIRECT_DELAY_SECONDS * 1000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [researchUrl]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <style>{`
        @keyframes wtp-spin { to { transform: rotate(360deg) } }
      `}</style>
      <div style={{ maxWidth: 600, width: '100%' }}>
        {/* Overline */}
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            color: PURPLE_ACCENT,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          Moved &middot; 301 Redirect
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(30px, 4.5vw, 42px)',
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            color: 'var(--color-text-1)',
            marginBottom: 14,
          }}
        >
          {info ? `${info.title} now lives on Research.` : 'This tool now lives on Research.'}
        </h1>

        {/* Pitch copy */}
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            color: 'var(--color-text-2)',
            lineHeight: 1.7,
            marginBottom: 28,
          }}
        >
          {info
            ? `${info.description} `
            : ''}
          We&apos;ve consolidated our research tools &mdash; Drug Lookup, Insider
          Trades, Complaints, Patents, and FDA Approvals &mdash; into a dedicated
          subdomain. The tool you were looking for is still free, still open,
          and now lives alongside similar tools for faster cross-reference.
        </p>

        {/* Handoff card */}
        <a
          href={researchUrl}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 22px',
            border: `1px solid ${PURPLE_BORDER}`,
            borderRadius: 12,
            textDecoration: 'none',
            background: PURPLE_BG,
            marginBottom: 14,
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 11,
                fontWeight: 700,
                color: PURPLE_ACCENT,
                letterSpacing: '0.08em',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              research.wethepeopleforus.com
            </div>
            <div
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontStyle: 'italic',
                fontWeight: 700,
                fontSize: 18,
                color: 'var(--color-text-1)',
                marginBottom: 2,
              }}
            >
              WeThePeople Research
            </div>
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: 'var(--color-text-3)',
              }}
            >
              7 analytical tools &middot; Free &middot; No signup required
            </div>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: `1px solid ${PURPLE_BORDER}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: PURPLE_ACCENT,
              flexShrink: 0,
              fontFamily: "'Inter', sans-serif",
              fontSize: 16,
            }}
          >
            →
          </div>
        </a>

        {/* Countdown */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: 'var(--color-text-3)',
          }}
        >
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '2px solid var(--color-accent)',
              borderTopColor: 'transparent',
              animation: 'wtp-spin 1s linear infinite',
            }}
          />
          {secondsLeft > 0
            ? `Redirecting in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}\u2026`
            : 'Redirecting\u2026'}
        </div>
      </div>
    </div>
  );
}
