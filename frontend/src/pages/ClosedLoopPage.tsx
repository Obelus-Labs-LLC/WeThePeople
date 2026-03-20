import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  FileText,
  Users,
  User,
  DollarSign,
  Filter,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

interface ClosedLoop {
  company: { entity_type: string; entity_id: string; display_name: string };
  lobbying: { total_income: number; issue_codes: string; filing_count: number };
  bill: { bill_id: string; title: string; policy_area: string; status: string; referral_date: string | null };
  committee: { thomas_id: string; name: string; chamber: string | null; referral_date: string | null };
  politician: { person_id: string; committee_role: string; display_name: string; party: string; state: string };
  donation: { total_amount: number; donation_count: number; latest_date: string | null };
}

interface ClosedLoopResponse {
  closed_loops: ClosedLoop[];
  stats: {
    total_loops_found: number;
    unique_companies: number;
    unique_politicians: number;
    unique_bills: number;
    total_lobbying_spend: number;
    total_donations: number;
  };
}

const SECTORS = ['All', 'Finance', 'Health', 'Tech', 'Energy'] as const;
type SectorFilter = (typeof SECTORS)[number];

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function ClosedLoopPage() {
  const [data, setData] = useState<ClosedLoopResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [sector, setSector] = useState<SectorFilter>('All');
  const [minDonation, setMinDonation] = useState(0);
  const [yearStart, setYearStart] = useState(2020);
  const [yearEnd, setYearEnd] = useState(2026);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (sector !== 'All') params.set('entity_type', sector.toLowerCase());
    if (minDonation > 0) params.set('min_donation', minDonation.toString());
    params.set('year_from', yearStart.toString());
    params.set('year_to', yearEnd.toString());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    fetch(`${API_BASE}/influence/closed-loops?${params}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ClosedLoopResponse) => setData(d))
      .catch((e) => {
        if (e.name === 'AbortError') setError('Request timed out — the server may be under heavy load. Try narrowing filters.');
        else setError(e.message);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setLoading(false);
      });

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [sector, minDonation, yearStart, yearEnd]);

  const stats = data?.stats;
  const loops = data?.closed_loops || [];

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        <PoliticsSectorHeader />

        {/* Header */}
        <motion.div className="mb-8" {...fadeIn}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Closed-Loop Influence Detection
          </h1>
          <p className="text-white/50 max-w-2xl">
            Follow the money trail: companies lobby on issues, bills go through committees,
            politicians on those committees receive donations from those same companies.
          </p>
        </motion.div>

        {/* Filters */}
        <motion.div
          className="flex flex-wrap items-end gap-4 mb-8 rounded-xl bg-white/[0.03] border border-white/10 p-4"
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <div className="flex items-center gap-1.5 text-white/40 text-sm">
            <Filter className="w-4 h-4" />
            Filters
          </div>

          {/* Sector */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/30 font-mono uppercase tracking-wider">Sector</label>
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
              {SECTORS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSector(s)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    sector === s
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Min donation */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/30 font-mono uppercase tracking-wider">
              Min Donation: {formatCurrency(minDonation)}
            </label>
            <input
              type="range"
              min={0}
              max={500000}
              step={5000}
              value={minDonation}
              onChange={(e) => setMinDonation(Number(e.target.value))}
              className="w-40 accent-blue-500"
            />
          </div>

          {/* Year range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/30 font-mono uppercase tracking-wider">Year Range</label>
            <div className="flex items-center gap-2">
              <select
                value={yearStart}
                onChange={(e) => setYearStart(Number(e.target.value))}
                className="bg-white/5 border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500/50"
              >
                {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => (
                  <option key={y} value={y} className="bg-zinc-900">{y}</option>
                ))}
              </select>
              <span className="text-white/30">to</span>
              <select
                value={yearEnd}
                onChange={(e) => setYearEnd(Number(e.target.value))}
                className="bg-white/5 border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500/50"
              >
                {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => (
                  <option key={y} value={y} className="bg-zinc-900">{y}</option>
                ))}
              </select>
            </div>
          </div>

          {loops.length > 0 && (
            <span className="text-white/30 text-sm ml-auto">
              {loops.length.toLocaleString()} loops found
            </span>
          )}
        </motion.div>

        {/* Stats Summary */}
        {stats && !loading && (
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8"
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            {[
              { label: 'Total Loops', value: stats.total_loops_found.toLocaleString(), icon: AlertCircle },
              { label: 'Companies', value: stats.unique_companies.toLocaleString(), icon: Building2 },
              { label: 'Politicians', value: stats.unique_politicians.toLocaleString(), icon: User },
              { label: 'Lobbying $', value: formatCurrency(stats.total_lobbying_spend), icon: DollarSign },
              { label: 'Donations $', value: formatCurrency(stats.total_donations), icon: DollarSign },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-white/[0.03] border border-white/10 p-4 flex flex-col items-center text-center"
              >
                <stat.icon className="w-5 h-5 text-blue-400 mb-2" />
                <span className="text-xl font-bold text-white font-mono">{stat.value}</span>
                <span className="text-xs text-white/40 mt-1">{stat.label}</span>
              </div>
            ))}
          </motion.div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-white/30">Analyzing influence chains across lobbying, bills, committees, and donations...</p>
            <p className="text-xs text-white/20">This may take up to 30 seconds.</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center py-20 text-white/30">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Failed to load influence loops.</p>
            <p className="text-sm mt-2 text-white/20">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && loops.length === 0 && (
          <div className="text-center py-20 text-white/30">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No closed loops found.</p>
            <p className="text-sm mt-2">
              Try adjusting filters or check back after influence data is synced.
            </p>
          </div>
        )}

        {/* Loop Cards */}
        {!loading && !error && loops.length > 0 && (
          <div className="space-y-4">
            {loops.map((loop, i) => (
              <motion.div
                key={`${loop.company.entity_id}-${loop.bill.bill_id}-${loop.politician.person_id}-${i}`}
                className="rounded-xl bg-white/[0.03] border border-white/10 p-5 hover:bg-white/[0.05] transition-colors"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.6) }}
              >
                {/* Sector badge */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {loop.company.entity_type}
                  </span>
                </div>

                {/* Chain visualization */}
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2 lg:gap-0">
                  {/* Company */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <Building2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-white">{loop.company.display_name}</span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-white/20 shrink-0 mx-1 hidden lg:block" />
                  <ArrowRight className="w-4 h-4 text-white/20 shrink-0 ml-4 lg:hidden" />

                  {/* Lobbied */}
                  <div className="flex items-center gap-2 shrink-0 lg:ml-0 ml-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <DollarSign className="w-4 h-4 text-yellow-400" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm text-white/70">
                        Lobbied <span className="font-mono text-yellow-400">{formatCurrency(loop.lobbying.total_income)}</span>
                      </span>
                      {loop.lobbying.issue_codes && (
                        <span className="text-xs text-white/30 truncate max-w-[200px]">
                          {loop.lobbying.issue_codes.split(', ').slice(0, 3).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-white/20 shrink-0 mx-1 hidden lg:block" />
                  <ArrowRight className="w-4 h-4 text-white/20 shrink-0 ml-4 lg:hidden" />

                  {/* Bill */}
                  <div className="flex items-center gap-2 shrink-0 min-w-0 lg:ml-0 ml-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20">
                      <FileText className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-white/70 truncate max-w-[180px]" title={loop.bill.title}>
                        {loop.bill.title}
                      </span>
                      <span className="text-xs text-white/30">{loop.bill.status}</span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-white/20 shrink-0 mx-1 hidden lg:block" />
                  <ArrowRight className="w-4 h-4 text-white/20 shrink-0 ml-4 lg:hidden" />

                  {/* Committee */}
                  <div className="flex items-center gap-2 shrink-0 lg:ml-0 ml-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20">
                      <Users className="w-4 h-4 text-orange-400" />
                    </div>
                    <span className="text-sm text-white/70 truncate max-w-[160px]" title={loop.committee.name}>
                      {loop.committee.name}
                    </span>
                  </div>

                  <ChevronRight className="w-4 h-4 text-white/20 shrink-0 mx-1 hidden lg:block" />
                  <ArrowRight className="w-4 h-4 text-white/20 shrink-0 ml-4 lg:hidden" />

                  {/* Politician */}
                  <div className="flex items-center gap-2 shrink-0 lg:ml-0 ml-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <User className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex flex-col">
                      <Link
                        to={`/politics/people/${loop.politician.person_id}`}
                        className="text-sm font-medium text-blue-400 hover:text-blue-300 no-underline"
                      >
                        {loop.politician.display_name}
                      </Link>
                      <span className="text-xs text-white/30">
                        <span className={loop.politician.party === 'D' ? 'text-blue-400' : loop.politician.party === 'R' ? 'text-red-400' : 'text-white/40'}>
                          ({loop.politician.party})
                        </span>
                        {' '}{loop.politician.committee_role}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-white/20 shrink-0 mx-1 hidden lg:block" />
                  <ArrowRight className="w-4 h-4 text-white/20 shrink-0 ml-4 lg:hidden" />

                  {/* Donation */}
                  <div className="flex items-center gap-2 shrink-0 lg:ml-0 ml-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20">
                      <DollarSign className="w-4 h-4 text-red-400" />
                    </div>
                    <span className="text-sm font-mono font-semibold text-red-400">
                      {formatCurrency(loop.donation.total_amount)}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
