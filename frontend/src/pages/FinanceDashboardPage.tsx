import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, FileText, AlertTriangle, ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import SpotlightCard from '../components/SpotlightCard';
import FinanceNav from '../components/FinanceNav';
import {
  getFinanceDashboardStats,
  getInstitutions,
  type FinanceDashboardStats,
  type InstitutionListItem,
} from '../api/finance';

// ── Helpers ──

function formatLargeNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const SECTOR_COLORS: Record<string, string> = {
  bank: '#60A5FA',
  investment: '#C084FC',
  insurance: '#FBBF24',
  fintech: '#34D399',
  central_bank: '#F87171',
};

const SECTOR_LABELS: Record<string, string> = {
  bank: 'BANK',
  investment: 'INVESTMENT',
  insurance: 'INSURANCE',
  fintech: 'FINTECH',
  central_bank: 'CENTRAL BANK',
};

// ── Stat Card ──

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  delay,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent?: 'mint' | 'pink';
  delay: number;
}) {
  return (
    <SpotlightCard
      className="group rounded-xl border border-white/10 bg-white/[0.03] transition-all duration-300 hover:border-white/20 animate-scale-in"
      spotlightColor={accent === 'pink' ? 'rgba(255, 51, 102, 0.10)' : 'rgba(52, 211, 153, 0.10)'}
    >
    <div className="relative p-6">
      {/* Left accent bar */}
      <div
        className={`absolute left-0 top-0 h-full w-[3px] transition-opacity duration-300 opacity-0 group-hover:opacity-100 ${
          accent === 'pink' ? 'bg-[#FF3366]' : 'bg-[#34D399]'
        }`}
      />
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-xs tracking-wider text-white/40 uppercase">
          {label}
        </span>
        <Icon
          size={20}
          className={accent === 'pink' ? 'text-[#FF3366]' : 'text-white/20'}
        />
      </div>
      <span
        className={`font-mono text-4xl font-bold tracking-tight ${
          accent === 'pink' ? 'text-[#FF3366]' : 'text-white'
        }`}
      >
        {value}
      </span>
    </div>
    </SpotlightCard>
  );
}

// ── Institution Card (matches InstitutionDirectoryPage) ──

function InstitutionCard({
  inst,
  delay,
}: {
  inst: InstitutionListItem;
  delay: number;
}) {
  const color = SECTOR_COLORS[inst.sector_type] || '#34D399';

  return (
    <Link
      to={`/finance/${inst.institution_id}`}
      className="block no-underline h-full animate-fade-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <SpotlightCard
        className="rounded-xl border border-white/10 bg-white/[0.03] h-full"
        spotlightColor="rgba(52, 211, 153, 0.10)"
      >
        <div className="relative flex h-full flex-col p-6 overflow-hidden">
          {/* Top row: logo + sector tag */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#111111] border border-white/5">
              {inst.logo_url ? (
                <img
                  src={inst.logo_url}
                  alt={inst.display_name}
                  className="h-8 w-8 rounded object-contain"
                />
              ) : (
                <Building2 size={20} className="text-white/20" />
              )}
            </div>
            <span
              className="rounded border px-2 py-1 font-mono text-xs"
              style={{
                borderColor: `${color}50`,
                color: color,
                backgroundColor: `${color}15`,
              }}
            >
              {SECTOR_LABELS[inst.sector_type] || inst.sector_type.toUpperCase()}
            </span>
          </div>

          {/* Name + ticker */}
          <h3 className="font-body text-xl font-bold text-white line-clamp-1 mb-1">
            {inst.display_name}
          </h3>
          {inst.ticker && (
            <p className="font-mono text-sm text-white/40 mb-2">{inst.ticker}</p>
          )}

          {/* HQ */}
          {inst.headquarters && (
            <div className="flex items-center gap-1.5 mb-4">
              <MapPin size={14} className="text-white/30 flex-shrink-0" />
              <span className="font-body text-sm text-white/50 truncate">
                {inst.headquarters}
              </span>
            </div>
          )}

          {/* Spacer pushes stats to bottom */}
          <div className="mt-auto" />

          {/* Stats footer */}
          <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
            <div>
              <p className="font-mono text-xs text-white/40 mb-1">FILINGS</p>
              <p className="font-mono text-lg text-white">
                {inst.filing_count.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="font-mono text-xs text-white/40 mb-1">COMPLAINTS</p>
              <p className="font-mono text-lg text-[#FF3366]">
                {inst.complaint_count.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </SpotlightCard>
    </Link>
  );
}

const DASHBOARD_CARD_LIMIT = 20;

// ── Page ──

export default function FinanceDashboardPage() {
  const [stats, setStats] = useState<FinanceDashboardStats | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getFinanceDashboardStats(),
      getInstitutions({ limit: 50 }),
    ])
      .then(([statsRes, instRes]) => {
        setStats(statsRes);
        setInstitutions(instRes.institutions || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Back button */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-body text-sm text-white/50 hover:text-white transition-colors no-underline mb-4 animate-fade-up"
        >
          <ArrowLeft size={16} />
          Back to Sectors
        </Link>

        {/* Header */}
        <div className="flex items-end justify-between mb-6 animate-fade-up">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
              Finance
            </h1>
            <p className="mt-1 font-body text-lg text-white/50">
              Aggregate metrics across all tracked US financial entities
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="font-mono text-[11px] text-white/30">
              LAST SYNC: <span className="text-white/50">JUST NOW</span>
            </p>
            <p className="font-mono text-[11px] text-white/30">
              STATUS: <span className="text-[#34D399]">ONLINE</span>
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <FinanceNav />

        {/* Aggregate Stats */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-10">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-10">
            <StatCard
              label="Tracked Entities"
              value={stats.total_institutions.toLocaleString()}
              icon={Building2}
              delay={400}
            />
            <StatCard
              label="SEC Filings (YTD)"
              value={formatLargeNum(stats.total_filings)}
              icon={FileText}
              delay={500}
            />
            <StatCard
              label="CFPB Complaints"
              value={formatLargeNum(stats.total_complaints)}
              icon={AlertTriangle}
              accent="pink"
              delay={600}
            />
          </div>
        ) : null}

        {/* Tracked Institutions */}
        <h2 className="font-heading text-base font-bold uppercase tracking-wider text-white mb-5 animate-fade-up"
          style={{ animationDelay: '700ms' }}
        >
          Tracked Institutions
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-56 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {institutions.slice(0, DASHBOARD_CARD_LIMIT).map((inst, idx) => (
                <InstitutionCard
                  key={inst.institution_id}
                  inst={inst}
                  delay={750 + idx * 50}
                />
              ))}
            </div>
            {institutions.length > DASHBOARD_CARD_LIMIT && (
              <div className="flex justify-center mt-8 animate-fade-up" style={{ animationDelay: '1200ms' }}>
                <Link
                  to="/finance/institutions"
                  className="group flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-8 py-3 font-body text-sm font-semibold text-white/50 transition-all hover:border-[#34D399]/50 hover:text-[#34D399] no-underline"
                >
                  See all {institutions.length} institutions
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
