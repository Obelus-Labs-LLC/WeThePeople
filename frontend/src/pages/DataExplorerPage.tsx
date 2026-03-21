import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, RefreshCw } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

interface LobbyingLeader {
  entity_id: string;
  display_name: string;
  sector: string;
  total_lobbying: number;
}

interface SectorStats {
  lobbying: number;
  contracts: number;
  enforcement: number;
}

interface StatsData {
  total_lobbying_spend: number;
  total_contract_value: number;
  total_enforcement_actions: number;
  by_sector: Record<string, SectorStats>;
}

const SECTOR_COLORS: Record<string, string> = {
  finance: '#34D399',
  health: '#F472B6',
  tech: '#A78BFA',
  energy: '#FB923C',
};

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function DataExplorerPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [leaders, setLeaders] = useState<LobbyingLeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(new Set(['finance', 'health', 'tech', 'energy']));
  const [metric, setMetric] = useState<'lobbying' | 'contracts' | 'enforcement'>('lobbying');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/influence/stats`).then((r) => r.json()),
      fetch(`${API_BASE}/influence/top-lobbying?limit=30`).then((r) => r.json()),
    ])
      .then(([s, l]) => {
        setStats(s);
        setLeaders(l.leaders || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleSector = (s: string) => {
    setSelectedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const filteredLeaders = leaders.filter((l) => selectedSectors.has(l.sector));

  // Find max value for bar scaling
  const maxLobbying = Math.max(...filteredLeaders.map((l) => l.total_lobbying), 1);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        <Link to="/influence" className="inline-flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-6 no-underline">
          <ArrowLeft className="w-4 h-4" /> Influence Explorer
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            <BarChart3 className="w-8 h-8 inline-block mr-3 text-blue-400" />
            Data Explorer
          </h1>
          <p className="text-white/50">
            Interactive cross-sector analysis. Click sectors to filter — all charts update together.
          </p>
        </div>

        {/* Sector toggles — dc.js-inspired coordinated filtering */}
        <div className="flex flex-wrap gap-3 mb-8">
          {Object.entries(SECTOR_COLORS).map(([sector, color]) => (
            <button
              key={sector}
              onClick={() => toggleSector(sector)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all border ${
                selectedSectors.has(sector)
                  ? 'bg-opacity-100 scale-100'
                  : 'opacity-30 scale-95'
              }`}
              style={{
                backgroundColor: selectedSectors.has(sector) ? color + '20' : 'transparent',
                borderColor: color + '40',
                color: color,
              }}
            >
              {sector}
            </button>
          ))}
          <button
            onClick={() => setSelectedSectors(new Set(['finance', 'health', 'tech', 'energy']))}
            className="px-4 py-2 rounded-xl text-xs text-white/30 hover:text-white/60 border border-white/10 transition-colors"
          >
            <RefreshCw className="w-3 h-3 inline mr-1" /> Reset
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Sector breakdown donut */}
          {stats && (
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
              <h3 className="text-xs font-mono text-white/40 uppercase tracking-wider mb-4">Sector Breakdown</h3>
              <div className="flex flex-col gap-3">
                {Object.entries(stats.by_sector)
                  .filter(([s]) => selectedSectors.has(s))
                  .map(([sector, data]) => {
                    const val = metric === 'lobbying' ? data.lobbying : metric === 'contracts' ? data.contracts : data.enforcement;
                    const total = Object.entries(stats.by_sector)
                      .filter(([s]) => selectedSectors.has(s))
                      .reduce((sum, [, d]) => sum + (metric === 'lobbying' ? d.lobbying : metric === 'contracts' ? d.contracts : d.enforcement), 0);
                    const pct = total > 0 ? (val / total) * 100 : 0;
                    return (
                      <div key={sector}>
                        <div className="flex justify-between text-sm mb-1">
                          <span style={{ color: SECTOR_COLORS[sector] }} className="font-bold uppercase">{sector}</span>
                          <span className="text-white/50 font-mono">
                            {metric === 'enforcement' ? val.toLocaleString() : formatMoney(val)}
                          </span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: SECTOR_COLORS[sector] }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div className="flex gap-2 mt-4">
                {(['lobbying', 'contracts', 'enforcement'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                      metric === m ? 'bg-blue-500/20 text-blue-400' : 'text-white/30 hover:text-white/50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Totals cards */}
          {stats && (
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
              <h3 className="text-xs font-mono text-white/40 uppercase tracking-wider mb-4">Filtered Totals</h3>
              {(() => {
                const filteredStats = Object.entries(stats.by_sector)
                  .filter(([s]) => selectedSectors.has(s))
                  .reduce(
                    (acc, [, d]) => ({
                      lobbying: acc.lobbying + d.lobbying,
                      contracts: acc.contracts + d.contracts,
                      enforcement: acc.enforcement + d.enforcement,
                    }),
                    { lobbying: 0, contracts: 0, enforcement: 0 }
                  );
                return (
                  <div className="space-y-4">
                    <div>
                      <p className="text-white/40 text-xs font-mono">LOBBYING SPEND</p>
                      <p className="text-2xl font-bold text-white font-mono">{formatMoney(filteredStats.lobbying)}</p>
                    </div>
                    <div>
                      <p className="text-white/40 text-xs font-mono">CONTRACT VALUE</p>
                      <p className="text-2xl font-bold text-white font-mono">{formatMoney(filteredStats.contracts)}</p>
                    </div>
                    <div>
                      <p className="text-white/40 text-xs font-mono">ENFORCEMENT ACTIONS</p>
                      <p className="text-2xl font-bold text-white font-mono">{filteredStats.enforcement.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Quick navigation */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
            <h3 className="text-xs font-mono text-white/40 uppercase tracking-wider mb-4">Explore</h3>
            <div className="space-y-2">
              {[
                { to: '/influence/money-flow', label: 'Money Flow Sankey', desc: 'Follow the money visually' },
                { to: '/influence/network', label: 'Influence Network', desc: 'Force-directed connections' },
                { to: '/influence/map', label: 'Spending Map', desc: 'Geographic breakdown' },
                { to: '/influence/story', label: 'Data Story', desc: 'Animated narrative' },
                { to: '/influence/closed-loops', label: 'Closed Loops', desc: 'Detect circular influence' },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="block rounded-lg bg-white/5 px-4 py-3 hover:bg-white/10 transition-colors no-underline"
                >
                  <p className="text-sm text-white font-medium">{link.label}</p>
                  <p className="text-xs text-white/30">{link.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Top lobbying bar chart — coordinated with sector filter */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <h3 className="text-xs font-mono text-white/40 uppercase tracking-wider mb-4">
            Top Lobbying Spenders ({selectedSectors.size} sector{selectedSectors.size !== 1 ? 's' : ''})
          </h3>
          <div className="space-y-2">
            {filteredLeaders.slice(0, 20).map((l, i) => (
              <div key={l.entity_id} className="flex items-center gap-3">
                <span className="text-white/20 font-mono text-xs w-6 text-right">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-white truncate max-w-[300px]">{l.display_name}</span>
                    <span className="text-xs font-mono text-white/50">{formatMoney(l.total_lobbying)}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(l.total_lobbying / maxLobbying) * 100}%`,
                        backgroundColor: SECTOR_COLORS[l.sector],
                      }}
                    />
                  </div>
                </div>
                <span
                  className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded"
                  style={{ color: SECTOR_COLORS[l.sector], backgroundColor: SECTOR_COLORS[l.sector] + '20' }}
                >
                  {l.sector}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
