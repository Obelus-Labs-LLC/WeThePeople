import React, { useEffect, useState, useRef } from 'react';
import {
  ArrowLeft,
  Newspaper,
  ExternalLink,
  Shield,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Building2,
  Search,
} from 'lucide-react';
import SpotlightCard from '../components/SpotlightCard';
import { FinanceSectorHeader } from '../components/SectorHeader';
import {
  getInstitutions,
  getSectorNews,
  getComplaintSummary,
  getAllComplaints,
  getInstitutionPressReleases,
  getInstitutionComplaints,
  getInstitutionComplaintSummary,
  type InstitutionListItem,
  type SectorNewsItem,
  type PressRelease,
  type ComplaintSummary,
  type CFPBComplaintItem,
} from '../api/finance';
import { fmtNum } from '../utils/format';

// ── Helpers ──

function categoryColor(cat: string | null): string {
  if (!cat) return '#34D399';
  const lower = cat.toLowerCase();
  if (lower.includes('enforcement')) return '#FF3366';
  if (lower.includes('monetary') || lower.includes('rate')) return '#F59E0B';
  if (lower.includes('supervision') || lower.includes('regulation')) return '#C084FC';
  if (lower.includes('banking') || lower.includes('financial')) return '#60A5FA';
  return '#34D399';
}

// ── Institution Dropdown ──

function InstitutionSelector({
  institutions,
  selectedId,
  onChange,
}: {
  institutions: InstitutionListItem[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = search.trim()
    ? institutions.filter(
        (i) =>
          i.display_name.toLowerCase().includes(search.toLowerCase()) ||
          (i.ticker && i.ticker.toLowerCase().includes(search.toLowerCase()))
      )
    : institutions;

  const selected = selectedId
    ? institutions.find((i) => i.institution_id === selectedId)
    : null;

  return (
    <div ref={ref} className="relative z-50 w-full max-w-md">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3.5 font-body text-sm text-white transition-colors hover:border-white/20 cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          {selected ? (
            <>
              {selected.logo_url ? (
                <img src={selected.logo_url} alt={selected.display_name} className="h-6 w-6 rounded object-contain flex-shrink-0" />
              ) : (
                <Building2 size={18} className="text-white/30 flex-shrink-0" />
              )}
              <span className="truncate font-medium">{selected.display_name}</span>
              {selected.ticker && (
                <span className="font-mono text-xs text-[#34D399] flex-shrink-0">{selected.ticker}</span>
              )}
            </>
          ) : (
            <>
              <Building2 size={18} className="text-[#34D399] flex-shrink-0" />
              <span className="text-white/50">All Institutions</span>
            </>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-white/40 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-white/10 bg-[#111111] shadow-2xl max-h-80 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="relative border-b border-white/10 p-2">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              autoFocus
              type="text"
              placeholder="Search institutions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg bg-white/[0.05] border-0 py-2 pl-8 pr-3 font-body text-sm text-white placeholder:text-white/30 outline-none"
            />
          </div>

          {/* Options */}
          <div className="overflow-y-auto">
            {/* All Institutions option */}
            <button
              onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                !selectedId ? 'bg-[rgba(52,211,153,0.1)] text-[#34D399]' : 'text-white/60 hover:bg-white/[0.05]'
              }`}
            >
              <Building2 size={16} className="flex-shrink-0" />
              <span className="font-body text-sm font-medium">All Institutions</span>
              <span className="ml-auto font-mono text-[10px] text-white/30">SECTOR-WIDE</span>
            </button>

            {filtered.map((inst) => (
              <button
                key={inst.institution_id}
                onClick={() => { onChange(inst.institution_id); setOpen(false); setSearch(''); }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                  selectedId === inst.institution_id
                    ? 'bg-[rgba(52,211,153,0.1)] text-[#34D399]'
                    : 'text-white/60 hover:bg-white/[0.05]'
                }`}
              >
                {inst.logo_url ? (
                  <img src={inst.logo_url} alt={inst.display_name} className="h-5 w-5 rounded object-contain flex-shrink-0" />
                ) : (
                  <Building2 size={16} className="text-white/20 flex-shrink-0" />
                )}
                <span className="font-body text-sm truncate">{inst.display_name}</span>
                {inst.ticker && (
                  <span className="font-mono text-[10px] text-white/30 flex-shrink-0">{inst.ticker}</span>
                )}
              </button>
            ))}

            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center font-body text-sm text-white/30">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── News Feed Item (works for both SectorNewsItem and PressRelease) ──

function NewsItem({
  title,
  date,
  url,
  category,
  summary,
  delay,
}: {
  title: string | null;
  date: string | null;
  url: string | null;
  category: string | null;
  summary?: string | null;
  delay: number;
}) {
  const color = categoryColor(category);

  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-all duration-200 hover:border-[rgba(52,211,153,0.4)] hover:bg-white/[0.05] no-underline animate-fade-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Category + date row */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {category && (
              <span
                className="rounded border px-2 py-1 font-mono text-xs font-bold uppercase"
                style={{
                  borderColor: `${color}40`,
                  color: color,
                  backgroundColor: `${color}15`,
                }}
              >
                {category}
              </span>
            )}
            {date && (
              <span className="font-mono text-xs text-white/40">{date}</span>
            )}
          </div>

          {/* Title */}
          <p className="font-body text-base font-medium text-white leading-relaxed transition-colors group-hover:text-[#34D399]">
            {title || 'Untitled'}
          </p>

          {/* Summary (only for per-institution press releases) */}
          {summary && (
            <p className="mt-2 font-body text-sm text-white/40 leading-relaxed line-clamp-2">
              {summary}
            </p>
          )}
        </div>

        {/* External link icon */}
        {url && (
          <ExternalLink
            size={16}
            className="flex-shrink-0 mt-1 text-white/20 transition-colors group-hover:text-[#34D399]"
          />
        )}
      </div>
    </a>
  );
}

// ── Complaint Stat Row ──

function ComplaintStatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <span className="font-body text-sm text-white/50">{label}</span>
      <span className={`font-mono text-lg font-bold ${accent ? 'text-[#FF3366]' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}

// ── Recent Complaint (compact) ──

function CompactComplaint({ complaint }: { complaint: CFPBComplaintItem }) {
  const cfpbUrl = complaint.complaint_id
    ? `https://www.consumerfinance.gov/data-research/consumer-complaints/search/detail/${complaint.complaint_id}`
    : null;

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/10">
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="font-body text-sm font-semibold text-white line-clamp-1">
          {complaint.company_name}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {complaint.timely_response === 'Yes' ? (
            <span className="font-mono text-[10px] text-[#34D399]">TIMELY</span>
          ) : (
            <span className="font-mono text-[10px] text-[#FF3366]">LATE</span>
          )}
          {cfpbUrl && (
            <a
              href={cfpbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-white/20 hover:text-[#FF3366] transition-colors no-underline"
              onClick={(e) => e.stopPropagation()}
            >
              CFPB →
            </a>
          )}
        </div>
      </div>
      <p className="font-body text-sm text-white/60 leading-relaxed line-clamp-2">
        {complaint.issue}
        {complaint.sub_issue ? ` — ${complaint.sub_issue}` : ''}
      </p>
      <div className="flex items-center gap-3 mt-2">
        {complaint.product && (
          <span className="font-mono text-[10px] text-[#FF3366]">{complaint.product}</span>
        )}
        {complaint.date_received && (
          <span className="font-mono text-[10px] text-white/30">{complaint.date_received}</span>
        )}
      </div>
    </div>
  );
}

// ── Unified news item type ──

interface UnifiedNewsItem {
  id: number;
  title: string | null;
  date: string | null;
  url: string | null;
  category: string | null;
  summary?: string | null;
}

function sectorNewsToUnified(items: SectorNewsItem[]): UnifiedNewsItem[] {
  return items.map((i) => ({
    id: i.id,
    title: i.title,
    date: i.release_date,
    url: i.url,
    category: i.release_type,
  }));
}

function pressReleasesToUnified(items: PressRelease[]): UnifiedNewsItem[] {
  return items.map((i) => ({
    id: i.id,
    title: i.title,
    date: i.release_date,
    url: i.url,
    category: i.category,
    summary: i.summary,
  }));
}

// ── Page ──

export default function NewsRegulatoryPage() {
  const [institutions, setInstitutions] = useState<InstitutionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [newsItems, setNewsItems] = useState<UnifiedNewsItem[]>([]);
  const [summary, setSummary] = useState<ComplaintSummary | null>(null);
  const [complaints, setComplaints] = useState<CFPBComplaintItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [showAllComplaints, setShowAllComplaints] = useState(false);

  // Load institutions list once
  useEffect(() => {
    getInstitutions({ limit: 200 })
      .then((res) => setInstitutions(res.institutions || []))
      .catch(() => {});
  }, []);

  // Load content based on selected institution
  useEffect(() => {
    const isInitial = loading;
    if (!isInitial) setContentLoading(true);
    setShowAllComplaints(false);

    if (selectedId) {
      // Per-institution data
      Promise.all([
        getInstitutionPressReleases(selectedId, { limit: 50 }),
        getInstitutionComplaintSummary(selectedId),
        getInstitutionComplaints(selectedId, { limit: 15 }),
      ])
        .then(([pressRes, summaryRes, complaintsRes]) => {
          setNewsItems(pressReleasesToUnified(pressRes.press_releases || []));
          setSummary(summaryRes);
          setComplaints(complaintsRes.complaints || []);
        })
        .catch(() => {})
        .finally(() => { setLoading(false); setContentLoading(false); });
    } else {
      // Global sector data
      Promise.all([
        getSectorNews(50),
        getComplaintSummary(),
        getAllComplaints({ limit: 15 }),
      ])
        .then(([newsRes, summaryRes, complaintsRes]) => {
          setNewsItems(sectorNewsToUnified(newsRes.news || []));
          setSummary(summaryRes);
          setComplaints(complaintsRes.complaints || []);
        })
        .catch(() => {})
        .finally(() => { setLoading(false); setContentLoading(false); });
    }
  }, [selectedId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" />
      </div>
    );
  }

  const selectedInst = selectedId
    ? institutions.find((i) => i.institution_id === selectedId)
    : null;

  const topProducts = summary
    ? Object.entries(summary.by_product).sort((a, b) => b[1] - a[1]).slice(0, 5)
    : [];

  const visibleComplaints = showAllComplaints ? complaints : complaints.slice(0, 5);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        <FinanceSectorHeader />

        {/* Header */}
        <div className="flex items-end justify-between mb-6 animate-fade-up">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
              News & Regulatory
            </h1>
            <p className="mt-1 font-body text-lg text-white/50">
              {selectedInst
                ? `Press releases, regulatory actions, and complaints for ${selectedInst.display_name}`
                : 'Federal Reserve press releases, regulatory actions, and consumer complaints'}
            </p>
          </div>
          <div className="hidden md:flex flex-col items-end gap-1">
            <p className="font-mono text-[11px] text-white/30">
              DATA SOURCE: <span className="text-white/50">{selectedInst ? 'INSTITUTION' : 'FEDERAL RESERVE'}</span>
            </p>
            <p className="font-mono text-[11px] text-white/30">
              STATUS: <span className="text-[#34D399]">ONLINE</span>
            </p>
          </div>
        </div>

        {/* Institution Selector */}
        <div className="relative z-50 mb-8">
          <InstitutionSelector
            institutions={institutions}
            selectedId={selectedId}
            onChange={setSelectedId}
          />
        </div>

        {/* Content loading overlay */}
        {contentLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" />
          </div>
        )}

        {/* Main Grid */}
        {!contentLoading && (
          <div className="relative z-0 grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left Column: News Feed */}
            <div
              className="flex flex-col xl:col-span-2 animate-fade-up"
              style={{ animationDelay: '200ms', animationFillMode: 'both' }}
            >
              {/* News section header */}
              <div className="flex items-center gap-3 mb-6">
                <Newspaper size={20} className="text-[#34D399]" />
                <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-white">
                  {selectedInst ? `${selectedInst.display_name} News` : 'Sector News & Announcements'}
                </h2>
                <span className="ml-auto font-mono text-xs text-white/30">
                  {newsItems.length} {newsItems.length === 1 ? 'ARTICLE' : 'ARTICLES'}
                </span>
              </div>

              {/* News feed */}
              <div className="space-y-4">
                {newsItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-white/5 bg-white/[0.02]">
                    <Newspaper size={48} className="text-white/10 mb-4" />
                    <p className="font-body text-sm text-white/40">
                      {selectedInst
                        ? `No press releases available for ${selectedInst.display_name}.`
                        : 'No sector news available.'}
                    </p>
                  </div>
                ) : (
                  newsItems.map((item, idx) => (
                    <NewsItem
                      key={item.id}
                      title={item.title}
                      date={item.date}
                      url={item.url}
                      category={item.category}
                      summary={item.summary}
                      delay={300 + idx * 40}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Right Column: Complaint Summary + Recent */}
            <div
              className="flex flex-col gap-6 animate-fade-up"
              style={{ animationDelay: '400ms', animationFillMode: 'both' }}
            >
              {/* Complaint Summary Card */}
              {summary && (
                <SpotlightCard
                  className="rounded-xl border border-white/10 bg-white/[0.03]"
                  spotlightColor="rgba(255, 51, 102, 0.10)"
                >
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <Shield size={18} className="text-[#FF3366]" />
                      <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-white">
                        {selectedInst ? 'Complaints' : 'CFPB Complaints'}
                      </h2>
                    </div>

                    {/* Big number */}
                    <div className="text-center mb-6 py-4 rounded-lg bg-white/[0.03] border border-white/5">
                      <p className="font-mono text-xs uppercase tracking-wider text-white/40 mb-2">
                        Total Complaints
                      </p>
                      <p className="font-heading text-5xl font-bold text-[#FF3366]">
                        {fmtNum(summary.total_complaints)}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="space-y-0">
                      <ComplaintStatRow
                        label="Timely Response"
                        value={summary.timely_response_pct != null ? `${summary.timely_response_pct.toFixed(1)}%` : '—'}
                        accent={summary.timely_response_pct != null && summary.timely_response_pct < 90}
                      />
                      {topProducts.map(([product, count]) => (
                        <ComplaintStatRow
                          key={product}
                          label={product}
                          value={fmtNum(count)}
                        />
                      ))}
                    </div>
                  </div>
                </SpotlightCard>
              )}

              {/* Recent Complaints (compact) */}
              <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex items-center gap-2 mb-5">
                  <TrendingDown size={18} className="text-[#FF3366]" />
                  <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white">
                    Recent Complaints
                  </h2>
                  <div className="ml-auto flex items-center gap-2 rounded-full border border-[rgba(255,51,102,0.3)] bg-[rgba(255,51,102,0.1)] px-2 py-0.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF3366] opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#FF3366]" />
                    </span>
                    <span className="font-mono text-[10px] font-bold text-[#FF3366]">LIVE</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {complaints.length === 0 ? (
                    <p className="font-body text-sm text-white/40">
                      {selectedInst
                        ? `No complaints on record for ${selectedInst.display_name}.`
                        : 'No complaints on record.'}
                    </p>
                  ) : (
                    visibleComplaints.map((c) => (
                      <CompactComplaint key={c.id} complaint={c} />
                    ))
                  )}
                </div>

                {complaints.length > 5 && (
                  <button
                    onClick={() => setShowAllComplaints(!showAllComplaints)}
                    className="mt-4 flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 font-mono text-xs text-white/40 hover:text-white/60 hover:border-white/20 transition-colors cursor-pointer"
                  >
                    {showAllComplaints ? (
                      <>
                        <ChevronUp size={14} />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} />
                        Show {complaints.length - 5} more
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
