import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, FileText, Link2, Share2, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { CategoryBadge } from '../components/CategoryBadge';
import { SectorTag } from '../components/SectorTag';
import { StoryCard } from '../components/StoryCard';
import { useStory } from '../hooks/useStories';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function copyLink() {
  navigator.clipboard.writeText(window.location.href).catch(() => {});
}

function shareOnTwitter(title: string) {
  const text = encodeURIComponent(title);
  const url = encodeURIComponent(window.location.href);
  window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, '_blank');
}

/**
 * Render inline markdown: **bold**, *italic*, and [links](url).
 */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++} className="text-white font-semibold">{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }
    // Italic: *text*
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++} className="text-zinc-400 italic">{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }
    // No more matches
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }
  return parts;
}

/**
 * Content renderer that handles markdown headings, bullet lists, bold, and italic.
 */
function renderContent(content: string) {
  const blocks = content.split(/\n{2,}/).filter(Boolean);
  if (blocks.length <= 1 && !content.includes('\n- ') && !content.includes('\n**')) {
    return <p className="text-zinc-300 leading-[1.85] text-base">{renderInline(content)}</p>;
  }
  return blocks.map((block, i) => {
    // Handle markdown ## headings
    const h2Match = block.match(/^##\s+(.+)/);
    if (h2Match) {
      return (
        <h2 key={i} className="text-xl font-bold text-white mt-8 mb-4" style={{ fontFamily: 'Oswald, sans-serif' }}>
          {h2Match[1]}
        </h2>
      );
    }
    const h3Match = block.match(/^###\s+(.+)/);
    if (h3Match) {
      return (
        <h3 key={i} className="text-lg font-bold text-white mt-6 mb-3" style={{ fontFamily: 'Oswald, sans-serif' }}>
          {h3Match[1]}
        </h3>
      );
    }
    // Handle bullet lists (lines starting with -)
    const lines = block.split('\n');
    const isList = lines.every(line => line.trim().startsWith('- ') || line.trim() === '');
    if (isList && lines.some(line => line.trim().startsWith('- '))) {
      return (
        <ul key={i} className="mb-6 space-y-2 ml-1">
          {lines.filter(line => line.trim().startsWith('- ')).map((line, j) => (
            <li key={j} className="flex gap-2 text-zinc-300 leading-[1.85] text-base">
              <span className="text-amber-400 shrink-0 mt-0.5">&#8226;</span>
              <span>{renderInline(line.trim().slice(2))}</span>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="text-zinc-300 leading-[1.85] text-base mb-6">
        {renderInline(block)}
      </p>
    );
  });
}

function estimateReadTime(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

const DATA_SOURCE_MAP: Record<string, { label: string; url?: string; wtpPath?: string }> = {
  lobbying_records: { label: 'Senate Lobbying Disclosure Act Filings', url: 'https://lda.senate.gov/filings/public/filing/search/', wtpPath: '/influence' },
  finance_lobbying_records: { label: 'Finance Sector Lobbying Filings', url: 'https://lda.senate.gov/filings/public/filing/search/', wtpPath: '/finance' },
  health_lobbying_records: { label: 'Health Sector Lobbying Filings', url: 'https://lda.senate.gov/filings/public/filing/search/', wtpPath: '/health' },
  tech_lobbying_records: { label: 'Tech Sector Lobbying Filings', url: 'https://lda.senate.gov/filings/public/filing/search/', wtpPath: '/technology' },
  energy_lobbying_records: { label: 'Energy Sector Lobbying Filings', url: 'https://lda.senate.gov/filings/public/filing/search/', wtpPath: '/energy' },
  defense_lobbying_records: { label: 'Defense Sector Lobbying Filings', url: 'https://lda.senate.gov/filings/public/filing/search/', wtpPath: '/defense' },
  transportation_lobbying_records: { label: 'Transportation Sector Lobbying Filings', url: 'https://lda.senate.gov/filings/public/filing/search/', wtpPath: '/transportation' },
  government_contracts: { label: 'USASpending.gov Federal Contracts', url: 'https://www.usaspending.gov/search', wtpPath: '/influence' },
  finance_government_contracts: { label: 'Finance Sector Federal Contracts', url: 'https://www.usaspending.gov/search', wtpPath: '/finance' },
  health_government_contracts: { label: 'Health Sector Federal Contracts', url: 'https://www.usaspending.gov/search', wtpPath: '/health' },
  tech_government_contracts: { label: 'Tech Sector Federal Contracts', url: 'https://www.usaspending.gov/search', wtpPath: '/technology' },
  energy_government_contracts: { label: 'Energy Sector Federal Contracts', url: 'https://www.usaspending.gov/search', wtpPath: '/energy' },
  defense_government_contracts: { label: 'Defense Sector Federal Contracts', url: 'https://www.usaspending.gov/search', wtpPath: '/defense' },
  enforcement_actions: { label: 'Federal Register Enforcement Actions', url: 'https://www.federalregister.gov/', wtpPath: '/influence' },
  finance_enforcement_actions: { label: 'Finance Enforcement Actions', url: 'https://www.federalregister.gov/' },
  health_enforcement_actions: { label: 'Health Enforcement Actions', url: 'https://www.federalregister.gov/' },
  defense_enforcement_actions: { label: 'Defense Enforcement Actions', url: 'https://www.federalregister.gov/' },
  congressional_trades: { label: 'Congressional Stock Trades', url: 'https://disclosures-clerk.house.gov/FinancialDisclosure', wtpPath: '/politics/trades' },
  company_donations: { label: 'FEC Campaign Donations', url: 'https://www.fec.gov/data/', wtpPath: '/politics' },
  committees: { label: 'Congressional Committee Data', url: 'https://github.com/unitedstates/congress-legislators', wtpPath: '/politics' },
  committee_memberships: { label: 'Committee Membership Records', url: 'https://github.com/unitedstates/congress-legislators', wtpPath: '/politics' },
  tracked_members: { label: 'Congressional Member Profiles', wtpPath: '/politics' },
  tracked_tech_companies: { label: 'Tracked Technology Companies', wtpPath: '/technology' },
  tracked_companies: { label: 'Tracked Health Companies', wtpPath: '/health' },
  tracked_institutions: { label: 'Tracked Financial Institutions', wtpPath: '/finance' },
  tracked_energy_companies: { label: 'Tracked Energy Companies', wtpPath: '/energy' },
  tracked_defense_companies: { label: 'Tracked Defense Companies', wtpPath: '/defense' },
  sec_filings: { label: 'SEC EDGAR Filings', url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany' },
  fda_recalls: { label: 'FDA Recall Database', url: 'https://www.accessdata.fda.gov/scripts/cder/daf/' },
  votes: { label: 'Congressional Roll Call Votes', url: 'https://www.senate.gov/legislative/votes.htm', wtpPath: '/politics' },
  bills: { label: 'Congressional Legislation', url: 'https://www.congress.gov/', wtpPath: '/politics' },
  bill_actions: { label: 'Congressional Bill Actions', url: 'https://www.congress.gov/' },
};

function dataSourceInfo(tableName: string): { label: string; url?: string; wtpPath?: string } {
  return DATA_SOURCE_MAP[tableName] ?? {
    label: tableName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

export default function StoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { story, related, loading, error } = useStory(slug);

  if (loading) {
    return (
      <main id="main-content" className="flex-1 flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" role="status"><span className="sr-only">Loading story...</span></div>
      </main>
    );
  }

  if (error || !story) {
    return (
      <main id="main-content" className="flex-1 px-4 py-20">
        <div className="max-w-xl mx-auto text-center">
          <h1
            className="text-3xl font-bold text-white mb-4"
            style={{ fontFamily: 'Oswald, sans-serif' }}
          >
            Story Not Found
          </h1>
          <p className="text-zinc-400 mb-6">
            {error || 'This story could not be loaded.'}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Journal
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="flex-1 px-4 py-10 sm:py-16">
      <article className="max-w-[720px] mx-auto">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          Back to Journal
        </Link>

        {/* Category + sector */}
        <div className="flex items-center gap-2 mb-4">
          <CategoryBadge category={story.category} size="md" />
          <SectorTag sector={story.sector} />
        </div>

        {/* Title */}
        <h1
          className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-5"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          {story.title}
        </h1>

        {/* Byline */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500 mb-8 pb-8 border-b border-zinc-800">
          <span className="font-medium text-zinc-400">WeThePeople Research</span>
          <span className="text-zinc-700">|</span>
          <span>{formatDate(story.published_at)}</span>
          <span className="text-zinc-700">|</span>
          <span className="flex items-center gap-1">
            <Clock size={14} />
            {story.read_time_minutes ?? estimateReadTime(story.body || story.content || '')} min read
          </span>
          {(story.data_sources?.length ?? story.citations?.length ?? 0) > 0 && (
            <>
              <span className="text-zinc-700">|</span>
              <span className="flex items-center gap-1">
                <FileText size={14} />
                {story.data_sources?.length ?? story.citations?.length ?? 0} data sources
              </span>
            </>
          )}
          {story.verification_tier && (
            <>
              <span className="text-zinc-700">|</span>
              {story.verification_tier === 'verified' && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <ShieldCheck size={14} />
                  Verified
                </span>
              )}
              {story.verification_tier === 'partially_verified' && (
                <span className="flex items-center gap-1 text-amber-400">
                  <ShieldAlert size={14} />
                  Partially Verified
                </span>
              )}
              {story.verification_tier === 'unverified' && (
                <span className="flex items-center gap-1 text-zinc-500">
                  <ShieldQuestion size={14} />
                  Unverified
                </span>
              )}
            </>
          )}
        </div>

        {/* Summary / lede */}
        <div className="mb-8">
          <p className="text-lg text-zinc-300 leading-relaxed font-medium">
            {story.summary}
          </p>
        </div>

        {/* Body */}
        <div className="mb-12">
          {renderContent(story.body || story.content || '')}
        </div>

        {/* Share buttons */}
        <div className="flex items-center gap-3 mb-10 pb-10 border-b border-zinc-800">
          <span className="text-xs text-zinc-500 uppercase tracking-wider mr-2">Share</span>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer bg-transparent"
          >
            <Link2 size={14} />
            Copy Link
          </button>
          <button
            onClick={() => shareOnTwitter(story.title)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer bg-transparent"
          >
            <Share2 size={14} />
            Share on X
          </button>
        </div>

        {/* Sources — data tables + original government sources + entity links */}
        {((story.data_sources && story.data_sources.length > 0) || (story.entity_ids && story.entity_ids.length > 0) || (story.citations && story.citations.length > 0)) && (
          <section className="mb-10 pb-10 border-b border-zinc-800">
            <h2
              className="text-xl font-bold text-white mb-4"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              Sources & Data
            </h2>
            <p className="text-xs text-zinc-500 mb-5">
              All data sourced from public government records. Click to view original sources or explore on our platform.
            </p>

            {/* Government data sources */}
            {story.data_sources && story.data_sources.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Government Data Sources</h3>
                <div className="space-y-2">
                  {story.data_sources.map((src, i) => {
                    const info = dataSourceInfo(src);
                    return (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-2.5">
                        <span className="text-amber-400 font-mono text-xs shrink-0">[{i + 1}]</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-zinc-300">{info.label}</span>
                          <span className="text-xs text-zinc-600 ml-2">({src})</span>
                        </div>
                        {info.url && (
                          <a
                            href={info.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-amber-400/70 hover:text-amber-400 transition-colors shrink-0"
                          >
                            Original source
                          </a>
                        )}
                        {info.wtpPath && (
                          <a
                            href={`https://wethepeopleforus.com${info.wtpPath}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400/70 hover:text-blue-400 transition-colors shrink-0"
                          >
                            View on WTP
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Entities referenced */}
            {story.entity_ids && story.entity_ids.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Entities Referenced</h3>
                <div className="flex flex-wrap gap-2">
                  {story.entity_ids.map((eid, i) => {
                    // Detect person IDs (underscore-separated names like josh_gottheimer)
                    // vs company IDs (dash-separated like nvidia, lockheed-martin)
                    const isPerson = eid.includes('_') && !eid.includes('-');
                    // Map DB sector names to frontend route prefixes
                    const sectorRouteMap: Record<string, string> = {
                      tech: 'technology',
                      technology: 'technology',
                      finance: 'finance',
                      health: 'health',
                      energy: 'energy',
                      transportation: 'transportation',
                      defense: 'defense',
                      chemicals: 'chemicals',
                      agriculture: 'agriculture',
                      telecom: 'telecom',
                      education: 'education',
                      politics: 'politics',
                    };
                    const sectorRoute = sectorRouteMap[story.sector || ''] || 'influence';
                    const href = isPerson
                      ? `https://wethepeopleforus.com/politics/people/${eid}`
                      : `https://wethepeopleforus.com/${sectorRoute}/${eid}`;
                    const displayName = eid.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <a
                        key={i}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/30 text-xs text-zinc-300 hover:text-white hover:border-amber-500/30 transition-colors"
                      >
                        {displayName}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Legacy citations (if any) */}
            {story.citations && story.citations.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Citations</h3>
                <ol className="space-y-3">
                  {story.citations.map((cite, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="text-amber-400 font-mono text-xs mt-0.5 shrink-0">[{i + 1}]</span>
                      <div>
                        <span className="text-zinc-300">{cite.label}</span>
                        {cite.source_type && <span className="text-zinc-600 ml-2 text-xs">({cite.source_type})</span>}
                        {cite.url && (
                          <a href={cite.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-amber-400/70 hover:text-amber-400 text-xs transition-colors">
                            View source
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}

        {/* Disclaimer */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 mb-12">
          <p className="text-xs text-zinc-500 leading-relaxed">
            <span className="font-semibold text-zinc-400">Disclaimer:</span>{' '}
            This investigation is based entirely on public government records.
            No editorial opinions are expressed. Data is sourced from
            Senate LDA filings, USASpending.gov, SEC EDGAR, Federal Register,
            and other publicly available government databases. For methodology
            details, visit{' '}
            <a
              href="https://wethepeopleforus.com/methodology"
              className="text-amber-400/70 hover:text-amber-400 transition-colors"
            >
              our methodology page
            </a>.
          </p>
        </div>

        {/* Related stories */}
        {related.length > 0 && (
          <section>
            <h2
              className="text-xl font-bold text-white mb-5"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              More Investigations
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {related.map((s) => (
                <StoryCard key={s.slug} story={s} />
              ))}
            </div>
          </section>
        )}
      </article>
    </main>
  );
}
