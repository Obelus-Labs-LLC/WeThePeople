import { useState, useCallback } from 'react';
import { Search, Radio } from 'lucide-react';
import { apiFetch } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface FccComplaint {
  company: string | null;
  issue: string | null;
  date: string | null;
  state: string | null;
  status: string | null;
  method: string | null;
}

// ── Helpers ──

function fmtDate(d: string | null): string {
  if (!d) return '\u2014';
  try {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

function statusColor(status: string | null): string {
  if (!status) return 'text-zinc-500';
  const s = status.toLowerCase();
  if (s.includes('closed') || s.includes('resolved')) return 'text-emerald-400';
  if (s.includes('open') || s.includes('pending')) return 'text-amber-400';
  return 'text-zinc-400';
}

// ── US States ──

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
];

// ── Issue types ──

const ISSUE_TYPES = [
  'Robocalls',
  'Unwanted Calls',
  'Billing',
  'Internet',
  'Disability Access',
  'TV',
  'Phone',
  'Radio',
  'Emergency',
  'Other',
];

// ── Page ──

export default function FccComplaintsPage() {
  const [company, setCompany] = useState('');
  const [issue, setIssue] = useState('');
  const [state, setState] = useState('');
  const [results, setResults] = useState<FccComplaint[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!company.trim() && !issue && !state) return;

    setLoading(true);
    setSearched(true);

    try {
      const params: Record<string, string> = { limit: '50' };
      if (company.trim()) params.company = company.trim();
      if (issue) params.issue = issue;
      if (state) params.state = state;

      const data = await apiFetch<{ total: number; complaints: FccComplaint[] }>(
        '/research/fcc-complaints',
        { params },
      );
      setResults(data.complaints || []);
      setTotal(data.total || 0);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [company, issue, state]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Telecom"
        title="FCC Complaint Lookup"
        description="Search FCC consumer complaints by company, issue type, or state. Track telecom and broadband complaint trends."
        accent="var(--color-dem)"
      />

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 max-w-3xl">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Company (e.g. AT&T, Comcast)"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 pl-10 pr-3 text-sm text-white outline-none transition-colors focus:border-cyan-500/50 placeholder:text-zinc-600"
          />
        </div>
        <select
          value={issue}
          onChange={(e) => setIssue(e.target.value)}
          className="rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 px-3 text-sm text-white outline-none transition-colors focus:border-cyan-500/50 appearance-none cursor-pointer"
        >
          <option value="">All Issues</option>
          {ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="rounded-xl border border-zinc-800 bg-zinc-900/80 py-3 px-3 text-sm text-white outline-none transition-colors focus:border-cyan-500/50 appearance-none cursor-pointer"
        >
          <option value="">All States</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="mb-8 max-w-3xl">
        <button
          onClick={handleSearch}
          disabled={(!company.trim() && !issue && !state) || loading}
          className="rounded-xl px-6 py-3 text-sm font-bold text-white cursor-pointer border-0 transition-colors bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching...' : 'Search Complaints'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent mb-4" />
          <p className="text-sm text-zinc-500">Searching FCC complaint database...</p>
        </div>
      )}

      {/* No search yet */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
            <Radio size={36} className="text-zinc-700" />
          </div>
          <p className="text-lg font-semibold text-zinc-400 mb-2">Search FCC complaints</p>
          <p className="text-sm text-zinc-600">Find consumer complaints filed with the FCC by company, issue, or state.</p>
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <>
          <div className="mb-6">
            <span className="text-sm text-zinc-500">
              {total.toLocaleString()} complaint{total !== 1 ? 's' : ''} found
            </span>
          </div>

          {results.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60">
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Company</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Issue</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Date</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">State</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((c, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-zinc-800/40 hover:bg-zinc-900/40 transition-colors"
                      style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.02}s forwards` }}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-white">{c.company || '\u2014'}</td>
                      <td className="px-4 py-3 text-sm text-zinc-400">{c.issue || '\u2014'}</td>
                      <td className="px-4 py-3 text-sm text-zinc-500 font-mono">{fmtDate(c.date)}</td>
                      <td className="px-4 py-3 text-sm text-zinc-400 font-mono">{c.state || '\u2014'}</td>
                      <td className={`px-4 py-3 text-sm font-medium ${statusColor(c.status)}`}>{c.status || '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
      <p className="text-sm text-zinc-500">No complaints found matching your search.</p>
    </div>
  );
}
