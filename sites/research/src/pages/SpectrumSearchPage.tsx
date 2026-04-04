import { useState, useCallback } from 'react';
import { Search, Signal, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';

// ── Types ──

interface FccLicense {
  license_holder: string | null;
  call_sign: string | null;
  frequency: string | null;
  service_type: string | null;
  status: string | null;
  grant_date: string | null;
  expiration_date: string | null;
  state: string | null;
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

function statusBadge(status: string | null): { text: string; cls: string } {
  if (!status) return { text: '\u2014', cls: 'text-zinc-500' };
  const s = status.toLowerCase();
  if (s.includes('active') || s.includes('granted')) return { text: status, cls: 'text-emerald-400' };
  if (s.includes('expired') || s.includes('terminated')) return { text: status, cls: 'text-red-400' };
  if (s.includes('pending')) return { text: status, cls: 'text-amber-400' };
  return { text: status, cls: 'text-zinc-400' };
}

// ── Page ──

export default function SpectrumSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FccLicense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);

    try {
      const data = await apiFetch<{ total: number; licenses: FccLicense[] }>(
        '/research/fcc-licenses',
        { params: { query: q, limit: 50 } },
      );
      setResults(data.licenses || []);
      setTotal(data.total || 0);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query]);

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
        <span className="text-xs font-bold tracking-[0.2em] text-blue-400 uppercase">Spectrum</span>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50 mt-1" style={{ fontFamily: 'Oswald, sans-serif' }}>
          FCC License / Spectrum Search
        </h1>
        <p className="text-base text-zinc-400 mt-2 max-w-2xl">
          Search FCC spectrum licenses by company or entity name. View call signs, frequencies, service types, and license status.
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3 mb-8 max-w-2xl">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by company or entity (e.g. Verizon, SpaceX)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3.5 pl-12 pr-4 text-base text-white outline-none transition-colors focus:border-blue-500/50 placeholder:text-zinc-600"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!query.trim() || loading}
          className="rounded-xl px-6 py-3.5 text-sm font-bold text-white cursor-pointer border-0 transition-colors bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-4" />
          <p className="text-sm text-zinc-500">Searching FCC license database...</p>
        </div>
      )}

      {/* No search yet */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
            <Signal size={36} className="text-zinc-700" />
          </div>
          <p className="text-lg font-semibold text-zinc-400 mb-2">Search spectrum licenses</p>
          <p className="text-sm text-zinc-600">Find FCC licenses by entity name, call sign, or frequency allocation.</p>
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <>
          <div className="mb-6">
            <span className="text-sm text-zinc-500">
              {total.toLocaleString()} license{total !== 1 ? 's' : ''} found
            </span>
          </div>

          {results.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60">
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">License Holder</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Call Sign</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Frequency</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Service</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Status</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Grant</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((lic, idx) => {
                    const badge = statusBadge(lic.status);
                    return (
                      <tr
                        key={idx}
                        className="border-b border-zinc-800/40 hover:bg-zinc-900/40 transition-colors"
                        style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.02}s forwards` }}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-white max-w-[200px] truncate">{lic.license_holder || '\u2014'}</td>
                        <td className="px-4 py-3 text-sm text-blue-400 font-mono">{lic.call_sign || '\u2014'}</td>
                        <td className="px-4 py-3 text-sm text-zinc-400 font-mono">{lic.frequency || '\u2014'}</td>
                        <td className="px-4 py-3 text-sm text-zinc-400">{lic.service_type || '\u2014'}</td>
                        <td className={`px-4 py-3 text-sm font-medium ${badge.cls}`}>{badge.text}</td>
                        <td className="px-4 py-3 text-sm text-zinc-500 font-mono">{fmtDate(lic.grant_date)}</td>
                        <td className="px-4 py-3 text-sm text-zinc-500 font-mono">{fmtDate(lic.expiration_date)}</td>
                      </tr>
                    );
                  })}
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
      <p className="text-sm text-zinc-500">No licenses found matching your search.</p>
    </div>
  );
}
