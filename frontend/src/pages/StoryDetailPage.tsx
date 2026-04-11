import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Newspaper, Calendar, Tag, Clock, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import ShareButton from '../components/ShareButton';
import { getApiBaseUrl } from '../api/client';

interface StoryDetail {
  id: number;
  title: string;
  slug: string;
  summary: string;
  body: string;
  category: string;
  sector: string | null;
  entity_ids: string[];
  data_sources: string[];
  evidence: Record<string, unknown>;
  status: string;
  published_at: string | null;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  lobbying_spike: 'Lobbying Spike',
  contract_windfall: 'Contract Windfall',
  enforcement_gap: 'Enforcement Gap',
  trade_cluster: 'Trade Cluster',
  cross_sector: 'Cross-Sector',
  regulatory_influence: 'Regulatory Influence',
  it_failure: 'IT Failure',
};

const CATEGORY_COLORS: Record<string, string> = {
  lobbying_spike: 'text-amber-400',
  contract_windfall: 'text-emerald-400',
  enforcement_gap: 'text-red-400',
  trade_cluster: 'text-purple-400',
  cross_sector: 'text-blue-400',
  regulatory_influence: 'text-orange-400',
  it_failure: 'text-rose-400',
};

/** Maps raw data source keys to human-readable labels and WTP internal links or external URLs. */
const SOURCE_MAP: Record<string, { label: string; url: string; external?: boolean }> = {
  senate_lda: { label: 'Senate Lobbying Disclosure Act Filings', url: '/politics/lobbying' },
  usaspending: { label: 'USASpending.gov Contract Awards', url: 'https://www.usaspending.gov', external: true },
  federal_register: { label: 'Federal Register Regulatory Actions', url: 'https://www.federalregister.gov', external: true },
  congress: { label: 'Congress.gov Legislative Records', url: '/politics/legislation' },
  fec: { label: 'Federal Election Commission Filings', url: 'https://www.fec.gov', external: true },
  sec_edgar: { label: 'SEC EDGAR Corporate Filings', url: 'https://www.sec.gov/cgi-bin/browse-edgar', external: true },
  quiver: { label: 'Congressional Trading Disclosures', url: '/politics/trades' },
  openfda: { label: 'FDA Adverse Event & Recall Database', url: 'https://open.fda.gov', external: true },
  clinicaltrials: { label: 'ClinicalTrials.gov Registry', url: 'https://clinicaltrials.gov', external: true },
  cms_payments: { label: 'CMS Open Payments Database', url: 'https://openpaymentsdata.cms.gov', external: true },
  nhtsa: { label: 'NHTSA Vehicle Safety Records', url: 'https://www.nhtsa.gov', external: true },
  epa_ghgrp: { label: 'EPA Greenhouse Gas Reporting Program', url: 'https://www.epa.gov/ghgreporting', external: true },
  patentsview: { label: 'USPTO PatentsView Database', url: 'https://patentsview.org', external: true },
  opensanctions: { label: 'OpenSanctions PEP & Sanctions Database', url: 'https://www.opensanctions.org', external: true },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function estimateReadTime(body: string | undefined, summary: string): string {
  const text = (summary || '') + ' ' + (body || '');
  const words = text.split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

function resolveSource(key: string): { label: string; url: string; external?: boolean } {
  if (SOURCE_MAP[key]) return SOURCE_MAP[key];
  // Fallback: humanize the key
  const label = key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, url: '' };
}

/** Map sector to the relevant contracts/enforcement/lobbying base path */
function sectorBasePath(sector: string | null): string {
  if (!sector) return '/politics';
  const map: Record<string, string> = {
    politics: '/politics',
    finance: '/finance',
    health: '/health',
    tech: '/technology',
    energy: '/energy',
    transportation: '/transportation',
    defense: '/defense',
  };
  return map[sector] || '/politics';
}

export default function StoryDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`${getApiBaseUrl()}/stories/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Story not found');
        return r.json();
      })
      .then((d) => setStory(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center">
        <Newspaper className="w-12 h-12 text-white/20 mb-4" />
        <p className="text-white/40 mb-4">Story not found</p>
        <Link to="/stories" className="text-blue-400 hover:text-blue-300 text-sm no-underline">
          Back to The Influence Journal
        </Link>
      </div>
    );
  }

  const basePath = sectorBasePath(story.sector);
  const readTime = estimateReadTime(story.body, story.summary);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12">
        {/* Back link */}
        <Link to="/stories" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/60 no-underline mb-10">
          <ArrowLeft className="w-4 h-4" /> The Influence Journal
        </Link>

        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Category + Sector badges */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <span className={`text-xs font-bold uppercase tracking-wider ${CATEGORY_COLORS[story.category] || 'text-white/40'}`}>
              {CATEGORY_LABELS[story.category] || story.category}
            </span>
            {story.sector && (
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/40 uppercase">
                {story.sector}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="font-['Oswald',_sans-serif] text-3xl sm:text-4xl lg:text-[2.75rem] font-bold leading-tight mb-5">
            {story.title}
          </h1>

          {/* Byline + meta */}
          <div className="flex flex-wrap items-center gap-4 pb-6 mb-8 border-b border-white/10">
            <span className="text-sm text-white/40">WeThePeople Research</span>
            {story.published_at && (
              <span className="inline-flex items-center gap-1.5 text-sm text-white/30">
                <Calendar className="w-3.5 h-3.5" />
                {fmtDate(story.published_at)}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-sm text-white/30">
              <Clock className="w-3.5 h-3.5" />
              {readTime}
            </span>
            {story.data_sources && story.data_sources.length > 0 && (
              <span className="text-sm text-white/30">
                {story.data_sources.length} cited source{story.data_sources.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Summary / lede */}
          {story.summary && (
            <p className="text-lg sm:text-xl text-white/60 leading-relaxed mb-10 max-w-2xl">
              {story.summary}
            </p>
          )}

          {/* Body - article-width readable column */}
          <div className="max-w-2xl mb-12">
            {(() => {
              const bodyLines = (story.body || '').split('\n');
              const elements: React.ReactNode[] = [];
              let i = 0;
              while (i < bodyLines.length) {
                const line = bodyLines[i];
                if (!line.trim()) { i++; continue; }

                // Detect markdown table (header | separator | data rows)
                if (line.includes('|') && i + 1 < bodyLines.length && bodyLines[i + 1].trim().replace(/[\s|:-]/g, '') === '') {
                  const parseRow = (r: string) => r.split('|').map(c => c.trim()).filter(Boolean);
                  const headers = parseRow(line);
                  i += 2; // skip header + separator
                  const dataRows: string[][] = [];
                  while (i < bodyLines.length && bodyLines[i].includes('|') && bodyLines[i].trim()) {
                    dataRows.push(parseRow(bodyLines[i]));
                    i++;
                  }
                  elements.push(
                    <div key={`tbl-${i}`} className="mb-6 overflow-x-auto rounded-lg border border-white/10">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/[0.03]">
                            {headers.map((h, j) => (
                              <th key={j} className="px-4 py-2.5 text-white/40 font-semibold text-xs uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dataRows.map((row, j) => (
                            <tr key={j} className={j % 2 === 0 ? 'bg-white/[0.01]' : 'bg-white/[0.03]'}>
                              {row.map((cell, k) => (
                                <td key={k} className="px-4 py-2 text-white/70 text-sm border-t border-white/5">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                  continue;
                }

                if (line.startsWith('## ')) {
                  elements.push(
                    <h2 key={i} className="font-['Oswald',_sans-serif] text-xl sm:text-2xl font-bold text-white mt-10 mb-4">
                      {line.slice(3)}
                    </h2>
                  );
                } else if (line.startsWith('### ')) {
                  elements.push(
                    <h3 key={i} className="font-['Oswald',_sans-serif] text-lg font-bold text-white mt-8 mb-3">
                      {line.slice(4)}
                    </h3>
                  );
                } else if (line.startsWith('- ')) {
                  elements.push(
                    <li key={i} className="text-white/70 ml-4 mb-1 leading-relaxed" style={{ lineHeight: '1.8' }}>
                      {line.slice(2)}
                    </li>
                  );
                } else {
                  const parts = line.split(/\*\*(.*?)\*\*/g);
                  elements.push(
                    <p key={i} className="text-white/70 mb-5" style={{ lineHeight: '1.85' }}>
                      {parts.map((part, j) =>
                        j % 2 === 1 ? <strong key={j} className="text-white font-semibold">{part}</strong> : part
                      )}
                    </p>
                  );
                }
                i++;
              }
              return elements;
            })()}
          </div>

          {/* Evidence data */}
          {story.evidence && Object.keys(story.evidence).length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 mb-10 max-w-2xl">
              <h3 className="font-['Oswald',_sans-serif] text-sm font-bold uppercase tracking-wider text-white/40 mb-4">
                Key Data Points
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {Object.entries(story.evidence).map(([key, val]) => {
                  if (typeof val === 'object' || key === 'source_table' || key === 'source_tables') return null;
                  const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                  let display = String(val);
                  if (typeof val === 'number' && val > 10000) {
                    display = `$${(val / 1000000).toFixed(1)}M`;
                  }
                  return (
                    <div key={key} className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-[10px] text-white/30 uppercase tracking-wider">{label}</p>
                      <p className="text-sm text-white font-mono mt-1">{display}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Entity links */}
          {story.entity_ids && story.entity_ids.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-10 max-w-2xl">
              <span className="text-xs text-white/30">Related entities:</span>
              {story.entity_ids.map((eid) => (
                <span key={eid} className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-white/50">
                  {eid}
                </span>
              ))}
            </div>
          )}

          {/* ========== SOURCES & CITATIONS ========== */}
          {story.data_sources && story.data_sources.length > 0 && (
            <div className="max-w-2xl mb-10 pt-8 border-t border-white/10">
              <h3 className="font-['Oswald',_sans-serif] text-lg font-bold text-white mb-5">
                Sources &amp; Citations
              </h3>
              <ol className="list-none space-y-3 pl-0">
                {story.data_sources.map((src, idx) => {
                  const resolved = resolveSource(src);
                  // For usaspending / federal_register, link to sector-specific page if possible
                  let finalUrl = resolved.url;
                  let isExternal = resolved.external || false;
                  if (src === 'usaspending' && story.sector) {
                    finalUrl = `${basePath}/contracts`;
                    isExternal = false;
                  }
                  if (src === 'federal_register' && story.sector) {
                    finalUrl = `${basePath}/enforcement`;
                    isExternal = false;
                  }
                  if (src === 'senate_lda' && story.sector) {
                    finalUrl = `${basePath}/lobbying`;
                    isExternal = false;
                  }

                  return (
                    <li key={src} className="flex items-start gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[11px] font-mono text-white/40 mt-0.5">
                        {idx + 1}
                      </span>
                      <div>
                        {finalUrl ? (
                          isExternal ? (
                            <a
                              href={finalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 text-sm no-underline inline-flex items-center gap-1.5"
                            >
                              {resolved.label}
                              <ExternalLink className="w-3 h-3 opacity-50" />
                            </a>
                          ) : (
                            <Link
                              to={finalUrl}
                              className="text-blue-400 hover:text-blue-300 text-sm no-underline"
                            >
                              {resolved.label}
                            </Link>
                          )
                        ) : (
                          <span className="text-sm text-white/60">{resolved.label}</span>
                        )}
                        <p className="text-[11px] text-white/25 mt-0.5">Source key: {src}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Share */}
          <div className="flex items-center gap-4 pt-6 mb-10 border-t border-white/5 max-w-2xl">
            <ShareButton url={`https://wethepeopleforus.com/stories/${story.slug}`} title={story.title} text={story.summary} />
            <Link to="/stories" className="text-sm text-white/30 hover:text-white/50 no-underline ml-auto">
              More from The Journal
            </Link>
          </div>

          {/* Disclaimer */}
          <div className="max-w-2xl rounded-lg bg-white/[0.02] border border-white/5 px-6 py-5">
            <p className="text-xs text-white/25 leading-relaxed">
              This story was generated from public government data. All claims are backed by the cited sources above. WeThePeople does not editorialize — we show the connections that exist in the public record. If you believe any information is inaccurate, please{' '}
              <Link to="/verify/submit" className="text-blue-400/60 hover:text-blue-400 no-underline">
                submit a claim for verification
              </Link>.
            </p>
          </div>
        </motion.article>
      </div>
    </div>
  );
}
