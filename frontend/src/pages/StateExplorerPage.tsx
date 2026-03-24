import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Users, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import SpotlightCard from '../components/SpotlightCard';
import { fetchStates } from '../api/state';
import type { StateListEntry } from '../api/state';
import { fmtNum } from '../utils/format';

// ── All 50 states for the full grid ──

const ALL_STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'District of Columbia' },
];

// ── Page ──

export default function StateExplorerPage() {
  const [stateData, setStateData] = useState<Record<string, StateListEntry>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchStates()
      .then((data) => {
        const map: Record<string, StateListEntry> = {};
        for (const s of data.states) {
          map[s.code] = s;
        }
        setStateData(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredStates = useMemo(() => {
    if (!search.trim()) return ALL_STATES;
    const q = search.toLowerCase();
    return ALL_STATES.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
    );
  }, [search]);

  const totalLegislators = useMemo(
    () => Object.values(stateData).reduce((sum, s) => sum + s.legislators, 0),
    [stateData]
  );
  const totalBills = useMemo(
    () => Object.values(stateData).reduce((sum, s) => sum + s.bills, 0),
    [stateData]
  );
  const statesWithData = Object.keys(stateData).length;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        {/* Nav */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <PoliticsSectorHeader />
        </motion.nav>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-10"
        >
          <p className="font-heading text-xs font-semibold tracking-[0.3em] text-blue-400 uppercase mb-3">
            State Legislatures
          </p>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-white lg:text-5xl">
            Explore by State
          </h1>
          <p className="mt-3 max-w-2xl font-body text-base text-white/40 leading-relaxed">
            Browse state-level legislators and legislation across all 50 states. Powered by OpenStates data.
          </p>
        </motion.div>

        {/* Summary stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
        >
          {[
            { label: 'States with Data', value: statesWithData.toString(), icon: MapPin, color: '#3B82F6' },
            { label: 'State Legislators', value: fmtNum(totalLegislators), icon: Users, color: '#10B981' },
            { label: 'State Bills', value: fmtNum(totalBills), icon: FileText, color: '#F59E0B' },
          ].map((stat, idx) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-heading text-[10px] font-semibold tracking-wider text-white/40 uppercase">
                  {stat.label}
                </span>
                <stat.icon size={16} style={{ color: stat.color }} className="opacity-60" />
              </div>
              <span className="font-mono text-2xl font-bold text-white tracking-tight">
                {stat.value}
              </span>
            </div>
          ))}
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mb-8"
        >
          <div className="relative max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search states..."
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-12 py-3 font-body text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none transition-colors"
            />
          </div>
        </motion.div>

        {/* State Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
        >
          {filteredStates.map((state, idx) => {
            const data = stateData[state.code];
            const hasData = !!data;

            return (
              <motion.div
                key={state.code}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.02, 0.5) }}
              >
                <Link
                  to={hasData ? `/politics/states/${state.code.toLowerCase()}` : '#'}
                  className={`block no-underline ${!hasData ? 'pointer-events-none' : ''}`}
                >
                  <SpotlightCard
                    className={`rounded-xl border ${hasData ? 'border-white/10 hover:border-white/20' : 'border-white/5'} bg-white/[0.03] transition-all`}
                    spotlightColor="rgba(59, 130, 246, 0.08)"
                  >
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-lg font-bold text-blue-400">
                          {state.code}
                        </span>
                      </div>
                      <p className={`font-body text-xs ${hasData ? 'text-white/60' : 'text-white/20'} truncate`}>
                        {state.name}
                      </p>
                      {hasData ? (
                        <div className="mt-2 flex items-center gap-3">
                          <span className="font-mono text-[10px] text-white/30">
                            <Users size={10} className="inline mr-1" />
                            {data.legislators}
                          </span>
                          <span className="font-mono text-[10px] text-white/30">
                            <FileText size={10} className="inline mr-1" />
                            {data.bills}
                          </span>
                        </div>
                      ) : (
                        <p className="mt-2 font-mono text-[10px] text-white/15">
                          No data yet
                        </p>
                      )}
                    </div>
                  </SpotlightCard>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        {filteredStates.length === 0 && (
          <div className="py-20 text-center">
            <p className="font-body text-sm text-white/30">No states match your search.</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <Link to="/politics" className="font-body text-sm text-white/50 hover:text-white transition-colors no-underline">
            &larr; Politics Dashboard
          </Link>
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}
