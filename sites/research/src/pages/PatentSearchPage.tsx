import { useState, useEffect, useMemo } from 'react';
import { Search, Calendar, ExternalLink, SearchX } from 'lucide-react';
import { apiFetch, mainSiteUrl } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface Patent {
  id: number;
  patent_number: string | null;
  patent_title: string | null;
  patent_abstract: string | null;
  patent_date: string | null;
  num_claims: number | null;
}

interface PatentWithCompany extends Patent {
  company_id: string;
  company_name: string;
}

interface TechCompany {
  company_id: string;
  display_name: string;
}

// ── Helpers ──

function fmtDate(d: string | null): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}


// ── Page ──

export default function PatentSearchPage() {
  const [query, setQuery] = useState('');
  const [allPatents, setAllPatents] = useState<PatentWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const compRes = await apiFetch<{ companies: TechCompany[] }>('/tech/companies', {
          params: { limit: 200 },
        });
        const comps = compRes.companies || [];
        if (cancelled) return;

        const patentResults = await Promise.allSettled(
          comps.map((c) =>
            apiFetch<{ patents: Patent[] }>(`/tech/companies/${c.company_id}/patents`, {
              params: { limit: 50 },
            }).then((r) =>
              (r.patents || []).map((p) => ({
                ...p,
                company_id: c.company_id,
                company_name: c.display_name,
              })),
            ),
          ),
        );

        if (cancelled) return;

        const combined: PatentWithCompany[] = [];
        for (const result of patentResults) {
          if (result.status === 'fulfilled') combined.push(...result.value);
        }

        combined.sort((a, b) => {
          if (!a.patent_date && !b.patent_date) return 0;
          if (!a.patent_date) return 1;
          if (!b.patent_date) return -1;
          return new Date(b.patent_date).getTime() - new Date(a.patent_date).getTime();
        });

        setAllPatents(combined);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load patents');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allPatents.slice(0, 100);
    const q = query.toLowerCase();
    return allPatents.filter(
      (p) =>
        (p.patent_title && p.patent_title.toLowerCase().includes(q)) ||
        (p.patent_number && p.patent_number.toLowerCase().includes(q)) ||
        (p.patent_abstract && p.patent_abstract.toLowerCase().includes(q)) ||
        p.company_name.toLowerCase().includes(q),
    );
  }, [allPatents, query]);

  const totalPatents = allPatents.length;
  const uniqueCompanies = new Set(allPatents.map((p) => p.company_id)).size;

  if (error) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-400 mb-2">Failed to load patents</p>
          <p className="text-sm text-zinc-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-col gap-8">
        <ToolHeader
          eyebrow="Patent Search"
          title="Patent Explorer"
          description={<>Search across {loading ? '...' : fmtNum(totalPatents)} patents from {loading ? '...' : uniqueCompanies} technology companies.</>}
          accent="var(--color-research)"
        />

        {/* Search bar */}
        <div className="relative max-w-2xl w-full">
          <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search patents by title, number, abstract, or company..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3.5 pl-12 pr-4 text-base text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-violet-500/50 backdrop-blur-md"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Stats row */}
        {!loading && (
          <div>
            <span className="text-sm text-zinc-500">
              {query ? `${fmtNum(filtered.length)} results` : `Showing ${Math.min(100, totalPatents)} of ${fmtNum(totalPatents)}`}
            </span>
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-zinc-900 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <SearchX size={48} className="text-zinc-700" />
            <p className="text-xl text-zinc-500">
              {query ? 'No patents match your search' : 'No patents available'}
            </p>
            {query && (
              <button onClick={() => setQuery('')} className="text-sm text-violet-400 hover:text-violet-300 cursor-pointer">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((p) => (
              <div
                key={`${p.company_id}-${p.id}`}
                               className="group rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5 transition-all hover:bg-zinc-900/70 hover:border-zinc-700 cursor-pointer"
                onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-white mb-1">
                      {p.patent_title || 'Untitled Patent'}
                    </p>
                    <div className="flex items-center gap-4 flex-wrap">
                      {p.patent_number && (
                        <span className="text-xs text-amber-400 font-mono">US{p.patent_number}</span>
                      )}
                      <a
                        href={mainSiteUrl(`/technology/${p.company_id}`)}
                        className="text-xs text-violet-400 hover:text-violet-300 no-underline font-mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.company_name}
                      </a>
                      {p.patent_date && (
                        <span className="flex items-center gap-1 text-xs text-zinc-500 font-mono">
                          <Calendar size={12} />{fmtDate(p.patent_date)}
                        </span>
                      )}
                      {p.num_claims != null && (
                        <span className="text-xs text-zinc-500 font-mono">{p.num_claims} claims</span>
                      )}
                    </div>
                    {p.patent_abstract && (
                      <p className={`mt-2 text-sm text-zinc-400 ${expandedId === p.id ? '' : 'line-clamp-2'}`}>
                        {p.patent_abstract}
                      </p>
                    )}
                  </div>
                  {p.patent_number && (
                    <a
                      href={`https://patents.google.com/patent/US${p.patent_number.replace(/[^0-9A-Za-z]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 transition-colors hover:bg-zinc-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={14} className="text-zinc-300" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
