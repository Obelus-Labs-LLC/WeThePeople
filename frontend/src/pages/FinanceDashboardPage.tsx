import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, FileText, AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import SpotlightCard from '../components/SpotlightCard';
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
      className="group rounded-xl border border-white/5 bg-card transition-all duration-300 hover:border-white/10 animate-scale-in"
      spotlightColor={accent === 'pink' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(52, 211, 153, 0.15)'}
    >
    <div
      className="relative p-6"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Left accent bar */}
      <div
        className={`absolute left-0 top-0 h-full w-[3px] transition-opacity duration-300 opacity-0 group-hover:opacity-100 ${
          accent === 'pink' ? 'bg-pink' : 'bg-mint'
        }`}
      />
      <div className="flex items-center justify-between mb-4">
        <span className="font-heading text-xs font-semibold tracking-wider text-text-secondary uppercase">
          {label}
        </span>
        <Icon
          size={20}
          className={accent === 'pink' ? 'text-pink' : 'text-text-muted'}
        />
      </div>
      <span
        className={`font-mono text-4xl font-bold tracking-tight ${
          accent === 'pink' ? 'text-pink' : 'text-text-primary'
        }`}
      >
        {value}
      </span>
    </div>
    </SpotlightCard>
  );
}

// ── Institution Card ──

function InstitutionCard({
  inst,
  delay,
}: {
  inst: InstitutionListItem;
  delay: number;
}) {
  return (
    <SpotlightCard
      className="rounded-xl border border-white/10 bg-white/[0.03] transition-all duration-300 hover:border-mint/50 animate-fade-up"
      spotlightColor="rgba(52, 211, 153, 0.15)"
    >
    <Link
      to={`/finance/${inst.institution_id}`}
      className="group block p-5 cursor-pointer no-underline"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top row: logo + ticker */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
          {inst.logo_url ? (
            <img
              src={inst.logo_url}
              alt={inst.display_name}
              className="h-8 w-8 rounded object-contain"
            />
          ) : (
            <Building2 size={20} className="text-text-muted" />
          )}
        </div>
        {inst.ticker && (
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-mint tracking-wide">
            {inst.ticker}
          </span>
        )}
      </div>

      {/* Name + sector */}
      <h3 className="font-body text-sm font-semibold text-text-primary mb-0.5 truncate">
        {inst.display_name}
      </h3>
      <p className="font-heading text-[10px] font-semibold tracking-wider text-text-muted uppercase mb-4">
        {SECTOR_LABELS[inst.sector_type] || inst.sector_type.toUpperCase()}
      </p>

      {/* Divider */}
      <div className="h-px bg-white/5 mb-3" />

      {/* Stats row */}
      <div className="flex gap-6">
        <div>
          <span className="block font-heading text-[10px] font-semibold tracking-wider text-text-muted uppercase">
            Filings
          </span>
          <span className="font-mono text-sm font-semibold text-text-primary">
            {inst.filing_count.toLocaleString()}
          </span>
        </div>
        <div>
          <span className="block font-heading text-[10px] font-semibold tracking-wider text-text-muted uppercase">
            Complaints
          </span>
          <span className="font-mono text-sm font-semibold text-pink">
            {inst.complaint_count.toLocaleString()}
          </span>
        </div>
      </div>
    </Link>
    </SpotlightCard>
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
    <div className="min-h-screen bg-deep-black">
      <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Back button */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-body text-sm font-medium text-text-secondary hover:text-white transition-colors no-underline mb-6 animate-fade-up"
        >
          <ArrowLeft size={16} />
          Back to Sectors
        </Link>

        {/* Header */}
        <div className="flex items-end justify-between mb-10 animate-fade-up">
          <div>
            <h1 className="font-heading text-3xl font-bold uppercase tracking-wide text-mint lg:text-4xl">
              Dashboard
            </h1>
            <p className="mt-1 font-body text-sm text-text-secondary">
              Aggregate metrics across all tracked US financial entities
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="font-mono text-[11px] text-text-muted">
              LAST SYNC: <span className="text-text-secondary">JUST NOW</span>
            </p>
            <p className="font-mono text-[11px] text-text-muted">
              STATUS: <span className="text-mint">ONLINE</span>
            </p>
          </div>
        </div>

        {/* Aggregate Stats */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-12">
            <StatCard
              label="Tracked Entities"
              value={stats.total_institutions.toLocaleString()}
              icon={Building2}
              delay={600}
            />
            <StatCard
              label="SEC Filings (YTD)"
              value={formatLargeNum(stats.total_filings)}
              icon={FileText}
              delay={700}
            />
            <StatCard
              label="CFPB Complaints"
              value={formatLargeNum(stats.total_complaints)}
              icon={AlertTriangle}
              accent="pink"
              delay={800}
            />
          </div>
        ) : null}

        {/* Sub-dashboard links */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-10 animate-fade-up" style={{ animationDelay: '850ms' }}>
          <Link
            to="/finance/complaints"
            className="group rounded-xl border border-pink/30 bg-pink/5 p-4 transition-all hover:bg-pink/10 hover:border-pink/50 no-underline"
          >
            <p className="font-heading text-sm font-bold uppercase tracking-wider text-pink">Consumer Complaints</p>
            <p className="font-body text-xs text-text-muted mt-1">CFPB complaint feed & analytics</p>
          </Link>
          <Link
            to="/finance/insider-trades"
            className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06] hover:border-white/20 no-underline"
          >
            <p className="font-heading text-sm font-bold uppercase tracking-wider text-text-primary">Insider Trades</p>
            <p className="font-body text-xs text-text-muted mt-1">SEC Form 4 activity & macro data</p>
          </Link>
          <Link
            to="/finance/compare"
            className="group rounded-xl border border-mint/30 bg-mint/5 p-4 transition-all hover:bg-mint/10 hover:border-mint/50 no-underline"
          >
            <p className="font-heading text-sm font-bold uppercase tracking-wider text-mint">Compare</p>
            <p className="font-body text-xs text-text-muted mt-1">Cross-institution financial metrics</p>
          </Link>
        </div>

        {/* Tracked Institutions */}
        <h2 className="font-heading text-base font-bold uppercase tracking-wider text-text-primary mb-5 animate-fade-up"
          style={{ animationDelay: '900ms' }}
        >
          Tracked Institutions
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-44 rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {institutions.slice(0, DASHBOARD_CARD_LIMIT).map((inst, idx) => (
                <InstitutionCard
                  key={inst.institution_id}
                  inst={inst}
                  delay={950 + idx * 50}
                />
              ))}
            </div>
            {institutions.length > DASHBOARD_CARD_LIMIT && (
              <div className="flex justify-center mt-8 animate-fade-up" style={{ animationDelay: '1200ms' }}>
                <Link
                  to="/finance/institutions"
                  className="group flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-8 py-3 font-body text-sm font-semibold text-text-secondary transition-all hover:border-mint/50 hover:text-mint no-underline"
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
