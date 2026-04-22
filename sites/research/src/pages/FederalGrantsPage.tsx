import { useState, useCallback } from 'react';
import { Search, HandCoins, Calendar, Building2 } from 'lucide-react';
import { apiFetch } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface FederalGrant {
  title: string | null;
  agency: string | null;
  amount: number | null;
  deadline: string | null;
  category: string | null;
  eligibility: string | null;
  description: string | null;
  grant_number: string | null;
  status: string | null;
}

// ── Helpers ──

function fmtCurrency(val: number | null): string {
  if (val == null) return '\u2014';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtDate(d: string | null): string {
  if (!d) return '\u2014';
  try {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

function amountColor(amt: number | null): string {
  if (amt == null) return '#64748B';
  if (amt >= 10_000_000) return '#DC2626';
  if (amt >= 1_000_000) return '#F59E0B';
  if (amt >= 100_000) return '#3B82F6';
  return '#10B981';
}

function amountBg(amt: number | null): string {
  if (amt == null) return 'bg-zinc-500/10';
  if (amt >= 10_000_000) return 'bg-red-500/10';
  if (amt >= 1_000_000) return 'bg-amber-500/10';
  if (amt >= 100_000) return 'bg-blue-500/10';
  return 'bg-emerald-500/10';
}

// ── Common agencies ──

const AGENCIES = [
  'Department of Health and Human Services',
  'Department of Education',
  'Department of Energy',
  'Department of Defense',
  'Department of Agriculture',
  'Department of Transportation',
  'Department of Commerce',
  'Department of Justice',
  'Department of Housing and Urban Development',
  'Environmental Protection Agency',
  'National Science Foundation',
  'National Institutes of Health',
  'NASA',
  'Small Business Administration',
];

// ── Page ──

export default function FederalGrantsPage() {
  const [keyword, setKeyword] = useState('');
  const [agency, setAgency] = useState('');
  const [results, setResults] = useState<FederalGrant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!keyword.trim() && !agency) return;

    setLoading(true);
    setSearched(true);

    try {
      const params: Record<string, string> = { limit: '25' };
      if (keyword.trim()) params.keyword = keyword.trim();
      if (agency) params.agency = agency;

      const data = await apiFetch<{ total: number; grants: FederalGrant[] }>(
        '/research/federal-grants',
        { params },
      );
      setResults(data.grants || []);
      setTotal(data.total || 0);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [keyword, agency]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Grants"
        title="Federal Grants Explorer"
        description="Search federal grant opportunities by keyword and agency. Find funding amounts, deadlines, categories, and eligibility requirements."
        accent="var(--color-green)"
      />

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 max-w-3xl">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Keyword (e.g. climate, cancer, broadband)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 pl-10 pr-3 text-sm text-white outline-none transition-colors focus:border-green-500/50 placeholder:text-zinc-600"
          />
        </div>
        <select
          value={agency}
          onChange={(e) => setAgency(e.target.value)}
          className="rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 px-3 text-sm text-white outline-none transition-colors focus:border-green-500/50 appearance-none cursor-pointer"
        >
          <option value="">All Agencies</option>
          {AGENCIES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="mb-8 max-w-3xl">
        <button
          onClick={handleSearch}
          disabled={(!keyword.trim() && !agency) || loading}
          className="rounded-xl px-6 py-3 text-sm font-bold text-white cursor-pointer border-0 transition-colors bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching...' : 'Search Grants'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent mb-4" />
          <p className="text-sm text-zinc-500">Searching federal grant opportunities...</p>
        </div>
      )}

      {/* No search yet */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
            <HandCoins size={36} className="text-zinc-700" />
          </div>
          <p className="text-lg font-semibold text-zinc-400 mb-2">Search federal grants</p>
          <p className="text-sm text-zinc-600">Find active grant opportunities by keyword or federal agency.</p>
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <>
          <div className="mb-6">
            <span className="text-sm text-zinc-500">
              {total.toLocaleString()} grant{total !== 1 ? 's' : ''} found
            </span>
          </div>

          {results.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              {results.map((grant, idx) => {
                const color = amountColor(grant.amount);
                return (
                  <div
                    key={`${grant.grant_number || idx}-${idx}`}
                    className="flex rounded-xl border border-zinc-800/60 overflow-hidden"
                    style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.03}s forwards` }}
                  >
                    <div className="w-1.5 shrink-0" style={{ background: color }} />
                    <div className="flex-1 p-5 bg-zinc-900/40">
                      {/* Top row: amount + category */}
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`rounded border px-3 py-1.5 text-lg font-bold ${amountBg(grant.amount)}`}
                            style={{ borderColor: `${color}40`, color }}
                          >
                            {fmtCurrency(grant.amount)}
                          </span>
                          {grant.category && (
                            <span className="rounded px-2 py-1 text-xs font-medium bg-zinc-800 text-zinc-400">
                              {grant.category}
                            </span>
                          )}
                          {grant.status && (
                            <span className={`rounded px-2 py-1 text-xs font-bold ${
                              grant.status.toLowerCase().includes('open') || grant.status.toLowerCase().includes('forecasted')
                                ? 'bg-green-500/10 text-green-400'
                                : 'bg-zinc-800 text-zinc-500'
                            }`}>
                              {grant.status}
                            </span>
                          )}
                        </div>
                        {grant.grant_number && (
                          <span className="text-xs text-zinc-600 font-mono shrink-0">{grant.grant_number}</span>
                        )}
                      </div>

                      {/* Title */}
                      <p className="text-sm font-semibold text-white mb-2 line-clamp-2">
                        {grant.title || 'Untitled Grant'}
                      </p>

                      {/* Description */}
                      {grant.description && (
                        <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{grant.description}</p>
                      )}

                      {/* Eligibility */}
                      {grant.eligibility && (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 mb-3">
                          <p className="text-xs uppercase tracking-wider mb-1 text-zinc-600">ELIGIBILITY</p>
                          <p className="text-sm text-zinc-400 line-clamp-2">{grant.eligibility}</p>
                        </div>
                      )}

                      {/* Footer: agency + deadline */}
                      <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                        <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                          <Building2 size={14} className="text-zinc-600" />
                          {grant.agency || '\u2014'}
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-zinc-600 font-mono">
                          <Calendar size={14} />
                          {grant.deadline ? `Due ${fmtDate(grant.deadline)}` : 'No deadline'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes card-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-zinc-800 bg-zinc-900/30">
      <Search size={48} className="text-zinc-800 mb-4" />
      <p className="text-sm text-zinc-500">No grants found matching your search.</p>
    </div>
  );
}
