import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ExternalLink, ArrowLeft, ArrowUpRight } from 'lucide-react';

const RESEARCH_BASE = 'https://research.wethepeopleforus.com';

/**
 * Mapping of original route paths to display info + research URLs.
 * The component detects which tool based on the current URL path.
 */
const TOOL_INFO: Record<string, { title: string; description: string; researchPath: string; sector: string; sectorPath: string }> = {
  patents: {
    title: 'Patent Search',
    description: 'Search and analyze USPTO patent filings across technology companies.',
    researchPath: '/patents',
    sector: 'Technology',
    sectorPath: '/technology',
  },
  pipeline: {
    title: 'Clinical Trial Pipeline',
    description: 'Track active clinical trials, phases, and drug development pipelines.',
    researchPath: '/pipeline',
    sector: 'Health',
    sectorPath: '/health',
  },
  'fda-approvals': {
    title: 'FDA Approvals',
    description: 'Browse recent FDA drug and device approvals and regulatory actions.',
    researchPath: '/fda-approvals',
    sector: 'Health',
    sectorPath: '/health',
  },
  'insider-trades': {
    title: 'Insider Trades Dashboard',
    description: 'Track corporate insider buying and selling activity across financial institutions.',
    researchPath: '/insider-trades',
    sector: 'Finance',
    sectorPath: '/finance',
  },
  'market-movers': {
    title: 'Market Movers',
    description: 'See the biggest market movers and stock price changes across tracked institutions.',
    researchPath: '/market-movers',
    sector: 'Finance',
    sectorPath: '/finance',
  },
  news: {
    title: 'News & Regulatory',
    description: 'Latest financial news, regulatory developments, and sector analysis.',
    researchPath: '/news',
    sector: 'Finance',
    sectorPath: '/finance',
  },
  complaints: {
    title: 'Consumer Complaints',
    description: 'CFPB consumer complaint data across financial institutions.',
    researchPath: '/complaints',
    sector: 'Finance',
    sectorPath: '/finance',
  },
};

/** Map URL paths to tool keys */
const PATH_TO_TOOL: Record<string, string> = {
  '/technology/patents': 'patents',
  '/health/pipeline': 'pipeline',
  '/health/fda-approvals': 'fda-approvals',
  '/finance/insider-trades': 'insider-trades',
  '/finance/market-movers': 'market-movers',
  '/finance/news': 'news',
  '/finance/complaints': 'complaints',
};

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

export default function MovedToResearchPage() {
  const { pathname } = useLocation();
  const toolKey = PATH_TO_TOOL[pathname] || '';
  const info = TOOL_INFO[toolKey];

  if (!info) {
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: 460, textAlign: 'center' }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(28px, 4vw, 36px)',
              color: 'var(--color-text-1)',
              marginBottom: 12,
            }}
          >
            Page not found
          </h1>
          <Link
            to="/"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const researchUrl = `${RESEARCH_BASE}${info.researchPath}`;

  return (
    <div style={pageShell}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <div
          style={{
            borderRadius: 16,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            padding: '44px 36px',
            textAlign: 'center',
          }}
        >
          {/* Pill badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--color-accent-dim)',
              border: '1px solid var(--color-border)',
              borderRadius: 999,
              padding: '6px 14px',
              marginBottom: 24,
            }}
          >
            <ArrowUpRight size={12} style={{ color: 'var(--color-accent-text)' }} />
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-accent-text)',
              }}
            >
              Moved to WTP Research
            </span>
          </div>

          {/* Title */}
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(28px, 4vw, 40px)',
              lineHeight: 1.05,
              color: 'var(--color-text-1)',
              marginBottom: 12,
            }}
          >
            {info.title}
          </h1>

          {/* Description */}
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: 'var(--color-text-2)',
              lineHeight: 1.65,
              marginBottom: 28,
              maxWidth: 420,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            {info.description} This tool is now part of{' '}
            <span style={{ color: 'var(--color-text-1)', fontWeight: 500 }}>WTP Research</span>
            , our dedicated research and analysis platform.
          </p>

          {/* CTA */}
          <a
            href={researchUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--color-accent)',
              color: '#07090C',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '12px 20px',
              borderRadius: 10,
              textDecoration: 'none',
              transition: 'opacity 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            Open in WTP Research
            <ExternalLink size={14} />
          </a>

          {/* Navigation links */}
          <div
            style={{
              marginTop: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            <Link
              to={info.sectorPath}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: 'var(--color-text-3)',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-3)'; }}
            >
              <ArrowLeft size={12} />
              Back to {info.sector}
            </Link>
            <span style={{ color: 'var(--color-border-hover)' }}>|</span>
            <Link
              to="/"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: 'var(--color-text-3)',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-3)'; }}
            >
              All sectors
            </Link>
          </div>
        </div>

        {/* Footnote */}
        <p
          style={{
            marginTop: 20,
            textAlign: 'center',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 10,
            color: 'var(--color-text-3)',
            letterSpacing: '0.04em',
          }}
        >
          research.wethepeopleforus.com
        </p>
      </div>
    </div>
  );
}
