import { useState, useEffect, useMemo } from 'react';
import { Search, Newspaper, ShieldCheck, Globe, ExternalLink } from 'lucide-react';
import { apiFetch, mainSiteUrl } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface NewsItem {
  id: number;
  title: string;
  release_date: string | null;
  url: string | null;
  category: string | null;
  summary: string | null;
}

interface EnforcementAction {
  id: number;
  case_title: string | null;
  case_date: string | null;
  case_url: string | null;
  enforcement_type: string | null;
  penalty_amount: number | null;
  description: string | null;
  source: string | null;
}

interface EnforcementWithSector extends EnforcementAction {
  entityId: string;
  entityName: string;
  sector: 'finance' | 'health';
}

interface FinanceInst {
  institution_id: string;
  display_name: string;
}

interface HealthComp {
  company_id: string;
  display_name: string;
}

interface GoogleNewsArticle {
  title: string;
  link: string;
  published: string | null;
  source: string | null;
}

// ── Helpers ──

function fmtDollar(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ── Page ──

export default function RegulatoryNewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [enforcement, setEnforcement] = useState<EnforcementWithSector[]>([]);
  const [articles, setArticles] = useState<GoogleNewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [tab, setTab] = useState<'releases' | 'enforcement' | 'news'>('releases');
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [newsQuery, setNewsQuery] = useState('');

  // Phase 1: Load press releases + entity lists, then fan out for enforcement
  useEffect(() => {
    const loadData = async () => {
      try {
        const [newsRes, finRes, healthRes] = await Promise.all([
          apiFetch<{ news: NewsItem[] }>('/finance/sector-news', { params: { limit: 50 } }).catch(() => ({ news: [] })),
          apiFetch<{ institutions: FinanceInst[] }>('/finance/institutions', { params: { limit: 200 } }).catch(() => ({ institutions: [] })),
          apiFetch<{ companies: HealthComp[] }>('/health/companies', { params: { limit: 200 } }).catch(() => ({ companies: [] })),
        ]);

        setNews(newsRes.news || []);

        // Fan out for enforcement (10 each)
        const finInsts = (finRes.institutions || []).slice(0, 10);
        const healthComps = (healthRes.companies || []).slice(0, 10);

        const finPromises = finInsts.map((inst) =>
          apiFetch<{ actions: EnforcementAction[] }>(`/finance/institutions/${inst.institution_id}/enforcement`, { params: { limit: 20 } })
            .then((r) => (r.actions || []).map((a) => ({ ...a, entityId: inst.institution_id, entityName: inst.display_name, sector: 'finance' as const })))
            .catch(() => [] as EnforcementWithSector[])
        );

        const healthPromises = healthComps.map((comp) =>
          apiFetch<{ actions: EnforcementAction[] }>(`/health/companies/${comp.company_id}/enforcement`, { params: { limit: 20 } })
            .then((r) => (r.actions || []).map((a) => ({ ...a, entityId: comp.company_id, entityName: comp.display_name, sector: 'health' as const })))
            .catch(() => [] as EnforcementWithSector[])
        );

        const [finActions, healthActions] = await Promise.all([
          Promise.all(finPromises),
          Promise.all(healthPromises),
        ]);

        const all = [...finActions.flat(), ...healthActions.flat()]
          .sort((a, b) => (b.case_date || '').localeCompare(a.case_date || ''));
        setEnforcement(all);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Lazy load news when tab is first selected
  useEffect(() => {
    if (tab === 'news' && !newsLoaded) {
      setNewsLoaded(true);
      Promise.all([
        apiFetch<{ articles: GoogleNewsArticle[] }>('/news/SEC enforcement action').catch(() => ({ articles: [] })),
        apiFetch<{ articles: GoogleNewsArticle[] }>('/news/FDA regulation 2026').catch(() => ({ articles: [] })),
        apiFetch<{ articles: GoogleNewsArticle[] }>('/news/financial regulation Congress').catch(() => ({ articles: [] })),
      ]).then(([sec, fda, fin]) => {
        const all = [...(sec.articles || []), ...(fda.articles || []), ...(fin.articles || [])];
        // Deduplicate by title
        const seen = new Set<string>();
        const unique = all.filter((a) => {
          if (seen.has(a.title)) return false;
          seen.add(a.title);
          return true;
        });
        setArticles(unique);
      });
    }
  }, [tab, newsLoaded]);

  const filteredNews = useMemo(() => {
    if (!search.trim()) return news;
    const q = search.toLowerCase();
    return news.filter((n) =>
      n.title.toLowerCase().includes(q) ||
      n.summary?.toLowerCase().includes(q) ||
      n.category?.toLowerCase().includes(q)
    );
  }, [news, search]);

  const filteredEnforcement = useMemo(() => {
    let list = enforcement;
    if (sectorFilter) list = list.filter((e) => e.sector === sectorFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.case_title?.toLowerCase().includes(q) ||
        e.entityName.toLowerCase().includes(q) ||
        e.source?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [enforcement, sectorFilter, search]);

  const totalPenalties = enforcement.reduce((sum, e) => sum + (e.penalty_amount || 0), 0);

  const handleNewsSearch = () => {
    if (!newsQuery.trim()) return;
    apiFetch<{ articles: GoogleNewsArticle[] }>(`/news/${encodeURIComponent(newsQuery.trim())}`)
      .then((res) => setArticles(res.articles || []))
      .catch(() => setArticles([]));
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Regulatory"
        title="Regulatory News"
        description="Federal Reserve press releases, enforcement actions across finance and health sectors, and regulatory news from government sources."
        accent="var(--color-dem)"
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setTab('releases')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'releases' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Newspaper size={14} /> Fed Releases ({news.length})
        </button>
        <button
          onClick={() => setTab('enforcement')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'enforcement' ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <ShieldCheck size={14} /> Enforcement ({enforcement.length})
        </button>
        <button
          onClick={() => setTab('news')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'news' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Globe size={14} /> In the News
        </button>
      </div>

      {/* Search (releases + enforcement tabs) */}
      {tab !== 'news' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder={tab === 'releases' ? 'Search press releases...' : 'Search case, entity, or source...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-blue-500/50"
            />
          </div>
          {tab === 'enforcement' && (
            <div className="flex items-center gap-2">
              {[null, 'finance', 'health'].map((f) => (
                <button
                  key={f || 'all'}
                  onClick={() => setSectorFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    sectorFilter === f
                      ? f === 'finance' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : f === 'health' ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                        : 'bg-zinc-700/50 text-white border border-zinc-600'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {f === 'finance' ? 'Finance' : f === 'health' ? 'Health' : 'All Sectors'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fed Releases tab */}
      {tab === 'releases' && (
        <>
          <p className="text-sm text-zinc-500 mb-4">{filteredNews.length} press releases</p>
          {filteredNews.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-12">No press releases available.</p>
          ) : (
            <div className="space-y-3">
              {filteredNews.map((n) => (
                <div key={n.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-800/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <a
                        href={n.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-white hover:text-blue-400 transition-colors leading-snug"
                      >
                        {n.title}
                      </a>
                      {n.summary && <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{n.summary}</p>}
                    </div>
                    {n.category && (
                      <span className="shrink-0 rounded px-2 py-0.5 text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                        {n.category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-600 mt-2 font-mono">{n.release_date || ''}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Enforcement tab */}
      {tab === 'enforcement' && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-xs text-zinc-500 font-mono mb-1">TOTAL ACTIONS</p>
              <p className="text-2xl font-bold text-white">{enforcement.length.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-xs text-zinc-500 font-mono mb-1">TOTAL PENALTIES</p>
              <p className="text-2xl font-bold text-red-400">{fmtDollar(totalPenalties)}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-xs text-zinc-500 font-mono mb-1">SECTORS</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-emerald-400">{enforcement.filter((e) => e.sector === 'finance').length} Finance</span>
                <span className="text-zinc-600">|</span>
                <span className="text-sm text-red-400">{enforcement.filter((e) => e.sector === 'health').length} Health</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-zinc-500 mb-4">{filteredEnforcement.length} enforcement actions</p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">DATE</th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">CASE</th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">TYPE</th>
                    <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono">PENALTY</th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">SOURCE</th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">SECTOR</th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">ENTITY</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEnforcement.slice(0, 100).map((e, i) => (
                    <tr key={`${e.id}-${e.sector}-${i}`} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                      <td className="px-4 py-3 text-xs text-zinc-500 font-mono">{e.case_date || '\u2014'}</td>
                      <td className="px-4 py-3 text-sm text-white max-w-xs">
                        <span className="line-clamp-1">{e.case_title || '\u2014'}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">{e.enforcement_type || '\u2014'}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-white font-mono">{fmtDollar(e.penalty_amount)}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{e.source || '\u2014'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                          e.sector === 'finance' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {e.sector === 'finance' ? 'Finance' : 'Health'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={mainSiteUrl(`/${e.sector === 'finance' ? 'finance' : 'health'}/${e.entityId}`)}
                          className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors"
                        >
                          {e.entityName}
                        </a>
                      </td>
                    </tr>
                  ))}
                  {filteredEnforcement.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-500">No enforcement actions match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* In the News tab */}
      {tab === 'news' && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search regulatory news (e.g., SEC enforcement, FDA recall)..."
                value={newsQuery}
                onChange={(e) => setNewsQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNewsSearch()}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500/50"
              />
            </div>
            <button
              onClick={handleNewsSearch}
              className="px-4 py-2 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/30 text-sm font-medium hover:bg-violet-500/20 transition-colors"
            >
              Search
            </button>
          </div>

          {articles.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-12">
              {newsLoaded ? 'No news articles found. Try a different search term.' : 'Loading regulatory news...'}
            </p>
          ) : (
            <div className="space-y-3">
              {articles.map((a, i) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-800/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <a
                        href={a.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-white hover:text-violet-400 transition-colors leading-snug"
                      >
                        {a.title}
                      </a>
                      <div className="flex items-center gap-3 mt-1">
                        {a.source && <span className="text-xs text-zinc-500">{a.source}</span>}
                        {a.published && <span className="text-xs text-zinc-600 font-mono">{a.published}</span>}
                      </div>
                    </div>
                    <a href={a.link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-zinc-600 hover:text-violet-400 transition-colors">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
