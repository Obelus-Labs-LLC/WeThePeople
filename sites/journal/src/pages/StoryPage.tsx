import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Check, Clock, FileText, Link2, Share2, ShieldCheck, ShieldAlert, ShieldQuestion,
  AlertTriangle, Bot, Flag, ChevronDown, ChevronUp,
} from 'lucide-react';
import { CategoryBadge } from '../components/CategoryBadge';
import { SectorTag } from '../components/SectorTag';
import { StoryCard } from '../components/StoryCard';
import { WhyThisMattersBlock, StoryActionPanel } from '../components/Personalization';
import { useStory } from '../hooks/useStories';
import { usePageMeta } from '../hooks/usePageMeta';
import { getApiBase } from '../api/client';

const API_BASE = getApiBase();

/**
 * Allow only protocols that can't execute script. Defends against a
 * malicious or buggy CMS putting `javascript:` or `data:` in a markdown
 * link href — even though our API content is internally trusted, this
 * is a cheap belt-and-braces guard for the public site.
 */
function safeHref(raw: string): string {
  if (!raw) return '#';
  const trimmed = raw.trim();
  // Anchors, query strings, relative paths, and absolute paths are fine.
  if (trimmed.startsWith('#') || trimmed.startsWith('?') || trimmed.startsWith('/')) {
    return trimmed;
  }
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }
  // Bare host like "example.com/page" — assume https.
  if (/^[\w-]+\.[\w.-]+/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return '#';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function shareOnTwitter(title: string) {
  const text = encodeURIComponent(title);
  const url = encodeURIComponent(window.location.href);
  window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, '_blank');
}

// ── Prose styling constants ─────────────────────────────────────────
const proseParagraphStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '17px',
  lineHeight: 1.8,
  color: 'var(--color-text-1)',
  marginBottom: '1.5rem',
};
const inlineLinkStyle: React.CSSProperties = {
  color: 'var(--color-accent-text)',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  textDecorationThickness: '1px',
};
const proseHeadingStyle = (fontSize: string): React.CSSProperties => ({
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize,
  letterSpacing: '-0.015em',
  color: 'var(--color-text-1)',
  marginTop: '2.25rem',
  marginBottom: '1rem',
  lineHeight: 1.15,
});

/**
 * Render inline markdown: **bold**, *italic*, and [links](url).
 */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)/s);
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);

    type MatchType = { type: 'link' | 'bold' | 'italic'; match: RegExpMatchArray };
    const candidates: MatchType[] = [];
    if (linkMatch) candidates.push({ type: 'link', match: linkMatch });
    if (boldMatch) candidates.push({ type: 'bold', match: boldMatch });
    if (italicMatch) candidates.push({ type: 'italic', match: italicMatch });

    if (candidates.length === 0) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    candidates.sort((a, b) => (a.match[1]?.length ?? 0) - (b.match[1]?.length ?? 0));
    const best = candidates[0];

    if (best.type === 'link' && linkMatch) {
      if (linkMatch[1]) parts.push(<span key={key++}>{linkMatch[1]}</span>);
      const href = safeHref(linkMatch[3]);
      const isExternal = href.startsWith('http');
      parts.push(
        <a
          key={key++}
          href={href}
          style={inlineLinkStyle}
          {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {linkMatch[2]}
        </a>
      );
      remaining = linkMatch[4];
    } else if (best.type === 'bold' && boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(
        <strong
          key={key++}
          style={{ color: 'var(--color-text-1)', fontWeight: 700 }}
        >
          {boldMatch[2]}
        </strong>
      );
      remaining = boldMatch[3];
    } else if (best.type === 'italic' && italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(
        <em
          key={key++}
          style={{ color: 'var(--color-text-2)', fontStyle: 'italic' }}
        >
          {italicMatch[2]}
        </em>
      );
      remaining = italicMatch[3];
    } else {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
  }
  return parts;
}

/**
 * Content renderer that handles markdown headings, bullet lists, bold, and italic.
 */
function renderContent(content: string) {
  const blocks = content.split(/\n{2,}/).filter(Boolean);
  if (blocks.length <= 1 && !content.includes('\n- ') && !content.includes('\n**')) {
    return <p style={proseParagraphStyle}>{renderInline(content)}</p>;
  }
  return blocks.map((block, i) => {
    const h2Match = block.match(/^##\s+(.+)/);
    if (h2Match) {
      return (
        <h2 key={i} style={proseHeadingStyle('28px')}>
          {h2Match[1]}
        </h2>
      );
    }
    const h3Match = block.match(/^###\s+(.+)/);
    if (h3Match) {
      return (
        <h3 key={i} style={proseHeadingStyle('22px')}>
          {h3Match[1]}
        </h3>
      );
    }

    // Tables
    const lines = block.split('\n').filter((l) => l.trim());
    const isTable =
      lines.length >= 2 &&
      lines[0].includes('|') &&
      lines[1].trim().replace(/[\s|:-]/g, '') === '';
    if (isTable) {
      // Strip the leading and trailing pipe so a row like `| a | b |`
      // doesn't produce empty cells at the ends. Keep interior empties
      // — `| a |  | b |` is a valid two-column-with-blank middle table.
      const parseRow = (row: string) => {
        const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
        return trimmed.split('|').map((c) => c.trim());
      };
      const headers = parseRow(lines[0]);
      const dataRows = lines.slice(2)
        .map(parseRow)
        // Pad short rows / truncate long ones so the column count is
        // always uniform — a malformed row used to render with extra
        // <td>s, breaking striping and CSS grid behaviour.
        .map((row) => {
          if (row.length === headers.length) return row;
          if (row.length < headers.length) {
            return [...row, ...Array(headers.length - row.length).fill('')];
          }
          return row.slice(0, headers.length);
        });
      return (
        <div
          key={i}
          className="mb-8 overflow-x-auto"
          style={{
            borderRadius: '12px',
            border: '1px solid rgba(235,229,213,0.08)',
            background: 'var(--color-surface)',
          }}
        >
          <table className="w-full text-left" style={{ fontSize: '14px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(235,229,213,0.08)', background: 'rgba(235,229,213,0.02)' }}>
                {headers.map((h, j) => (
                  <th
                    key={j}
                    style={{
                      padding: '12px 16px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-2)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, j) => (
                <tr
                  key={j}
                  style={{
                    borderTop: '1px solid rgba(235,229,213,0.04)',
                    background: j % 2 === 0 ? 'transparent' : 'rgba(235,229,213,0.02)',
                  }}
                >
                  {row.map((cell, k) => (
                    <td
                      key={k}
                      style={{
                        padding: '10px 16px',
                        fontFamily: 'var(--font-body)',
                        color: 'var(--color-text-1)',
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Bullet lists
    const linesList = block.split('\n');
    const isList =
      linesList.every((line) => line.trim().startsWith('- ') || line.trim() === '') &&
      linesList.some((line) => line.trim().startsWith('- '));
    if (isList) {
      return (
        <ul key={i} className="mb-6" style={{ marginLeft: 4, paddingLeft: 0, listStyle: 'none' }}>
          {linesList
            .filter((line) => line.trim().startsWith('- '))
            .map((line, j) => (
              <li
                key={j}
                style={{
                  ...proseParagraphStyle,
                  marginBottom: '0.5rem',
                  display: 'flex',
                  gap: 10,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    color: 'var(--color-accent-text)',
                    flexShrink: 0,
                    marginTop: 4,
                    fontWeight: 700,
                  }}
                >
                  &#8226;
                </span>
                <span>{renderInline(line.trim().slice(2))}</span>
              </li>
            ))}
        </ul>
      );
    }

    return (
      <p key={i} style={proseParagraphStyle}>
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

// ── Shared atoms for this page ─────────────────────────────────────
const metaTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
};
const metaPipeStyle: React.CSSProperties = {
  color: 'var(--color-text-3)',
  opacity: 0.45,
};
const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--color-text-1)',
};
const buttonChromeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '8px 14px',
  borderRadius: '10px',
  border: '1px solid rgba(235,229,213,0.12)',
  background: 'transparent',
  color: 'var(--color-text-2)',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

export default function StoryPage() {
  // Slug can legally be undefined when React Router can't match the
  // param (e.g. malformed URL). Defensive cast, then a hard guard
  // before the data hook fires.
  const params = useParams<{ slug?: string }>();
  const slug = params.slug;
  const { story, related, loading, relatedLoading, error } = useStory(slug);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportEmail, setReportEmail] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportError, setReportError] = useState('');
  const [correctionsOpen, setCorrectionsOpen] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }, []);

  // Auto-clear the copy-link feedback after a few seconds so the
  // button doesn't stay frozen on "Copied!" for the rest of the visit.
  useEffect(() => {
    if (copyState === 'idle') return;
    const t = setTimeout(() => setCopyState('idle'), 2400);
    return () => clearTimeout(t);
  }, [copyState]);

  // Drive per-page <title>, OG tags, JSON-LD. Bots get this from
  // middleware.js; this hook covers human users and JS-executing
  // crawlers (Googlebot, Bingbot).
  const pageDescription = useMemo(() => {
    if (!story?.summary) return undefined;
    const trimmed = story.summary.trim();
    if (trimmed.length <= 200) return trimmed;
    const slice = trimmed.slice(0, 200);
    const lastSpace = slice.lastIndexOf(' ');
    return slice.slice(0, lastSpace > 120 ? lastSpace : 200).trimEnd() + '…';
  }, [story?.summary]);

  usePageMeta(
    story
      ? {
          title: story.title,
          description: pageDescription,
          canonical: `https://journal.wethepeopleforus.com/story/${story.slug}`,
          ogType: 'article',
          ogImage: story.hero_image_url,
          publishedAt: story.published_at,
          modifiedAt: story.updated_at,
          category: story.category,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: story.title,
            description: pageDescription,
            datePublished: story.published_at,
            dateModified: story.updated_at ?? story.published_at,
            articleSection: story.category,
            url: `https://journal.wethepeopleforus.com/story/${story.slug}`,
            author: {
              '@type': 'Organization',
              name: 'WeThePeople Research',
              url: 'https://wethepeopleforus.com',
            },
            publisher: {
              '@type': 'Organization',
              name: 'The Influence Journal',
              logo: {
                '@type': 'ImageObject',
                url: 'https://journal.wethepeopleforus.com/og-image.png',
              },
            },
            ...(story.hero_image_url ? { image: [story.hero_image_url] } : {}),
          },
        }
      : {
          title: error ? 'Story Not Found' : 'Loading…',
          description: 'The Influence Journal',
        },
  );

  if (!slug) {
    return (
      <main id="main-content" className="flex-1 px-4 py-20" role="main">
        <div className="max-w-xl mx-auto text-center">
          <h1
            className="mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(32px, 5vw, 48px)',
              color: 'var(--color-text-1)',
            }}
          >
            Missing story link
          </h1>
          <Link
            to="/"
            className="inline-flex items-center gap-2 no-underline"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-text)',
            }}
          >
            <ArrowLeft size={14} />
            Back to Journal
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main id="main-content" className="flex-1 flex items-center justify-center py-20">
        <div
          role="status"
          className="animate-spin"
          style={{
            height: 32,
            width: 32,
            borderRadius: '999px',
            border: '2px solid rgba(235,229,213,0.15)',
            borderTopColor: 'var(--color-accent)',
          }}
        >
          <span className="sr-only">Loading story...</span>
        </div>
      </main>
    );
  }

  if (error || !story) {
    return (
      <main id="main-content" className="flex-1 px-4 py-20">
        <div className="max-w-xl mx-auto text-center">
          <h1
            className="mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(32px, 5vw, 48px)',
              color: 'var(--color-text-1)',
            }}
          >
            Story Not Found
          </h1>
          <p
            className="mb-6"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              color: 'var(--color-text-2)',
            }}
          >
            {error || 'This story could not be loaded.'}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 no-underline"
            style={{
              ...metaTextStyle,
              color: 'var(--color-accent-text)',
              fontSize: '12px',
            }}
          >
            <ArrowLeft size={14} />
            Back to Journal
          </Link>
        </div>
      </main>
    );
  }

  const handleReportSubmit = async () => {
    if (!reportDescription.trim() || reportSubmitting) return;
    setReportError('');
    setReportSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/stories/report-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story_slug: slug,
          reporter_email: reportEmail || null,
          description: reportDescription,
        }),
      });
      if (res.ok) {
        setReportSubmitted(true);
      } else if (res.status >= 500) {
        setReportError('Our server is having trouble. Please try again in a few seconds.');
      } else if (res.status === 429) {
        setReportError("You've sent a lot of reports — give it a moment and try again.");
      } else {
        setReportError("We couldn't accept that report. Please check the form and try again.");
      }
    } catch {
      setReportError('Network error. Check your connection and try again.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const isRetracted = story.status === 'retracted';
  const aiLabel =
    story.ai_generated === 'opus'
      ? 'AI-Enhanced'
      : story.ai_generated === 'human'
        ? 'Human-Written'
        : 'Algorithmically Generated';

  const corrections = story.corrections ?? [];

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-10 sm:py-16 relative"
      style={{ color: 'var(--color-text-1)' }}
    >
      <article className="max-w-[720px] mx-auto relative" style={{ zIndex: 1 }}>
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 no-underline mb-8 transition-colors"
          style={{ ...metaTextStyle, fontSize: '11px' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
        >
          <ArrowLeft size={12} />
          Back to Journal
        </Link>

        {/* RETRACTION BANNER */}
        {isRetracted && (
          <div
            className="mb-8"
            style={{
              borderRadius: '14px',
              border: '1.5px solid rgba(230,57,70,0.4)',
              background: 'rgba(230,57,70,0.06)',
              padding: '20px 22px',
            }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} style={{ color: 'var(--color-red)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <h2
                  className="mb-2"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontWeight: 900,
                    fontSize: '20px',
                    color: 'var(--color-red)',
                  }}
                >
                  Story Retracted
                </h2>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    lineHeight: 1.65,
                    color: 'var(--color-text-2)',
                  }}
                >
                  {story.retraction_reason ||
                    'This story has been retracted due to data accuracy concerns.'}
                </p>
                <p
                  className="mt-3"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    letterSpacing: '0.08em',
                    color: 'var(--color-text-3)',
                  }}
                >
                  WeThePeople is committed to accuracy. When we identify errors, we retract and correct. See our{' '}
                  <Link to="/corrections" style={{ ...inlineLinkStyle, color: 'var(--color-red)' }}>
                    corrections policy
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CORRECTION NOTICES */}
        {corrections.length > 0 && !isRetracted && (
          <div
            className="mb-8"
            style={{
              borderRadius: '14px',
              border: '1px solid rgba(197,160,40,0.35)',
              background: 'rgba(197,160,40,0.05)',
              padding: '16px 20px',
            }}
          >
            <button
              onClick={() => setCorrectionsOpen(!correctionsOpen)}
              className="flex items-center gap-2 w-full text-left"
              style={{
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <AlertTriangle size={16} style={{ color: 'var(--color-accent-text)', flexShrink: 0 }} />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--color-accent-text)',
                }}
              >
                {corrections.length} correction{corrections.length > 1 ? 's' : ''} issued
              </span>
              {correctionsOpen ? (
                <ChevronUp size={14} style={{ color: 'var(--color-accent-text)', marginLeft: 'auto' }} />
              ) : (
                <ChevronDown size={14} style={{ color: 'var(--color-accent-text)', marginLeft: 'auto' }} />
              )}
            </button>
            {correctionsOpen && (
              <div
                className="mt-3 space-y-3 pt-3"
                style={{ borderTop: '1px solid rgba(197,160,40,0.2)' }}
              >
                {corrections.map((c, i) => (
                  <div key={i}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: 'var(--color-accent-text)',
                      }}
                    >
                      {c.type}
                    </span>
                    {c.date && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          color: 'var(--color-text-3)',
                          marginLeft: 8,
                        }}
                      >
                        {formatDate(c.date)}
                      </span>
                    )}
                    <p
                      className="mt-1"
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '14px',
                        lineHeight: 1.6,
                        color: 'var(--color-text-2)',
                      }}
                    >
                      {c.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Category + sector */}
        <div className="flex items-center gap-2 mb-5">
          <CategoryBadge category={story.category} size="md" />
          <SectorTag sector={story.sector} />
        </div>

        {/* Title */}
        <h1
          className="mb-5"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(36px, 5.5vw, 56px)',
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            color: 'var(--color-text-1)',
          }}
        >
          {story.title}
        </h1>

        {/* Byline / meta */}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4 mb-4"
          style={{
            borderBottom: '1px solid rgba(235,229,213,0.08)',
          }}
        >
          <span
            style={{
              ...metaTextStyle,
              color: 'var(--color-text-2)',
              fontWeight: 700,
            }}
          >
            WeThePeople Research
          </span>
          <span style={metaPipeStyle}>|</span>
          <span style={metaTextStyle}>
            Edited by{' '}
            <Link
              to="/standards"
              style={{
                color: 'var(--color-text-2)',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                textDecorationThickness: '1px',
              }}
            >
              Dshon Smith
            </Link>
          </span>
          <span style={metaPipeStyle}>|</span>
          <span style={metaTextStyle}>{formatDate(story.published_at)}</span>
          <span style={metaPipeStyle}>|</span>
          <span style={{ ...metaTextStyle, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} />
            {story.read_time_minutes ?? estimateReadTime(story.body || story.content || '')} min
          </span>
          {(story.data_sources?.length ?? story.citations?.length ?? 0) > 0 && (
            <>
              <span style={metaPipeStyle}>|</span>
              <span style={{ ...metaTextStyle, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <FileText size={12} />
                {story.data_sources?.length ?? story.citations?.length ?? 0} sources
              </span>
            </>
          )}
          {story.verification_tier && (
            <>
              <span style={metaPipeStyle}>|</span>
              {story.verification_tier === 'verified' && (
                <span
                  style={{
                    ...metaTextStyle,
                    color: 'var(--color-verify)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <ShieldCheck size={12} />
                  Verified
                </span>
              )}
              {story.verification_tier === 'partially_verified' && (
                <span
                  style={{
                    ...metaTextStyle,
                    color: 'var(--color-accent-text)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <ShieldAlert size={12} />
                  Partially Verified
                </span>
              )}
              {story.verification_tier === 'unverified' && (
                <span
                  style={{
                    ...metaTextStyle,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <ShieldQuestion size={12} />
                  Unverified
                </span>
              )}
            </>
          )}
        </div>

        {/* AI / data freshness */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-10">
          <span
            style={{
              ...metaTextStyle,
              fontSize: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--color-text-3)',
            }}
          >
            <Bot size={11} />
            {aiLabel}
          </span>
          {story.data_date_range && (
            <>
              <span style={metaPipeStyle}>·</span>
              <span style={{ ...metaTextStyle, fontSize: '10px' }}>
                Data period: {story.data_date_range}
              </span>
            </>
          )}
          {story.data_freshness_at && (
            <>
              <span style={metaPipeStyle}>·</span>
              <span style={{ ...metaTextStyle, fontSize: '10px' }}>
                Data checked: {formatDate(story.data_freshness_at)}
              </span>
            </>
          )}
          {story.updated_at && story.updated_at !== story.published_at && (
            <>
              <span style={metaPipeStyle}>·</span>
              <span style={{ ...metaTextStyle, fontSize: '10px' }}>
                Last updated: {formatDate(story.updated_at)}
              </span>
            </>
          )}
        </div>

        {/* Hero image — rendered when the API supplies a hero_image_url.
            Lazy-loaded so it doesn't block the rest of the page paint. */}
        {story.hero_image_url && (
          <figure className="mb-8" style={{ margin: 0 }}>
            <img
              src={story.hero_image_url}
              alt={story.title}
              loading="lazy"
              decoding="async"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                borderRadius: '14px',
                border: '1px solid rgba(235,229,213,0.08)',
              }}
            />
          </figure>
        )}

        {/* Phase 3 outcome status bar. Hidden for state='unknown'
            and stories that don't carry an outcome row yet. Reads
            the outcome.state and renders a colored chip + last
            signal date so readers can see whether the situation
            has changed since the story dropped. */}
        {story.outcome && story.outcome.state && story.outcome.state !== 'unknown' && (
          <OutcomeStatusBar outcome={story.outcome} />
        )}

        {/* Summary / lede */}
        <div className="mb-10">
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '20px',
              lineHeight: 1.55,
              fontWeight: 500,
              color: 'var(--color-text-1)',
              borderLeft: '3px solid var(--color-accent)',
              paddingLeft: 18,
            }}
          >
            {story.summary}
          </p>
        </div>

        {/* "Why this matters to you" personalization block. Hidden for
            users without onboarding, replaced with a soft prompt. For
            onboarded users, fetches /stories/{slug}/personalization
            and renders matched lifestyle + concern anchor + reps. */}
        {slug && <WhyThisMattersBlock slug={slug} />}

        {/* 60-second simplified version toggle.
            The whole point of the platform is to make this readable
            for people who don't already follow politics. The toggle
            switches between full investigative body and a 200-300
            word plain-English version anchored in personal cost.
            Default is full body for desktop / engaged readers; a
            visible toggle invites the disengaged audience in. */}
        <SimplifiedToggle
          slug={slug!}
          initialSimplified={story.summary_simplified ?? null}
          fullBody={story.body || story.content || ''}
        />

        {/* Share buttons */}
        <div
          className="flex items-center gap-3 flex-wrap pb-10 mb-10"
          style={{ borderBottom: '1px solid rgba(235,229,213,0.08)' }}
        >
          <span style={{ ...metaTextStyle, marginRight: 4 }}>Share</span>
          <button
            onClick={copyLink}
            style={{
              ...buttonChromeStyle,
              border:
                copyState === 'copied'
                  ? '1px solid rgba(16,185,129,0.45)'
                  : copyState === 'error'
                    ? '1px solid rgba(230,57,70,0.45)'
                    : buttonChromeStyle.border,
              color:
                copyState === 'copied'
                  ? 'var(--color-verify)'
                  : copyState === 'error'
                    ? 'var(--color-red)'
                    : buttonChromeStyle.color,
            }}
            aria-live="polite"
            onMouseEnter={(e) => {
              if (copyState !== 'idle') return;
              e.currentTarget.style.borderColor = 'rgba(197,160,40,0.35)';
              e.currentTarget.style.color = 'var(--color-text-1)';
            }}
            onMouseLeave={(e) => {
              if (copyState !== 'idle') return;
              e.currentTarget.style.borderColor = 'rgba(235,229,213,0.12)';
              e.currentTarget.style.color = 'var(--color-text-2)';
            }}
            className="inline-flex items-center gap-1.5"
          >
            {copyState === 'copied' ? <Check size={12} /> : <Link2 size={12} />}
            {copyState === 'copied'
              ? 'Copied!'
              : copyState === 'error'
                ? "Couldn't copy"
                : 'Copy Link'}
          </button>
          <button
            onClick={() => shareOnTwitter(story.title)}
            style={buttonChromeStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(197,160,40,0.35)';
              e.currentTarget.style.color = 'var(--color-text-1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(235,229,213,0.12)';
              e.currentTarget.style.color = 'var(--color-text-2)';
            }}
            className="inline-flex items-center gap-1.5"
          >
            <Share2 size={12} />
            Share on X
          </button>
        </div>

        {/* Report an error */}
        <div
          className="pb-10 mb-10"
          style={{ borderBottom: '1px solid rgba(235,229,213,0.08)' }}
        >
          {!reportOpen && !reportSubmitted && (
            <button
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-2 transition-colors"
              style={{
                ...metaTextStyle,
                fontSize: '10px',
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
            >
              <Flag size={11} />
              Report an error in this story
            </button>
          )}
          {reportSubmitted && (
            <div
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(16,185,129,0.35)',
                background: 'rgba(16,185,129,0.06)',
                padding: '14px 18px',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  color: 'var(--color-verify)',
                }}
              >
                Thank you for your report. Our editorial team will review it promptly.
              </p>
            </div>
          )}
          {reportOpen && !reportSubmitted && (
            <div
              style={{
                borderRadius: '14px',
                border: '1px solid rgba(235,229,213,0.08)',
                background: 'var(--color-surface)',
                padding: '20px 22px',
              }}
            >
              <h3
                className="mb-3 flex items-center gap-2"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-1)',
                }}
              >
                <Flag size={13} style={{ color: 'var(--color-accent-text)' }} />
                Report an Error
              </h3>
              <p
                className="mb-4"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  lineHeight: 1.55,
                  color: 'var(--color-text-2)',
                }}
              >
                If you believe any information in this story is inaccurate, please describe the error below.
                Our editorial team reviews all reports.
              </p>
              <div className="space-y-3">
                <input
                  type="email"
                  placeholder="Your email (optional, for follow-up)"
                  value={reportEmail}
                  onChange={(e) => setReportEmail(e.target.value)}
                  className="w-full focus:outline-none"
                  style={{
                    background: 'rgba(235,229,213,0.03)',
                    border: '1px solid rgba(235,229,213,0.1)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    color: 'var(--color-text-1)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(197,160,40,0.4)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(235,229,213,0.1)')}
                />
                <textarea
                  placeholder="Describe the error you found..."
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  rows={3}
                  className="w-full focus:outline-none resize-none"
                  style={{
                    background: 'rgba(235,229,213,0.03)',
                    border: '1px solid rgba(235,229,213,0.1)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    color: 'var(--color-text-1)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(197,160,40,0.4)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(235,229,213,0.1)')}
                />
                {reportError && (
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      color: 'var(--color-red)',
                    }}
                  >
                    {reportError}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleReportSubmit}
                    disabled={!reportDescription.trim() || reportSubmitting}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      padding: '10px 18px',
                      borderRadius: '10px',
                      background:
                        reportDescription.trim() && !reportSubmitting
                          ? 'var(--color-accent)'
                          : 'rgba(235,229,213,0.06)',
                      color:
                        reportDescription.trim() && !reportSubmitting
                          ? '#07090C'
                          : 'var(--color-text-3)',
                      border: 0,
                      cursor:
                        reportDescription.trim() && !reportSubmitting
                          ? 'pointer'
                          : 'not-allowed',
                      transition: 'background 0.2s',
                    }}
                  >
                    {reportSubmitting ? 'Sending…' : 'Submit Report'}
                  </button>
                  <button
                    onClick={() => setReportOpen(false)}
                    style={{
                      ...metaTextStyle,
                      fontSize: '10px',
                      background: 'transparent',
                      border: 0,
                      cursor: 'pointer',
                      padding: '10px 4px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Panel. Renders 1-3 concrete next-steps for the
            reader, separated into passive (switch banks, check
            redress) and active (call rep, attend hearing). Hidden if
            no actions are configured for this story. */}
        {slug && <StoryActionPanel slug={slug} />}

        {/* Sources */}
        {((story.data_sources && story.data_sources.length > 0) ||
          (story.entity_ids && story.entity_ids.length > 0) ||
          (story.citations && story.citations.length > 0)) && (
          <section
            className="pb-10 mb-10"
            style={{ borderBottom: '1px solid rgba(235,229,213,0.08)' }}
          >
            <h2 className="mb-3" style={sectionHeadingStyle}>
              Verify This Yourself
            </h2>
            <p
              className="mb-5"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                lineHeight: 1.6,
                color: 'var(--color-text-2)',
              }}
            >
              Don&apos;t take our word for it. Every claim above is built from public government records. Click any link below to read the original filing, view the underlying contract, or browse the full dataset on our platform. If you find something that doesn&apos;t add up, tell us using the &ldquo;Report an error&rdquo; button above.
            </p>

            {/* Wayback Machine permanent archive. When the approve flow
                snapshotted this story successfully, a stable archived
                URL is available. Journalists citing this work should
                link there for permanence. */}
            {story.wayback_url && (
              <div
                className="mb-5"
                style={{
                  padding: '10px 14px',
                  background: 'rgba(235,229,213,0.03)',
                  border: '1px solid rgba(235,229,213,0.08)',
                  borderRadius: '8px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  color: 'var(--color-text-2)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-3)',
                    marginRight: 8,
                  }}
                >
                  Citing this story?
                </span>
                Use the permanent{' '}
                <a
                  href={safeHref(story.wayback_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--color-accent-text)',
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                  }}
                >
                  Internet Archive snapshot
                </a>
                {story.wayback_archived_at &&
                  ` (archived ${formatDate(story.wayback_archived_at)})`}
                . Citation survives if this site ever moves.
              </div>
            )}

            {/* Government data sources */}
            {story.data_sources && story.data_sources.length > 0 && (
              <div className="mb-6">
                <h3
                  className="mb-3"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-2)',
                  }}
                >
                  Government Data Sources
                </h3>
                <div className="space-y-2">
                  {story.data_sources.map((src, i) => {
                    const info = dataSourceInfo(src);
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3"
                        style={{
                          borderRadius: '10px',
                          border: '1px solid rgba(235,229,213,0.08)',
                          background: 'rgba(235,229,213,0.02)',
                          padding: '10px 14px',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'var(--color-accent-text)',
                            flexShrink: 0,
                          }}
                        >
                          [{i + 1}]
                        </span>
                        <div className="flex-1 min-w-0">
                          <span
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '14px',
                              color: 'var(--color-text-1)',
                            }}
                          >
                            {info.label}
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: 'var(--color-text-3)',
                              marginLeft: 8,
                            }}
                          >
                            ({src})
                          </span>
                        </div>
                        {info.url && (
                          <a
                            href={info.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10px',
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              color: 'var(--color-accent-text)',
                              textDecoration: 'none',
                              flexShrink: 0,
                            }}
                          >
                            Original source
                          </a>
                        )}
                        {info.wtpPath && (
                          <a
                            href={`https://wethepeopleforus.com${info.wtpPath}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10px',
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              color: 'var(--color-dem)',
                              textDecoration: 'none',
                              flexShrink: 0,
                            }}
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

            {/* Entities */}
            {Array.isArray(story.entity_ids) &&
              story.entity_ids.filter((e): e is string => typeof e === 'string' && e.length > 0).length > 0 && (
              <div className="mb-6">
                <h3
                  className="mb-3"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-2)',
                  }}
                >
                  Entities Referenced
                </h3>
                <div className="flex flex-wrap gap-2">
                  {story.entity_ids
                    .filter((e): e is string => typeof e === 'string' && e.length > 0)
                    .map((eid, i) => {
                    // Person IDs in our schema are snake_case (e.g.
                    // `peters_gary`, `pelosi_nancy`). Company / org IDs
                    // are kebab-case or single words (`qualcomm`,
                    // `general-atomics`). The presence of an underscore
                    // is the strongest signal we have without an
                    // explicit `entity_type` on the API response.
                    const isPerson = eid.includes('_') && !eid.includes('-');
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
                    const displayName = eid
                      .replace(/-/g, ' ')
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <a
                        key={i}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 no-underline transition-colors"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(235,229,213,0.1)',
                          background: 'rgba(235,229,213,0.02)',
                          color: 'var(--color-text-1)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(197,160,40,0.35)';
                          e.currentTarget.style.color = 'var(--color-accent-text)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(235,229,213,0.1)';
                          e.currentTarget.style.color = 'var(--color-text-1)';
                        }}
                      >
                        {displayName}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Legacy citations */}
            {story.citations && story.citations.length > 0 && (
              <div>
                <h3
                  className="mb-3"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-2)',
                  }}
                >
                  Citations
                </h3>
                <ol className="space-y-3" style={{ listStyle: 'none', paddingLeft: 0 }}>
                  {story.citations.map((cite, i) => (
                    <li key={i} className="flex gap-3">
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: 'var(--color-accent-text)',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        [{i + 1}]
                      </span>
                      <div>
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '14px',
                            color: 'var(--color-text-1)',
                          }}
                        >
                          {cite.label}
                        </span>
                        {cite.source_type && (
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: 'var(--color-text-3)',
                              marginLeft: 8,
                            }}
                          >
                            ({cite.source_type})
                          </span>
                        )}
                        {cite.url && (
                          <a
                            href={cite.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10px',
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              color: 'var(--color-accent-text)',
                              textDecoration: 'none',
                            }}
                          >
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

        <div
          className="mb-12"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'var(--color-text-3)',
          }}
        >
          For data sources and verification methodology, see{' '}
          <a
            href="https://wethepeopleforus.com/methodology"
            style={inlineLinkStyle}
          >
            our methodology page
          </a>
          .
        </div>

        {/* Related stories. Render a skeleton while related is fetching
            so the slot doesn't pop in awkwardly after the rest of the
            page has settled. */}
        {(relatedLoading || related.length > 0) && (
          <section>
            <h2
              className="mb-5"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: '28px',
                letterSpacing: '-0.015em',
                color: 'var(--color-text-1)',
              }}
            >
              More Investigations
            </h2>
            {relatedLoading && related.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-hidden>
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 140,
                      borderRadius: '14px',
                      border: '1px solid rgba(235,229,213,0.08)',
                      background:
                        'linear-gradient(90deg, rgba(235,229,213,0.02) 0%, rgba(235,229,213,0.06) 50%, rgba(235,229,213,0.02) 100%)',
                      backgroundSize: '200% 100%',
                      animation: 'wtp-skeleton 1.4s ease-in-out infinite',
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {related.map((s) => (
                  <StoryCard key={s.slug} story={s} />
                ))}
              </div>
            )}
          </section>
        )}
      </article>
    </main>
  );
}


/**
 * Simplified-summary toggle. Renders a tab pair above the body:
 *   "Full story" — the original investigative body (default).
 *   "60-second version" — the plain-English version, anchored in
 *                          personal cost where possible.
 *
 * The simplified version is generated lazily by the API. First click
 * triggers a fetch; subsequent toggles are instant. Failure modes
 * (no API key, network error) hide the simplified tab so the reader
 * never sees a broken state.
 */
function SimplifiedToggle({
  slug,
  initialSimplified,
  fullBody,
}: {
  slug: string;
  initialSimplified: string | null;
  fullBody: string;
}) {
  const [simplified, setSimplified] = useState<string | null>(initialSimplified);
  const [mode, setMode] = useState<'full' | 'simple'>('full');
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  // Background prefetch. The simplified version is generated lazily
  // and the first call can take 5-15 seconds (Haiku cold). Firing
  // the request as soon as the story mounts means the toggle is
  // usually instant by the time the user clicks. We never set
  // `loading` for the prefetch path so the toggle UI doesn't show
  // a spinner the user didn't ask for; failures stay silent.
  useEffect(() => {
    if (simplified || !slug) return;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 25_000);
    fetch(`${API_BASE}/stories/${slug}/simplified`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.simplified && typeof d.simplified === 'string') {
          setSimplified(d.simplified);
        }
      })
      .catch(() => {
        /* silent — explicit click can still surface the error */
      })
      .finally(() => clearTimeout(t));
    return () => {
      controller.abort();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const requestSimplified = useCallback(async () => {
    if (simplified) {
      setMode('simple');
      return;
    }
    // Switch to simple mode immediately so the reader sees the
    // loading state in-context (under the lede) instead of being
    // stuck staring at a Loading button. The simple-mode block
    // below renders its own spinner-style message until the
    // request resolves.
    setMode('simple');
    setLoading(true);
    setErrored(false);
    // 25-second cap. Cold generation takes ~5s; the gateway kills
    // requests at 30s. If we time out, hide the toggle so the user
    // doesn't keep re-clicking and triggering more LLM calls.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(
        `${API_BASE}/stories/${slug}/simplified`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.simplified && typeof data.simplified === 'string') {
        setSimplified(data.simplified);
      } else {
        setErrored(true);
        setMode('full');
      }
    } catch {
      setErrored(true);
      setMode('full');
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [simplified, slug]);

  // The toggle row hides itself entirely when the simplified version
  // failed to generate — no point dangling a broken tab.
  const showToggle = !errored;

  const tabBaseStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    padding: '10px 16px',
    borderRadius: '10px',
    border: '1px solid rgba(235,229,213,0.12)',
    cursor: 'pointer',
    background: 'transparent',
    color: 'var(--color-text-2)',
    transition: 'all 0.2s',
  };
  const tabActiveStyle: React.CSSProperties = {
    ...tabBaseStyle,
    background: 'var(--color-accent)',
    color: '#07090C',
    borderColor: 'var(--color-accent)',
  };

  return (
    <>
      {showToggle && (
        <div
          className="mb-6 flex items-center gap-2 flex-wrap"
          style={{ alignItems: 'center' }}
        >
          <button
            type="button"
            onClick={() => setMode('full')}
            style={mode === 'full' ? tabActiveStyle : tabBaseStyle}
          >
            Full story
          </button>
          <button
            type="button"
            onClick={requestSimplified}
            disabled={loading}
            style={{
              ...(mode === 'simple' ? tabActiveStyle : tabBaseStyle),
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Loading...' : '60-second version'}
          </button>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              marginLeft: 4,
            }}
          >
            {mode === 'simple' ? 'Plain English. ~250 words.' : 'Full investigation.'}
          </span>
        </div>
      )}

      {mode === 'simple' && simplified ? (
        <div
          className="mb-12"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '17px',
            lineHeight: 1.7,
            color: 'var(--color-text-1)',
            background: 'rgba(197,160,40,0.04)',
            border: '1px solid rgba(197,160,40,0.18)',
            borderRadius: '14px',
            padding: '24px 26px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {simplified}
        </div>
      ) : mode === 'simple' && loading ? (
        <div
          className="mb-12 flex items-center gap-3"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '15px',
            lineHeight: 1.6,
            color: 'var(--color-text-2)',
            background: 'rgba(197,160,40,0.04)',
            border: '1px solid rgba(197,160,40,0.18)',
            borderRadius: '14px',
            padding: '20px 22px',
          }}
          aria-live="polite"
        >
          <div
            aria-hidden
            className="animate-spin"
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '2px solid rgba(197,160,40,0.4)',
              borderTopColor: 'var(--color-accent)',
              flexShrink: 0,
            }}
          />
          <span>
            Writing the 60-second version. Takes a few seconds the first
            time someone asks for this story.
          </span>
        </div>
      ) : (
        <div className="mb-12">{renderContent(fullBody)}</div>
      )}
    </>
  );
}


// ─────────────────────────────────────────────────────────────────────
// Outcome status bar — Phase 3 thread B
// ─────────────────────────────────────────────────────────────────────

interface OutcomePayload {
  state: string;
  note: string | null;
  last_signal_at: string | null;
}

const OUTCOME_PALETTE: Record<string, { bg: string; border: string; fg: string; label: string }> = {
  open:     { bg: 'rgba(235,229,213,0.04)', border: 'rgba(235,229,213,0.18)', fg: 'var(--color-text-2)', label: 'Open · still developing' },
  improved: { bg: 'rgba(61,213,199,0.06)',  border: 'rgba(61,213,199,0.30)',  fg: '#3DD5C7',             label: 'Improved' },
  worsened: { bg: 'rgba(230,57,70,0.06)',   border: 'rgba(230,57,70,0.30)',   fg: '#F19BA1',             label: 'Worsened' },
  resolved: { bg: 'rgba(197,160,40,0.06)',  border: 'rgba(197,160,40,0.30)',  fg: 'var(--color-accent-text)', label: 'Resolved' },
};

function OutcomeStatusBar({ outcome }: { outcome: OutcomePayload }) {
  const palette = OUTCOME_PALETTE[outcome.state] ?? OUTCOME_PALETTE.open;
  const lastDate = (() => {
    if (!outcome.last_signal_at) return null;
    try {
      return new Date(outcome.last_signal_at).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch {
      return null;
    }
  })();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        marginBottom: 18,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: palette.fg,
          padding: '3px 10px',
          borderRadius: 999,
          border: `1px solid ${palette.border}`,
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        {palette.label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'var(--color-text-2)',
          flex: '1 1 auto',
          minWidth: 0,
        }}
      >
        {outcome.note || 'Status updated based on the latest public records.'}
      </span>
      {lastDate && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-text-3)',
            whiteSpace: 'nowrap',
          }}
        >
          As of {lastDate}
        </span>
      )}
    </div>
  );
}
