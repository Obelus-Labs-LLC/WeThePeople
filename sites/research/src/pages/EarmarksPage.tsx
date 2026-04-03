import { useState, useCallback } from 'react';
import { Search, Landmark, ArrowLeft, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';

// ── Types ──

interface Earmark {
  award_id: string;
  award_amount: number | null;
  recipient_name: string;
  awarding_agency: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  state: string;
  award_type: string;
}

// ── Helpers ──

function fmtCurrency(val: number | null): string {
  if (val == null) return '\u2014';
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

// ── US States for dropdown ──

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
];

// ── Page ──

export default function EarmarksPage() {
  const [keyword, setKeyword] = useState('');
  const [state, setState] = useState('');
  const [member, setMember] = useState('');
  const [results, setResults] = useState<Earmark[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!keyword.trim() && !state && !member.trim()) return;

    setLoading(true);
    setSearched(true);

    try {
      const params: Record<string, string> = { limit: '50' };
      if (keyword.trim()) params.keyword = keyword.trim();
      if (state) params.state = state;
      if (member.trim()) params.member = member.trim();

      const data = await apiFetch<{ total: number; awards: Earmark[] }>(
        '/research/earmarks',
        { params },
      );
      setResults(data.awards);
      setTotal(data.total);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [keyword, state, member]);

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
        <span className="text-xs font-bold tracking-[0.2em] text-emerald-500 uppercase">Federal Spending</span>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50 mt-1" style={{ fontFamily: 'Oswald, sans-serif' }}>
          Earmarks Tracker
        </h1>
        <p className="text-base text-zinc-400 mt-2 max-w-2xl">
          Search congressionally directed spending from USASpending.gov. Find federal grants and direct payments by state, keyword, or congress member.
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 max-w-3xl">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Keyword (e.g. infrastructure)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 pl-10 pr-3 text-sm text-white outline-none transition-colors focus:border-emerald-500/50 placeholder:text-zinc-600"
          />
        </div>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 px-3 text-sm text-white outline-none transition-colors focus:border-emerald-500/50 appearance-none cursor-pointer"
        >
          <option value="">All States</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="relative">
          <Landmark size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Member name (e.g. Schumer)"
            value={member}
            onChange={(e) => setMember(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 pl-10 pr-3 text-sm text-white outline-none transition-colors focus:border-emerald-500/50 placeholder:text-zinc-600"
          />
        </div>
      </div>

      <div className="mb-8 max-w-3xl">
        <button
          onClick={handleSearch}
          disabled={(!keyword.trim() && !state && !member.trim()) || loading}
          className="rounded-xl px-6 py-3 text-sm font-bold text-white cursor-pointer border-0 transition-colors bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching...' : 'Search Earmarks'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mb-4" />
          <p className="text-sm text-zinc-500">Searching USASpending.gov...</p>
        </div>
      )}

      {/* No search yet */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
            <DollarSign size={36} className="text-zinc-700" />
          </div>
          <p className="text-lg font-semibold text-zinc-400 mb-2">Search federal earmarks</p>
          <p className="text-sm text-zinc-600">Find congressionally directed spending by state, keyword, or member of Congress.</p>
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <>
          <div className="mb-6">
            <span className="text-sm text-zinc-500">
              {total.toLocaleString()} award{total !== 1 ? 's' : ''} found
            </span>
          </div>

          <div className="space-y-4">
            {results.length === 0 ? (
              <EmptyState />
            ) : (
              results.map((award, idx) => {
                const color = amountColor(award.award_amount);
                return (
                  <div
                    key={`${award.award_id}-${idx}`}
                    className="flex rounded-xl border border-zinc-800/60 overflow-hidden"
                    style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.03}s forwards` }}
                  >
                    <div className="w-1.5 shrink-0" style={{ background: color }} />
                    <div className="flex-1 p-5 bg-zinc-900/40">
                      {/* Top row: amount + type */}
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`rounded border px-3 py-1.5 text-lg font-bold ${amountBg(award.award_amount)}`}
                            style={{ borderColor: `${color}40`, color }}
                          >
                            {fmtCurrency(award.award_amount)}
                          </span>
                          {award.award_type && (
                            <span className="rounded px-2 py-1 text-xs font-medium bg-zinc-800 text-zinc-400">
                              {award.award_type}
                            </span>
                          )}
                          {award.state && (
                            <span className="rounded px-2 py-1 text-xs font-bold bg-zinc-800 text-zinc-300">
                              {award.state}
                            </span>
                          )}
                        </div>
                        {award.award_id && (
                          <span className="text-xs text-zinc-600 font-mono shrink-0">{award.award_id}</span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-sm font-semibold text-white mb-2 line-clamp-2">
                        {award.description || 'No description available'}
                      </p>

                      {/* Recipient */}
                      {award.recipient_name && (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 mb-3">
                          <p className="text-xs uppercase tracking-wider mb-1 text-zinc-600">RECIPIENT</p>
                          <p className="text-sm text-zinc-300">{award.recipient_name}</p>
                        </div>
                      )}

                      {/* Footer: agency + date */}
                      <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                        <span className="text-sm text-zinc-400">
                          {award.awarding_agency || '\u2014'}
                        </span>
                        <span className="text-sm text-zinc-600 font-mono">
                          {fmtDate(award.start_date)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
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
      <p className="text-sm text-zinc-500">No earmarks found matching your search.</p>
    </div>
  );
}
