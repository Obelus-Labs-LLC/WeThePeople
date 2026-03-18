import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, DollarSign, FileText, Shield, AlertTriangle, TrendingUp, ArrowRight, MapPin, type LucideIcon } from 'lucide-react';
import SpotlightCard from '../components/SpotlightCard';
import { FinanceSectorHeader } from '../components/SectorHeader';
import { LOCAL_LOGOS } from '../data/financeLogos';
import {
  getFinanceDashboardStats,
  getInstitutions,
  type FinanceDashboardStats,
  type InstitutionListItem,
} from '../api/finance';

// ── Helpers ──

function instLogoUrl(inst: { institution_id: string; logo_url?: string | null; display_name: string }): string {
  if (LOCAL_LOGOS.has(inst.institution_id)) return `/logos/${inst.institution_id}.png`;
  if (inst.logo_url) return inst.logo_url;
  return '';
}

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatNum(n: number): string {
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
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: 'mint' | 'pink' | 'blue' | 'amber';
}) {
  const colors: Record<string, { spot: `rgba(${number}, ${number}, ${number}, ${number})`; bar: string; text: string; icon: string }> = {
    mint: { spot: 'rgba(52, 211, 153, 0.10)', bar: 'bg-[#34D399]', text: 'text-white', icon: 'text-white/20' },
    pink: { spot: 'rgba(255, 51, 102, 0.10)', bar: 'bg-[#FF3366]', text: 'text-[#FF3366]', icon: 'text-[#FF3366]' },
    blue: { spot: 'rgba(96, 165, 250, 0.10)', bar: 'bg-blue-400', text: 'text-blue-400', icon: 'text-blue-400' },
    amber: { spot: 'rgba(251, 191, 36, 0.10)', bar: 'bg-amber-400', text: 'text-amber-400', icon: 'text-amber-400' },
  };
  const c = colors[accent || 'mint'];

  return (
    <SpotlightCard
      className="group rounded-xl border border-white/10 bg-white/[0.03] transition-all duration-300 hover:border-white/20 animate-scale-in"
      spotlightColor={c.spot}
    >
      <div className="relative p-6">
        <div className={`absolute left-0 top-0 h-full w-[3px] transition-opacity duration-300 opacity-0 group-hover:opacity-100 ${c.bar}`} />
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-xs tracking-wider text-white/40 uppercase">{label}</span>
          <Icon size={20} className={c.icon} />
        </div>
        <span className={`font-mono text-4xl font-bold tracking-tight ${c.text}`}>{value}</span>
      </div>
    </SpotlightCard>
  );
}

// ── Institution Card ──

function InstitutionCard({ inst, delay }: { inst: InstitutionListItem; delay: number }) {
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
          <div className="flex items-start justify-between mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#111111] border border-white/5">
              {instLogoUrl(inst) ? (
                <img src={instLogoUrl(inst)} alt={inst.display_name} className="h-8 w-8 rounded object-contain" />
              ) : (
                <Building2 size={20} className="text-white/20" />
              )}
            </div>
            <span
              className="rounded border px-2 py-1 font-mono text-xs"
              style={{ borderColor: `${color}50`, color, backgroundColor: `${color}15` }}
            >
              {SECTOR_LABELS[inst.sector_type] || inst.sector_type.toUpperCase()}
            </span>
          </div>

          <h3 className="font-body text-xl font-bold text-white line-clamp-1 mb-1">{inst.display_name}</h3>
          {inst.ticker && <p className="font-mono text-sm text-white/40 mb-2">{inst.ticker}</p>}
          {inst.headquarters && (
            <div className="flex items-center gap-1.5 mb-4">
              <MapPin size={14} className="text-white/30 flex-shrink-0" />
              <span className="font-body text-sm text-white/50 truncate">{inst.headquarters}</span>
            </div>
          )}

          <div className="mt-auto" />

          {/* Politics-first stats footer */}
          <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
            <div>
              <p className="font-mono text-xs text-white/40 mb-1">LOBBYING</p>
              <p className="font-mono text-sm text-blue-400">{formatNum(inst.filing_count)}</p>
            </div>
            <div>
              <p className="font-mono text-xs text-white/40 mb-1">ENFORCEMENT</p>
              <p className="font-mono text-sm text-[#FF3366]">{formatNum(inst.complaint_count)}</p>
            </div>
            <div>
              <p className="font-mono text-xs text-white/40 mb-1">COMPLAINTS</p>
              <p className="font-mono text-sm text-amber-400">{formatNum(inst.complaint_count)}</p>
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
        <FinanceSectorHeader />

        {/* Header */}
        <div className="flex items-end justify-between mb-6 animate-fade-up">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
              Finance
            </h1>
            <p className="mt-1 font-body text-lg text-white/50">
              How the financial industry shapes policy — lobbying, government contracts, enforcement, and insider trading
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

        {/* Hero Stats — Political data first */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-10">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-10">
            <StatCard
              label="Lobbying Spend"
              value={formatMoney(stats.total_lobbying_spend || 0)}
              icon={DollarSign}
              accent="blue"
            />
            <StatCard
              label="Gov Contracts"
              value={formatMoney(stats.total_contract_value || 0)}
              icon={FileText}
              accent="mint"
            />
            <StatCard
              label="Enforcement Actions"
              value={formatNum(stats.total_enforcement || 0)}
              icon={Shield}
              accent="pink"
            />
            <StatCard
              label="Insider Trade Alerts"
              value={formatNum(stats.total_insider_trades || 0)}
              icon={TrendingUp}
              accent="amber"
            />
          </div>
        ) : null}

        {/* Secondary stats row */}
        {stats && (
          <div className="flex flex-wrap gap-6 mb-10 text-center">
            {[
              { label: 'Tracked Entities', value: stats.total_institutions.toLocaleString() },
              { label: 'SEC Filings', value: formatNum(stats.total_filings) },
              { label: 'CFPB Complaints', value: formatNum(stats.total_complaints) },
              { label: 'Total Penalties', value: formatMoney(stats.total_penalties || 0) },
            ].map((s) => (
              <div key={s.label} className="bg-white/[0.02] border border-white/5 rounded-lg px-5 py-3">
                <div className="font-mono text-lg font-bold text-white/70">{s.value}</div>
                <div className="font-mono text-[10px] text-white/30 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        )}

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
                <InstitutionCard key={inst.institution_id} inst={inst} delay={750 + idx * 50} />
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

        {/* Data Sources */}
        <div className="border-t border-white/10 pt-6 mt-8">
          <span className="font-mono text-xs font-bold tracking-[0.2em] uppercase text-white/30">Data Sources</span>
          <div className="flex flex-wrap gap-x-8 gap-y-3 mt-4">
            {['Senate LDA (Lobbying)', 'USASpending (Contracts)', 'CFPB Enforcement', 'SEC EDGAR', 'FDIC BankFind', 'CFPB Complaints', 'Yahoo Finance'].map((source) => (
              <div key={source} className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
                <span className="w-1.5 h-1.5 rounded-sm bg-zinc-600" />
                <span className="font-mono text-xs font-semibold tracking-wider uppercase text-zinc-300">{source}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
