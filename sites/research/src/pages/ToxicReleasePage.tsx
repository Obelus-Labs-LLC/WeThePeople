import { useState, useCallback, useEffect } from 'react';
import { Search, Flame, Filter } from 'lucide-react';
import { apiFetch } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface ToxicRelease {
  facility_name: string;
  city: string;
  state: string;
  chemical: string;
  total_releases: number;
  industry: string;
  latitude: number | null;
  longitude: number | null;
  year: number | null;
}

// ── Constants ──

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};

// EPA TRI publishes Reporting Year data 12-18 months after the calendar
// year ends (e.g. RY-2024 lands around March 2026). Build the year list
// dynamically off "today" and default the picker to the most recent year
// that's actually been published — currentYear - 2 — instead of
// hard-coding 2025. The previous hard-coded default produced an
// empty-state on first paint every January after the new calendar year
// rolled over.
const _CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => _CURRENT_YEAR - 1 - i);
const DEFAULT_TRI_YEAR = _CURRENT_YEAR - 2;

// ── Helpers ──

function fmtLbs(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' lbs';
}

// ── Page ──

export default function ToxicReleasePage() {
  // Pre-fill the most recently PUBLISHED reporting year so the page
  // loads with data on first paint. EPA TRI lags 12-18 months, so the
  // "newest" year in the picker (currentYear - 1) is often unpublished
  // and produces an empty result set; default to currentYear - 2 which
  // is virtually guaranteed to have data.
  const DEFAULT_YEAR = String(DEFAULT_TRI_YEAR);
  const [stateFilter, setStateFilter] = useState('');
  const [chemical, setChemical] = useState('');
  const [year, setYear] = useState<string>(DEFAULT_YEAR);
  const [facilityName, setFacilityName] = useState('');
  const [releases, setReleases] = useState<ToxicRelease[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!stateFilter && !chemical.trim() && !year && !facilityName.trim()) return;

    setLoading(true);
    setSearched(true);

    try {
      const params: Record<string, string | number> = { limit: 100 };
      if (stateFilter) params.state = stateFilter;
      if (chemical.trim()) params.chemical = chemical.trim();
      if (year) params.year = parseInt(year);
      if (facilityName.trim()) params.facility_name = facilityName.trim();

      const res = await apiFetch<{ total: number; releases: ToxicRelease[] }>('/research/toxic-releases', { params });
      setReleases(res.releases || []);
      setTotal(res.total);
    } catch {
      setReleases([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [stateFilter, chemical, year, facilityName]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // Auto-load with default filters on first mount so the user sees data
  // immediately. Without this the tool was permanently empty until you
  // touched a filter — and the audit flagged the empty state as a UX
  // regression for journalist drop-ins.
  useEffect(() => {
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasFilters = stateFilter || chemical.trim() || year || facilityName.trim();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Environmental"
        title="Toxic Release Inventory"
        description="Explore EPA Toxic Release Inventory data. Search by state, chemical, facility, or year to find reported toxic chemical releases."
        accent="var(--color-red)"
      />

      {/* Filters */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={14} className="text-orange-500" />
          <span className="text-sm font-medium text-zinc-300">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* State */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-mono uppercase">State</label>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-sm text-white outline-none cursor-pointer focus:border-orange-500/50"
              style={{ colorScheme: 'dark' }}
            >
              <option value="">All States</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s} — {STATE_NAMES[s]}</option>
              ))}
            </select>
          </div>

          {/* Chemical */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-mono uppercase">Chemical</label>
            <input
              type="text"
              placeholder="e.g. Lead, Mercury..."
              value={chemical}
              onChange={(e) => setChemical(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-sm text-white outline-none placeholder-zinc-600 focus:border-orange-500/50"
            />
          </div>

          {/* Year */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-mono uppercase">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-sm text-white outline-none cursor-pointer focus:border-orange-500/50"
              style={{ colorScheme: 'dark' }}
            >
              <option value="">All Years</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Facility */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-mono uppercase">Facility</label>
            <input
              type="text"
              placeholder="Facility name..."
              value={facilityName}
              onChange={(e) => setFacilityName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-sm text-white outline-none placeholder-zinc-600 focus:border-orange-500/50"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSearch}
            disabled={!hasFilters || loading}
            className="rounded-xl px-6 py-2.5 text-sm font-bold text-white cursor-pointer border-0 transition-colors bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching...' : 'Search Releases'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent mb-4" />
          <p className="text-sm text-zinc-500">Querying EPA EnviroFacts...</p>
        </div>
      )}

      {/* No search yet */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
            <Flame size={36} className="text-zinc-700" />
          </div>
          <p className="text-lg font-semibold text-zinc-400 mb-2">Explore toxic releases</p>
          <p className="text-sm text-zinc-600">Filter by state, chemical, year, or facility name above.</p>
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <>
          <div className="flex items-center gap-4 mb-4">
            <span className="text-sm text-zinc-500">
              {total.toLocaleString()} releases found
            </span>
          </div>

          {releases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-zinc-800 bg-zinc-900/30">
              <Search size={48} className="text-zinc-800 mb-4" />
              <p className="text-sm text-zinc-500">No toxic releases match your filters.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">FACILITY</th>
                      <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">CITY</th>
                      <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">STATE</th>
                      <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">CHEMICAL</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono">TOTAL RELEASES</th>
                      <th className="hidden lg:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">INDUSTRY</th>
                      <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono">YEAR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((r, idx) => {
                      const severity =
                        r.total_releases > 100000 ? 'text-red-400' :
                        r.total_releases > 10000 ? 'text-orange-400' :
                        r.total_releases > 1000 ? 'text-amber-400' :
                        'text-zinc-300';

                      return (
                        <tr
                          key={`${r.facility_name}-${r.chemical}-${idx}`}
                          className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30"
                          style={{ opacity: 0, animation: `row-enter 0.2s ease-out ${idx * 0.02}s forwards` }}
                        >
                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-white truncate max-w-[200px]">{r.facility_name || '\u2014'}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-400">{r.city || '\u2014'}</td>
                          <td className="px-4 py-3 text-sm text-zinc-400 font-mono">{r.state || '\u2014'}</td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-orange-300 font-mono">{r.chemical || '\u2014'}</span>
                          </td>
                          <td className={`px-4 py-3 text-right text-sm font-bold font-mono ${severity}`}>
                            {fmtLbs(r.total_releases)}
                          </td>
                          <td className="hidden lg:table-cell px-4 py-3 text-xs text-zinc-500 truncate max-w-[160px]">
                            {r.industry || '\u2014'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-zinc-500 font-mono">
                            {r.year || '\u2014'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes row-enter {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
