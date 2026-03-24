import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ExternalLink, ArrowLeft } from 'lucide-react';

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

export default function MovedToResearchPage() {
  const { pathname } = useLocation();
  const toolKey = PATH_TO_TOOL[pathname] || '';
  const info = TOOL_INFO[toolKey];

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md text-center">
          <h1 className="font-heading text-2xl font-bold text-white mb-4">Page Not Found</h1>
          <Link to="/" className="text-blue-400 hover:text-blue-300 no-underline">Back to Home</Link>
        </div>
      </div>
    );
  }

  const researchUrl = `${RESEARCH_BASE}${info.researchPath}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="max-w-lg w-full">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 sm:p-10 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 mb-6">
            <span className="font-mono text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
              Moved to WTP Research
            </span>
          </div>

          {/* Title */}
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-white mb-3">
            {info.title}
          </h1>

          {/* Description */}
          <p className="font-body text-sm text-white/50 leading-relaxed mb-8">
            {info.description} This tool is now part of{' '}
            <span className="text-white/70 font-medium">WTP Research</span>, our dedicated
            research and analysis platform.
          </p>

          {/* CTA */}
          <a
            href={researchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-body text-sm font-semibold text-white transition-colors hover:bg-blue-500 no-underline"
          >
            Open in WTP Research
            <ExternalLink size={15} />
          </a>

          {/* Back link */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <Link
              to={info.sectorPath}
              className="inline-flex items-center gap-1.5 font-body text-xs text-white/40 hover:text-white/60 transition-colors no-underline"
            >
              <ArrowLeft size={12} />
              Back to {info.sector}
            </Link>
            <span className="text-white/10">|</span>
            <Link
              to="/"
              className="font-body text-xs text-white/40 hover:text-white/60 transition-colors no-underline"
            >
              All Sectors
            </Link>
          </div>
        </div>

        {/* Subtle note */}
        <p className="mt-6 text-center font-mono text-[10px] text-white/20">
          research.wethepeopleforus.com
        </p>
      </div>
    </div>
  );
}
