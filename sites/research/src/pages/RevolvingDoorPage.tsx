import { useState, useEffect, useMemo } from 'react';
import { Search, ArrowLeft, AlertTriangle, Users, ArrowRightLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';

// ── Types ──

interface Anomaly {
  id: number;
  pattern_type: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  score: number;
  title: string | null;
  description: string | null;
  evidence: Record<string, unknown> | null;
  detected_at: string | null;
}

interface Registrant {
  id: number;
  registration_number: string;
  registrant_name: string;
  country: string | null;
  status: string | null;
  registration_date: string | null;
}

// ── Helpers ──

function scoreBadgeClasses(score: number): string {
  if (score >= 7) return 'bg-red-500/10 text-red-400';
  if (score >= 4) return 'bg-amber-500/10 text-amber-400';
  return 'bg-zinc-500/10 text-zinc-400';
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '\u2014';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d;
  }
}

type ViewMode = 'anomalies' | 'lobbyists';

// ── Page ──

export default function RevolvingDoorPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [lobbyists, setLobbyists] = useState<Registrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('anomalies');
  const [totalAnomalies, setTotalAnomalies] = useState(0);

  // Fetch revolving door anomalies
  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ total: number; anomalies: Anomaly[] }>('/anomalies', {
        params: { pattern_type: 'revolving_door', limit: 100 },
      }).catch(() => ({ total: 0, anomalies: [] })),
      apiFetch<{ registrants: Registrant[]; total: number }>('/fara/registrants', {
        params: { limit: 50, status: 'Active' },
      }).catch(() => ({ registrants: [], total: 0 })),
    ]).then(([anomRes, lobRes]) => {
      setAnomalies(anomRes.anomalies || []);
      setTotalAnomalies(anomRes.total || 0);
      setLobbyists(lobRes.registrants || []);
      setLoading(false);
    });
  }, []);

  const filteredAnomalies = useMemo(() => {
    if (!search.trim()) return anomalies;
    const q = search.toLowerCase();
    return anomalies.filter(
      (a) =>
        a.entity_name?.toLowerCase().includes(q) ||
        a.title?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q),
    );
  }, [anomalies, search]);

  const filteredLobbyists = useMemo(() => {
    if (!search.trim()) return lobbyists;
    const q = search.toLowerCase();
    return lobbyists.filter(
      (l) =>
        l.registrant_name?.toLowerCase().includes(q) ||
        l.country?.toLowerCase().includes(q),
    );
  }, [lobbyists, search]);

  if (loading && anomalies.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Back link */}
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8">
        <ArrowLeft size={14} />
        Back to Research Tools
      </Link>

      {/* Header */}
      <div className="mb-8">
        <span className="text-xs font-bold tracking-[0.2em] text-purple-400 uppercase">Influence</span>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50 mt-1" style={{ fontFamily: 'Oswald, sans-serif' }}>
          Revolving Door Tracker
        </h1>
        <p className="text-base text-zinc-400 mt-2 max-w-2xl">
          Detected patterns of officials moving between government and lobbying. Cross-references FARA registrant data with anomaly detection for revolving-door activity.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500 font-mono uppercase">Revolving Door Flags</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">{totalAnomalies.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500 font-mono uppercase">Active FARA Registrants</p>
          <p className="text-2xl font-bold text-white mt-1">{lobbyists.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500 font-mono uppercase">High Severity</p>
          <p className="text-2xl font-bold text-red-400 mt-1">
            {anomalies.filter((a) => a.score >= 7).length}
          </p>
        </div>
      </div>

      {/* View toggle + controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        {/* View toggle */}
        <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
          <button
            onClick={() => setView('anomalies')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              view === 'anomalies'
                ? 'bg-purple-500/20 text-purple-300'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={14} />
              Flagged Patterns
            </span>
          </button>
          <button
            onClick={() => setView('lobbyists')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              view === 'lobbyists'
                ? 'bg-purple-500/20 text-purple-300'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Users size={14} />
              Active Lobbyists
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder={view === 'anomalies' ? 'Search flagged entities...' : 'Search registrants...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-purple-500/50"
          />
        </div>
      </div>

      {/* Count */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm text-zinc-500">
          {view === 'anomalies'
            ? `${filteredAnomalies.length} revolving door flags`
            : `${filteredLobbyists.length} active registrants`}
          {search.trim() ? ` matching "${search}"` : ''}
        </span>
        {loading && <div className="h-4 w-4 animate-spin rounded-full border border-purple-400 border-t-transparent" />}
      </div>

      {/* Anomalies view */}
      {view === 'anomalies' && (
        <div className="space-y-3">
          {filteredAnomalies.map((a) => (
            <div key={a.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 transition-colors hover:border-zinc-700">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/15">
                  <ArrowRightLeft size={18} className="text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-sm font-bold text-white truncate">{a.title || a.entity_name || 'Unnamed'}</h3>
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold font-mono ${scoreBadgeClasses(a.score)}`}>
                      {a.score.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-2">
                    {a.description || 'No description available.'}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-zinc-600">
                    {a.entity_type && <span className="font-mono uppercase">{a.entity_type}</span>}
                    {a.detected_at && <span>{fmtDate(a.detected_at)}</span>}
                  </div>
                  {a.evidence && Object.keys(a.evidence).length > 0 && (
                    <div className="mt-3 rounded-lg bg-zinc-900 border border-zinc-800 p-3">
                      <p className="text-xs text-zinc-500 font-mono uppercase mb-2">Evidence</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(a.evidence).slice(0, 6).map(([k, v]) => (
                          <div key={k}>
                            <p className="text-xs text-zinc-600 font-mono">{k}</p>
                            <p className="text-xs text-zinc-300 truncate">{String(v)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filteredAnomalies.length === 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-12 text-center text-sm text-zinc-500">
              {search.trim() ? 'No revolving door flags match your search.' : 'No revolving door anomalies detected yet.'}
            </div>
          )}
        </div>
      )}

      {/* Lobbyists view */}
      {view === 'lobbyists' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">REGISTRANT</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">COUNTRY</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">REGISTERED</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredLobbyists.map((l) => (
                  <tr key={l.id} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-white">{l.registrant_name || '\u2014'}</p>
                      <p className="text-xs text-zinc-600 font-mono">#{l.registration_number}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300">{l.country || '\u2014'}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-xs text-zinc-500 font-mono">
                      {l.registration_date || '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded px-2 py-1 text-xs font-bold font-mono bg-purple-500/10 text-purple-400">
                        {l.status || '\u2014'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredLobbyists.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-sm text-zinc-500">
                      {search.trim() ? 'No registrants match your search.' : 'No active FARA registrants loaded.'}
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
