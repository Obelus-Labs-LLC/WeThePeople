import { useState, useCallback } from 'react';
import { Search, GraduationCap, ArrowLeft, Percent, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';

// ── Types ──

interface College {
  name: string;
  state: string | null;
  city: string | null;
  tuition_in_state: number | null;
  tuition_out_state: number | null;
  graduation_rate: number | null;
  default_rate: number | null;
  median_debt: number | null;
  median_earnings: number | null;
  ownership: string | null;
  size: number | null;
}

// ── Helpers ──

function fmtCurrency(val: number | null): string {
  if (val == null) return '\u2014';
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtPct(val: number | null): string {
  if (val == null) return '\u2014';
  return `${(val * 100).toFixed(1)}%`;
}

function gradColor(rate: number | null): string {
  if (rate == null) return 'text-zinc-500';
  if (rate >= 0.7) return 'text-emerald-400';
  if (rate >= 0.5) return 'text-amber-400';
  return 'text-red-400';
}

function defaultColor(rate: number | null): string {
  if (rate == null) return 'text-zinc-500';
  if (rate <= 0.05) return 'text-emerald-400';
  if (rate <= 0.1) return 'text-amber-400';
  return 'text-red-400';
}

// ── US States ──

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
];

// ── Page ──

export default function CollegeScorecardPage() {
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [forProfit, setForProfit] = useState(false);
  const [results, setResults] = useState<College[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!name.trim() && !state) return;

    setLoading(true);
    setSearched(true);

    try {
      const params: Record<string, string | boolean | number> = { limit: 20 };
      if (name.trim()) params.name = name.trim();
      if (state) params.state = state;
      if (forProfit) params.for_profit = true;

      const data = await apiFetch<{ total: number; schools: College[] }>(
        '/research/college-scorecard',
        { params },
      );
      setResults(data.schools || []);
      setTotal(data.total || 0);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [name, state, forProfit]);

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
        <span className="text-xs font-bold tracking-[0.2em] text-purple-400 uppercase">Education</span>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50 mt-1" style={{ fontFamily: 'Oswald, sans-serif' }}>
          College Scorecard Explorer
        </h1>
        <p className="text-base text-zinc-400 mt-2 max-w-2xl">
          Search the Department of Education College Scorecard. Compare tuition, graduation rates, loan default rates, and post-graduation earnings.
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 max-w-3xl">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="School name (e.g. MIT, UCLA)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 pl-10 pr-3 text-sm text-white outline-none transition-colors focus:border-purple-500/50 placeholder:text-zinc-600"
          />
        </div>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 px-3 text-sm text-white outline-none transition-colors focus:border-purple-500/50 appearance-none cursor-pointer"
        >
          <option value="">All States</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 px-4 cursor-pointer">
          <input
            type="checkbox"
            checked={forProfit}
            onChange={(e) => setForProfit(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-purple-500"
          />
          <span className="text-sm text-zinc-400">For-profit only</span>
        </label>
      </div>

      <div className="mb-8 max-w-3xl">
        <button
          onClick={handleSearch}
          disabled={(!name.trim() && !state) || loading}
          className="rounded-xl px-6 py-3 text-sm font-bold text-white cursor-pointer border-0 transition-colors bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching...' : 'Search Schools'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent mb-4" />
          <p className="text-sm text-zinc-500">Searching College Scorecard...</p>
        </div>
      )}

      {/* No search yet */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
            <GraduationCap size={36} className="text-zinc-700" />
          </div>
          <p className="text-lg font-semibold text-zinc-400 mb-2">Explore college data</p>
          <p className="text-sm text-zinc-600">Search by school name or state to compare tuition, outcomes, and debt levels.</p>
        </div>
      )}

      {/* Results - Card Grid */}
      {!loading && searched && (
        <>
          <div className="mb-6">
            <span className="text-sm text-zinc-500">
              {total.toLocaleString()} school{total !== 1 ? 's' : ''} found
            </span>
          </div>

          {results.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((school, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5 hover:bg-zinc-900/70 hover:border-zinc-700 transition-all"
                  style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.04}s forwards` }}
                >
                  {/* School name + location */}
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white mb-1">{school.name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {school.city && school.state && (
                        <span className="text-sm text-zinc-500">{school.city}, {school.state}</span>
                      )}
                      {school.ownership && (
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          school.ownership.toLowerCase().includes('public')
                            ? 'bg-blue-500/10 text-blue-400'
                            : school.ownership.toLowerCase().includes('private non')
                            ? 'bg-purple-500/10 text-purple-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {school.ownership}
                        </span>
                      )}
                      {school.size != null && (
                        <span className="text-xs text-zinc-600">{school.size.toLocaleString()} students</span>
                      )}
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatBox
                      label="Tuition (In-State)"
                      value={fmtCurrency(school.tuition_in_state)}
                      icon={<DollarSign size={14} className="text-purple-400" />}
                    />
                    <StatBox
                      label="Graduation Rate"
                      value={fmtPct(school.graduation_rate)}
                      valueClass={gradColor(school.graduation_rate)}
                      icon={<Percent size={14} className="text-purple-400" />}
                    />
                    <StatBox
                      label="Default Rate"
                      value={fmtPct(school.default_rate)}
                      valueClass={defaultColor(school.default_rate)}
                      icon={<Percent size={14} className="text-red-400" />}
                    />
                    <StatBox
                      label="Median Debt"
                      value={fmtCurrency(school.median_debt)}
                      icon={<DollarSign size={14} className="text-amber-400" />}
                    />
                  </div>

                  {/* Median earnings footer */}
                  {school.median_earnings != null && (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 uppercase tracking-wider">Median Earnings (10yr)</span>
                        <span className="text-sm font-bold text-emerald-400">{fmtCurrency(school.median_earnings)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
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

function StatBox({ label, value, valueClass, icon }: { label: string; value: string; valueClass?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-zinc-600 uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-sm font-bold ${valueClass || 'text-white'}`}>{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-zinc-800 bg-zinc-900/30">
      <Search size={48} className="text-zinc-800 mb-4" />
      <p className="text-sm text-zinc-500">No schools found matching your search.</p>
    </div>
  );
}
