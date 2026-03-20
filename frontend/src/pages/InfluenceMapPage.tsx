import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Map, DollarSign, Users, Briefcase } from 'lucide-react';
import ChoroplethMap from '../components/ChoroplethMap';
import {
  fetchSpendingByState,
  type SpendingMetric,
  type SectorFilter,
  type StateSpendingData,
} from '../api/influence';

// ── Helpers ──

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatTotal(value: number, metric: SpendingMetric): string {
  if (metric === 'members') return value.toLocaleString();
  return formatMoney(value);
}

// ── Metric / Sector configs ──

const METRICS: { key: SpendingMetric; label: string; icon: typeof DollarSign; description: string }[] = [
  { key: 'donations', label: 'Donations', icon: DollarSign, description: 'PAC & corporate donations flowing to politicians by state' },
  { key: 'lobbying', label: 'Lobbying', icon: Briefcase, description: 'Lobbying spend attributed to each state via political donations' },
  { key: 'members', label: 'Members', icon: Users, description: 'Tracked members of Congress per state' },
];

const SECTORS: { key: SectorFilter | 'all'; label: string; color: string }[] = [
  { key: 'all', label: 'All Sectors', color: 'bg-blue-500' },
  { key: 'finance', label: 'Finance', color: 'bg-emerald-500' },
  { key: 'health', label: 'Health', color: 'bg-rose-500' },
  { key: 'tech', label: 'Tech', color: 'bg-violet-500' },
  { key: 'energy', label: 'Energy', color: 'bg-orange-500' },
];

// ── State name lookup ──

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming', DC: 'District of Columbia',
};

// ── Page Component ──

export default function InfluenceMapPage() {
  const navigate = useNavigate();
  const [metric, setMetric] = useState<SpendingMetric>('donations');
  const [sector, setSector] = useState<SectorFilter | 'all'>('all');
  const [stateData, setStateData] = useState<Record<string, StateSpendingData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data when metric or sector changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    const sectorParam = sector === 'all' ? undefined : sector;
    fetchSpendingByState(metric, sectorParam)
      .then((res) => setStateData(res.states))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [metric, sector]);

  // Compute totals
  const totalValue = Object.values(stateData).reduce((sum, d) => sum + d.value, 0);
  const totalRecords = Object.values(stateData).reduce((sum, d) => sum + d.count, 0);
  const statesWithData = Object.keys(stateData).length;

  // Top states ranking
  const topStates = Object.entries(stateData)
    .sort(([, a], [, b]) => b.value - a.value)
    .slice(0, 10);

  const handleStateClick = useCallback((abbr: string, _name: string) => {
    navigate(`/politics/states/${abbr}`);
  }, [navigate]);

  const currentMetric = METRICS.find((m) => m.key === metric)!;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-[1400px] px-6 py-10 lg:px-12 lg:py-14">
        {/* Navigation */}
        <Link
          to="/influence"
          className="text-white/40 hover:text-white/70 text-sm mb-6 inline-block no-underline"
        >
          &larr; Back to Influence Explorer
        </Link>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-3">
            <Map className="w-8 h-8 text-blue-400" />
            <h1 className="text-4xl font-bold text-white">Influence Map</h1>
          </div>
          <p className="text-white/50 max-w-2xl">
            Geographic view of political influence across the United States. See which
            states attract the most lobbying spend, corporate donations, and political
            attention from industry.
          </p>
        </motion.div>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex flex-wrap gap-6 mb-8"
        >
          {/* Metric selector */}
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider font-mono mb-2 block">
              Metric
            </label>
            <div className="flex gap-1 bg-white/[0.03] border border-white/10 rounded-lg p-1">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    metric === m.key
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'text-white/50 hover:text-white/70 border border-transparent'
                  }`}
                >
                  <m.icon className="w-3.5 h-3.5" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sector filter */}
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider font-mono mb-2 block">
              Sector
            </label>
            <div className="flex gap-1 bg-white/[0.03] border border-white/10 rounded-lg p-1">
              {SECTORS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSector(s.key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    sector === s.key
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'text-white/50 hover:text-white/70 border border-transparent'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Description */}
        <div className="text-white/30 text-sm mb-6 italic">
          {currentMetric.description}
          {sector !== 'all' && ` (${SECTORS.find((s) => s.key === sector)?.label} sector only)`}
        </div>

        {/* Map */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-10"
        >
          {loading ? (
            <div className="flex items-center justify-center h-[500px] rounded-xl border border-white/10 bg-slate-900/50">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-[500px] rounded-xl border border-white/10 bg-slate-900/50">
              <p className="text-white/40 text-sm">Error loading data: {error}</p>
            </div>
          ) : (
            <ChoroplethMap
              data={stateData}
              metric={metric}
              onStateClick={handleStateClick}
            />
          )}
        </motion.div>

        {/* Summary stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10"
        >
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <div className="text-xs text-white/40 uppercase tracking-wider font-mono mb-2">
              Total Across All States
            </div>
            <div className="text-2xl font-bold font-mono text-blue-400">
              {formatTotal(totalValue, metric)}
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <div className="text-xs text-white/40 uppercase tracking-wider font-mono mb-2">
              Total Records
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {totalRecords.toLocaleString()}
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <div className="text-xs text-white/40 uppercase tracking-wider font-mono mb-2">
              States with Data
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {statesWithData} / 51
            </div>
          </div>
        </motion.div>

        {/* Top States ranking */}
        {topStates.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <h2 className="text-lg font-bold text-white mb-4">Top 10 States</h2>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              {topStates.map(([abbr, d], i) => {
                const barWidth = topStates[0] ? (d.value / topStates[0][1].value) * 100 : 0;
                return (
                  <div
                    key={abbr}
                    className="flex items-center gap-4 py-2.5 px-3 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <span className="text-white/30 font-mono text-sm w-6 text-right">
                      {i + 1}.
                    </span>
                    <span className="text-white font-medium text-sm w-32">
                      {STATE_NAMES[abbr] || abbr}
                    </span>
                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor:
                            metric === 'donations'
                              ? '#3b82f6'
                              : metric === 'lobbying'
                              ? '#10b981'
                              : '#f59e0b',
                        }}
                      />
                    </div>
                    <span className="text-sm font-mono font-semibold text-white/70 w-28 text-right">
                      {formatTotal(d.value, metric)}
                    </span>
                    <span className="text-xs font-mono text-white/30 w-20 text-right">
                      {d.count.toLocaleString()} rec
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
