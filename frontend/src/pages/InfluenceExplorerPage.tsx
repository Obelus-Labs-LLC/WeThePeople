import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, FileText, Shield, Users, TrendingUp, Map, Share2, AlertTriangle } from 'lucide-react';
import {
  fetchInfluenceStats,
  fetchTopLobbying,
  fetchTopContracts,
  type InfluenceStats,
  type InfluenceLeader,
} from '../api/influence';

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

const SECTOR_COLORS: Record<string, string> = {
  finance: 'text-emerald-400',
  health: 'text-rose-400',
  tech: 'text-violet-400',
  energy: 'text-orange-400',
};

const SECTOR_ROUTES: Record<string, string> = {
  finance: '/finance',
  health: '/health',
  tech: '/technology',
  energy: '/energy',
};

const SECTOR_ENTITY_ROUTES: Record<string, string> = {
  finance: '/finance',
  health: '/health',
  tech: '/technology',
  energy: '/energy',
};

function LeaderRow({ leader, rank, metric }: { leader: InfluenceLeader; rank: number; metric: 'lobbying' | 'contracts' }) {
  const value = metric === 'lobbying' ? leader.total_lobbying : leader.total_contracts;
  const route = `${SECTOR_ENTITY_ROUTES[leader.sector] || '/'}/${leader.entity_id}`;

  return (
    <Link
      to={route}
      className="flex items-center justify-between hover:bg-white/5 rounded-lg px-3 py-2.5 transition-colors no-underline group"
    >
      <div className="flex items-center gap-4">
        <span className="text-white/30 font-mono text-sm w-6 text-right">{rank}.</span>
        <div>
          <span className="text-white font-medium text-sm group-hover:text-blue-400 transition-colors">
            {leader.display_name}
          </span>
          <span className={`ml-2 text-xs uppercase font-semibold ${SECTOR_COLORS[leader.sector] || 'text-slate-400'}`}>
            {leader.sector}
          </span>
        </div>
      </div>
      <span className={`font-mono text-sm font-semibold ${metric === 'lobbying' ? 'text-emerald-400' : 'text-blue-400'}`}>
        {formatMoney(value || 0)}
      </span>
    </Link>
  );
}

export default function InfluenceExplorerPage() {
  const [stats, setStats] = useState<InfluenceStats | null>(null);
  const [topLobbying, setTopLobbying] = useState<InfluenceLeader[]>([]);
  const [topContracts, setTopContracts] = useState<InfluenceLeader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchInfluenceStats(),
      fetchTopLobbying(20),
      fetchTopContracts(20),
    ])
      .then(([s, l, c]) => {
        setStats(s);
        setTopLobbying(l.leaders);
        setTopContracts(c.leaders);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-[1200px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Back to home */}
        <Link to="/" className="text-white/40 hover:text-white/70 text-sm mb-6 inline-block no-underline">
          &larr; Back to sectors
        </Link>

        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="w-8 h-8 text-blue-400" />
            <h1 className="text-4xl font-bold text-white">Influence Explorer</h1>
          </div>
          <p className="text-white/50 max-w-2xl">
            Cross-sector view of how industries influence politics — top lobbying spenders, government contract recipients, enforcement actions, and political connections.
          </p>
        </div>

        {/* Tool CTAs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {[
            { to: '/influence/network', icon: Share2, title: 'Influence Network', desc: 'Interactive force-directed graph of connections between politicians, companies, and legislation.' },
            { to: '/influence/money-flow', icon: DollarSign, title: 'Money Flow Sankey', desc: 'Follow the money from corporations through lobbying and PAC donations to politicians.' },
            { to: '/influence/story', icon: TrendingUp, title: 'Data Story', desc: 'Animated walkthrough of corporate influence — lobbying spend, contracts, and enforcement gaps.' },
            { to: '/influence/timeline', icon: Users, title: 'Influence Timeline', desc: 'Chronological view of lobbying, trades, donations, and legislation for any entity.' },
            { to: '/influence/anomalies', icon: AlertTriangle, title: 'Suspicious Patterns', desc: 'Automatically detected anomalies: trades near votes, lobbying spikes, and enforcement gaps.' },
          ].map((cta) => (
            <Link
              key={cta.to}
              to={cta.to}
              className="flex items-center gap-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 hover:border-blue-500/40 hover:bg-blue-500/10 transition-all no-underline group"
            >
              <cta.icon className="w-8 h-8 text-blue-400 group-hover:scale-110 transition-transform flex-shrink-0" />
              <div>
                <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">{cta.title}</h3>
                <p className="text-xs text-white/40 mt-0.5">{cta.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Aggregate Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { icon: DollarSign, label: 'Total Lobbying', value: formatMoney(stats.total_lobbying_spend), color: 'text-emerald-400' },
              { icon: FileText, label: 'Gov Contracts', value: formatMoney(stats.total_contract_value), color: 'text-blue-400' },
              { icon: Shield, label: 'Enforcement Actions', value: stats.total_enforcement_actions.toLocaleString(), color: 'text-red-400' },
              { icon: Users, label: 'Politicians Connected', value: stats.politicians_connected.toLocaleString(), color: 'text-amber-400' },
            ].map((s) => (
              <div key={s.label} className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                  <span className="text-xs text-white/40 uppercase tracking-wider font-mono">{s.label}</span>
                </div>
                <div className={`text-3xl font-bold font-mono ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Sector Breakdown */}
        {stats && (
          <div className="mb-12">
            <h2 className="text-lg font-bold text-white mb-4">By Sector</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(stats.by_sector).map(([sector, data]) => (
                <Link
                  key={sector}
                  to={SECTOR_ROUTES[sector] || '/'}
                  className="bg-white/[0.03] border border-white/10 rounded-lg p-4 hover:border-white/20 transition-colors no-underline"
                >
                  <div className={`text-sm font-semibold uppercase mb-3 ${SECTOR_COLORS[sector] || 'text-white/50'}`}>
                    {sector}
                  </div>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-white/40">Lobbying</span>
                      <span className="text-emerald-400">{formatMoney(data.lobbying)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Contracts</span>
                      <span className="text-blue-400">{formatMoney(data.contracts)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Enforcement</span>
                      <span className="text-red-400">{data.enforcement}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Spending Map CTA */}
        <div className="mb-12">
          <Link
            to="/influence/map"
            className="group flex items-center gap-5 bg-white/[0.03] border border-white/10 rounded-xl p-6 hover:border-blue-500/30 hover:bg-blue-500/[0.03] transition-all no-underline"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
              <Map className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg group-hover:text-blue-400 transition-colors">
                Spending Map
              </h3>
              <p className="text-white/40 text-sm mt-0.5">
                Geographic heatmap of lobbying spend, donations, and political connections by US state
              </p>
            </div>
            <span className="ml-auto text-white/20 group-hover:text-blue-400 transition-colors text-xl">
              &rarr;
            </span>
          </Link>
        </div>

        {/* Leaderboards */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8">
            {/* Top Lobbying */}
            <div>
              <h2 className="text-lg font-bold text-white mb-4">Top Lobbying Spenders</h2>
              {topLobbying.length > 0 ? (
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-1">
                  {topLobbying.map((l, i) => (
                    <LeaderRow key={l.entity_id} leader={l} rank={i + 1} metric="lobbying" />
                  ))}
                </div>
              ) : (
                <p className="text-white/30 text-sm">No lobbying data yet. Run sync jobs to populate.</p>
              )}
            </div>

            {/* Top Contracts */}
            <div>
              <h2 className="text-lg font-bold text-white mb-4">Top Gov Contract Recipients</h2>
              {topContracts.length > 0 ? (
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-1">
                  {topContracts.map((l, i) => (
                    <LeaderRow key={l.entity_id} leader={l} rank={i + 1} metric="contracts" />
                  ))}
                </div>
              ) : (
                <p className="text-white/30 text-sm">No contract data yet. Run sync jobs to populate.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
