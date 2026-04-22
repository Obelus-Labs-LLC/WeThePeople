import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Globe, ExternalLink, BarChart3 } from 'lucide-react';
import { apiFetch } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface Registrant {
  id: number;
  registration_number: string;
  registrant_name: string;
  country: string | null;
  status: string | null;
  registration_date: string | null;
  termination_date: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

interface ForeignPrincipal {
  id: number;
  registration_number: string;
  registrant_name: string | null;
  foreign_principal_name: string;
  country: string | null;
  status: string | null;
  principal_registration_date: string | null;
  principal_termination_date: string | null;
}

interface CountryItem {
  country: string;
  principal_count: number;
}

interface StatsData {
  total_registrants: number;
  active_registrants: number;
  terminated_registrants: number;
  total_foreign_principals: number;
  total_agents: number;
  top_countries: { country: string; count: number }[];
}

// ── Helpers ──

function statusBadgeClasses(status: string | null): string {
  if (!status) return 'bg-zinc-500/10 text-zinc-400';
  const s = status.toLowerCase();
  if (s.includes('active')) return 'bg-indigo-500/10 text-indigo-400';
  if (s.includes('terminat')) return 'bg-zinc-500/10 text-zinc-500';
  return 'bg-purple-500/10 text-purple-400';
}

type ViewMode = 'registrants' | 'principals';

// ── Page ──

export default function ForeignLobbyingPage() {
  const [view, setView] = useState<ViewMode>('registrants');
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [principals, setPrincipals] = useState<ForeignPrincipal[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Fetch countries + stats on mount
  useEffect(() => {
    apiFetch<{ countries: CountryItem[] }>('/fara/countries')
      .then((res) => setCountries(res.countries || []))
      .catch(() => {});

    apiFetch<StatsData>('/fara/stats')
      .then((res) => setStats(res))
      .catch(() => {});
  }, []);

  // Fetch data when filters change
  useEffect(() => {
    setLoading(true);
    const params: Record<string, string | number> = { limit: 100 };
    if (search.trim()) params.search = search.trim();
    if (countryFilter) params.country = countryFilter;
    if (statusFilter) params.status = statusFilter;

    if (view === 'registrants') {
      apiFetch<{ registrants: Registrant[]; total: number }>('/fara/registrants', { params })
        .then((res) => setRegistrants(res.registrants || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      apiFetch<{ foreign_principals: ForeignPrincipal[]; total: number }>('/fara/foreign-principals', { params })
        .then((res) => setPrincipals(res.foreign_principals || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [view, search, countryFilter, statusFilter]);

  // Local search filtering
  const filteredRegistrants = useMemo(() => {
    if (!search.trim()) return registrants;
    const q = search.toLowerCase();
    return registrants.filter(
      (r) =>
        r.registrant_name?.toLowerCase().includes(q) ||
        r.country?.toLowerCase().includes(q) ||
        r.registration_number?.toLowerCase().includes(q),
    );
  }, [registrants, search]);

  const filteredPrincipals = useMemo(() => {
    if (!search.trim()) return principals;
    const q = search.toLowerCase();
    return principals.filter(
      (fp) =>
        fp.foreign_principal_name?.toLowerCase().includes(q) ||
        fp.registrant_name?.toLowerCase().includes(q) ||
        fp.country?.toLowerCase().includes(q),
    );
  }, [principals, search]);

  if (loading && registrants.length === 0 && principals.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Foreign Lobbying"
        title="FARA Registry Search"
        description="Foreign Agents Registration Act data — who lobbies for foreign governments and entities in the United States."
        accent="var(--color-ind)"
      />

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs text-zinc-500 font-mono uppercase">Registrants</p>
            <p className="text-2xl font-bold text-white mt-1">{stats.total_registrants.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs text-zinc-500 font-mono uppercase">Active</p>
            <p className="text-2xl font-bold text-indigo-400 mt-1">{stats.active_registrants.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs text-zinc-500 font-mono uppercase">Foreign Principals</p>
            <p className="text-2xl font-bold text-white mt-1">{stats.total_foreign_principals.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs text-zinc-500 font-mono uppercase">Agents</p>
            <p className="text-2xl font-bold text-white mt-1">{stats.total_agents.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Top countries */}
      {stats && stats.top_countries.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={14} className="text-indigo-400" />
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Top Countries by Foreign Principals</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.top_countries.map((c) => (
              <button
                key={c.country}
                onClick={() => setCountryFilter(c.country === countryFilter ? '' : c.country)}
                className={`rounded-full px-3 py-1 text-xs font-mono transition-colors cursor-pointer ${
                  countryFilter === c.country
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                }`}
              >
                {c.country} ({c.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* View toggle + controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        {/* View toggle */}
        <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
          <button
            onClick={() => setView('registrants')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              view === 'registrants'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Registrants
          </button>
          <button
            onClick={() => setView('principals')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              view === 'principals'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Foreign Principals
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder={view === 'registrants' ? 'Search registrant or country...' : 'Search principal, registrant, or country...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Country dropdown */}
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-zinc-500" />
          <select
            className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white outline-none cursor-pointer"
            style={{ colorScheme: 'dark' }}
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
          >
            <option value="">ALL COUNTRIES</option>
            {countries.map((c) => (
              <option key={c.country} value={c.country}>
                {c.country} ({c.principal_count})
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-zinc-500" />
          <select
            className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white outline-none cursor-pointer"
            style={{ colorScheme: 'dark' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">ALL STATUS</option>
            <option value="Active">ACTIVE</option>
            <option value="Terminated">TERMINATED</option>
          </select>
        </div>
      </div>

      {/* Count */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm text-zinc-500">
          {view === 'registrants'
            ? `${filteredRegistrants.length} registrants`
            : `${filteredPrincipals.length} foreign principals`}
          {search.trim() ? ` matching "${search}"` : ''}
          {countryFilter ? ` in ${countryFilter}` : ''}
        </span>
        {loading && <div className="h-4 w-4 animate-spin rounded-full border border-indigo-400 border-t-transparent" />}
      </div>

      {/* Registrants table */}
      {view === 'registrants' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">REGISTRANT</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">COUNTRY</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">LOCATION</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">REGISTERED</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">STATUS</th>
                  <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrants.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-white">{r.registrant_name || '\u2014'}</p>
                      <p className="text-xs text-zinc-600 font-mono">#{r.registration_number}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300">{r.country || '\u2014'}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-xs text-zinc-500">
                      {[r.city, r.state].filter(Boolean).join(', ') || '\u2014'}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-xs text-zinc-500 font-mono">
                      {r.registration_date || '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded px-2 py-1 text-xs font-bold font-mono ${statusBadgeClasses(r.status)}`}>
                        {r.status || '\u2014'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`https://efile.fara.gov/ords/f?p=171:200:0::NO:RP,200:P200_REG_NUMBER:${r.registration_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-600 hover:text-indigo-400 transition-colors"
                        title="View on FARA eFiling"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
                {filteredRegistrants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">
                      {search.trim() || countryFilter ? 'No registrants match your filters.' : 'No FARA registrants on record.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Foreign principals table */}
      {view === 'principals' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">FOREIGN PRINCIPAL</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">COUNTRY</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">REGISTRANT</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">REGISTERED</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrincipals.map((fp) => (
                  <tr key={fp.id} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-white">{fp.foreign_principal_name || '\u2014'}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300">{fp.country || '\u2014'}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-zinc-400">{fp.registrant_name || '\u2014'}</p>
                      <p className="text-xs text-zinc-600 font-mono">#{fp.registration_number}</p>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-xs text-zinc-500 font-mono">
                      {fp.principal_registration_date || '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded px-2 py-1 text-xs font-bold font-mono ${statusBadgeClasses(fp.status)}`}>
                        {fp.status || '\u2014'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredPrincipals.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-zinc-500">
                      {search.trim() || countryFilter ? 'No foreign principals match your filters.' : 'No foreign principals on record.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
