import { useState } from 'react';
import { Search, FileSearch, ArrowLeft, ExternalLink, Building2, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';

// ── Types ──

interface Bill {
  bill_id: string;
  title: string;
  policy_area: string;
  latest_action: string;
  latest_action_date: string;
  sponsor: string;
  url: string;
}

interface LobbyingCompany {
  name: string;
  filings: number;
  total_spend: number;
}

interface RelatedLobbying {
  total_filings: number;
  top_companies: LobbyingCompany[];
  sectors: Record<string, number>;
}

interface BillSearchResult {
  total_bills: number;
  bills: Bill[];
  related_lobbying: RelatedLobbying;
}

// ── Helpers ──

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ── Page ──

export default function BillTextPage() {
  const [query, setQuery] = useState('');
  const [congress, setCongress] = useState(119);
  const [result, setResult] = useState<BillSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const data = await apiFetch<BillSearchResult>('/research/bill-text-search', {
        params: { query: q, congress, limit: 25 },
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Search failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Back link */}
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8">
        <ArrowLeft size={14} />
        Back to Research Tools
      </Link>

      {/* Header */}
      <div className="mb-8">
        <span className="text-xs font-bold tracking-[0.2em] text-amber-400 uppercase">Bill Analysis</span>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50 mt-1" style={{ fontFamily: 'Oswald, sans-serif' }}>
          BILL TEXT SEARCH
        </h1>
        <p className="text-base text-zinc-400 mt-2 max-w-2xl">
          Search congressional bills by lobbying topic and see which companies are lobbying on the same issues.
          Cross-references Congress.gov with Senate lobbying disclosures.
        </p>
      </div>

      {/* Search controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder='Search lobbying terms (e.g. "climate", "data privacy", "pharmaceutical pricing")'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-amber-500/50"
          />
        </div>

        <select
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-sm text-white outline-none cursor-pointer"
          style={{ colorScheme: 'dark' }}
          value={congress}
          onChange={(e) => setCongress(Number(e.target.value))}
        >
          <option value={119}>119th Congress (2025-2027)</option>
          <option value={118}>118th Congress (2023-2025)</option>
          <option value={117}>117th Congress (2021-2023)</option>
          <option value={116}>116th Congress (2019-2021)</option>
        </select>

        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="rounded-lg bg-amber-500/20 border border-amber-500/30 px-5 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="flex h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <div className="space-y-8">

          {/* ── Lobbying Cross-Reference Section ── */}
          {result.related_lobbying.total_filings > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={16} className="text-amber-400" />
                <h2 className="text-lg font-bold text-white">Who's Lobbying on This?</h2>
                <span className="ml-auto text-sm text-zinc-500">
                  {result.related_lobbying.total_filings.toLocaleString()} lobbying filings match
                </span>
              </div>

              {/* Sector breakdown */}
              {Object.keys(result.related_lobbying.sectors).length > 0 && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 size={14} className="text-amber-400" />
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Filings by Sector</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(result.related_lobbying.sectors)
                      .sort(([, a], [, b]) => b - a)
                      .map(([sector, count]) => (
                        <span
                          key={sector}
                          className="rounded-full px-3 py-1 text-xs font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20"
                        >
                          {sector} ({count})
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Top companies table */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">COMPANY / CLIENT</th>
                        <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono">FILINGS</th>
                        <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono">TOTAL SPEND</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.related_lobbying.top_companies.map((c, i) => (
                        <tr key={i} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                          <td className="px-4 py-3 text-sm font-bold text-white">{c.name}</td>
                          <td className="px-4 py-3 text-sm text-amber-300 text-right font-mono">{c.filings}</td>
                          <td className="px-4 py-3 text-sm text-zinc-300 text-right font-mono">
                            {c.total_spend > 0 ? fmtMoney(c.total_spend) : '\u2014'}
                          </td>
                        </tr>
                      ))}
                      {result.related_lobbying.top_companies.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-sm text-zinc-500">
                            No lobbying filings match this search term.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Bills Section ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FileSearch size={16} className="text-amber-400" />
              <h2 className="text-lg font-bold text-white">Bills</h2>
              <span className="ml-auto text-sm text-zinc-500">
                {result.total_bills.toLocaleString()} bills found
              </span>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">BILL</th>
                      <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">TITLE</th>
                      <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">POLICY AREA</th>
                      <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">SPONSOR</th>
                      <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">LATEST ACTION</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.bills.map((b, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono font-bold text-amber-300 uppercase">{b.bill_id}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-white line-clamp-2">{b.title || '\u2014'}</p>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 text-xs text-zinc-400">
                          {b.policy_area || '\u2014'}
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 text-xs text-zinc-400">
                          {b.sponsor || '\u2014'}
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3">
                          <p className="text-xs text-zinc-500 line-clamp-2">{b.latest_action || '\u2014'}</p>
                          {b.latest_action_date && (
                            <p className="text-xs text-zinc-600 font-mono mt-0.5">{b.latest_action_date}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={b.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-600 hover:text-amber-400 transition-colors"
                            title="View on Congress.gov"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </td>
                      </tr>
                    ))}
                    {result.bills.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">
                          No bills found matching "{query}" in the {congress}th Congress.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* No lobbying filings message (only if bills were found but no lobbying) */}
          {result.related_lobbying.total_filings === 0 && result.bills.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <Building2 size={20} className="text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">
                No lobbying filings in our database match the term "{query}".
                Try broader terms like "health", "energy", or "defense".
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && !result && searched && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileSearch size={40} className="text-zinc-700 mb-4" />
          <p className="text-sm text-zinc-500">No results found. Try a different search term.</p>
        </div>
      )}

      {/* Initial state */}
      {!loading && !result && !searched && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileSearch size={40} className="text-zinc-700 mb-4" />
          <p className="text-zinc-500 text-sm max-w-md">
            Search for a lobbying topic to find related bills in Congress and see which companies
            are actively lobbying on the same issues.
          </p>
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {['climate', 'data privacy', 'pharmaceutical', 'defense spending', 'artificial intelligence', 'trade'].map((term) => (
              <button
                key={term}
                onClick={() => { setQuery(term); }}
                className="rounded-full px-3 py-1 text-xs font-mono bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-amber-500/30 hover:text-amber-300 transition-colors cursor-pointer"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
