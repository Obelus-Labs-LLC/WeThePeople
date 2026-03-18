import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building, DollarSign, FileText, Shield, FlaskConical, Stethoscope,
  Search, Building2,
  type LucideIcon,
} from 'lucide-react';
import { HealthSectorHeader } from '../components/SectorHeader';
import LightRays from '../components/LightRays';
import {
  getHealthDashboardStats,
  getHealthCompanies,
  type HealthDashboardStats,
  type CompanyListItem,
} from '../api/health';
import { fmtNum } from '../utils/format';
import { LOCAL_LOGOS } from '../data/healthLogos';

function companyLogoUrl(c: { company_id: string; logo_url?: string | null; display_name: string }): string {
  if (LOCAL_LOGOS.has(c.company_id)) return `/logos/${c.company_id}.png`;
  if (c.logo_url) return c.logo_url;
  return '';
}

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ── Design Tokens ──

const SECTOR_COLORS: Record<string, string> = {
  pharma: '#DC2626',
  insurer: '#3B82F6',
  biotech: '#10B981',
  pharmacy: '#F59E0B',
  distributor: '#64748B',
};

const SECTOR_LABELS: Record<string, string> = {
  pharma: 'Pharma',
  insurer: 'Insurers',
  biotech: 'Biotech',
  pharmacy: 'Pharmacy',
  distributor: 'Distributors',
};

// ── Vitals Card ──

function VitalCard({
  title,
  value,
  icon: Icon,
  critical,
  blue,
  delay,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  critical?: boolean;
  blue?: boolean;
  delay: number;
}) {
  const borderColor = critical ? '#DC2626' : blue ? '#3B82F6' : '#3B82F6';
  const iconColor = critical ? '#DC2626' : blue ? '#3B82F6' : '#3B82F6';

  return (
    <div
      className="flex flex-col bg-white/[0.05] backdrop-blur-sm p-5 rounded-r-lg border border-white/10"
      style={{
        borderLeft: `4px solid ${borderColor}`,
        opacity: 0,
        transform: 'translateX(-20px)',
        animation: `vitals-enter 0.5s ease-out ${delay}s forwards`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg font-semibold text-white/70" style={{ fontFamily: "'Syne', sans-serif" }}>
          {title}
        </span>
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <span className="text-5xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </span>
    </div>
  );
}

// ── Sector Breakdown Bar ──

function SectorBreakdown({ bySector }: { bySector: Record<string, number> }) {
  const total = Object.values(bySector).reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  const segments = Object.entries(bySector)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({
      key,
      label: SECTOR_LABELS[key] || key,
      color: SECTOR_COLORS[key] || '#94A3B8',
      pct: (count / total) * 100,
      count,
    }));

  return (
    <div className="bg-white/[0.05] backdrop-blur-sm rounded-xl border border-white/10 p-6 shrink-0">
      <h3 className="text-sm font-bold uppercase mb-6 text-white/50" style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
        SECTOR DISTRIBUTION
      </h3>
      <div className="w-full h-8 rounded-full overflow-hidden flex bg-white/[0.05]">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className="relative h-full flex items-center justify-center group"
            style={{ width: `${seg.pct}%`, background: seg.color, minWidth: seg.pct > 8 ? undefined : '0px' }}
          >
            {seg.pct > 10 && (
              <span className="text-xs font-bold text-white px-3 truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {seg.label}
              </span>
            )}
            <div
              className="absolute top-10 left-1/2 -translate-x-1/2 z-10 hidden group-hover:block rounded px-2 py-1 whitespace-nowrap"
              style={{ background: '#0F172A', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#FFFFFF' }}
            >
              {seg.label}: {seg.count} ({seg.pct.toFixed(1)}%)
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
        <span>0% COVERAGE</span>
        <span>100% COVERAGE</span>
      </div>
    </div>
  );
}

// ── Company List Table (politics-first columns) ──

function CompanyTable({ companies, navigate }: { companies: CompanyListItem[]; navigate: (path: string) => void }) {
  return (
    <div className="bg-white/[0.05] backdrop-blur-sm rounded-xl border border-white/10 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0 bg-white/[0.03]">
        <h3 className="text-sm font-bold uppercase text-white/50" style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
          COMPANY REGISTRY
        </h3>
        <Link to="/health/companies" className="text-white/40 hover:text-[#DC2626] transition-colors">
          <Search size={16} />
        </Link>
      </div>

      <div style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[rgba(10,10,15,0.9)] backdrop-blur-sm" style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.1)' }}>
            <tr>
              {['COMPANY', 'SECTOR', 'TRIALS', 'PAYMENTS'].map((h, i) => (
                <th
                  key={h}
                  className={`p-3 font-medium text-white/40 ${i >= 2 ? 'text-right' : 'text-left'}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.map((c, idx) => (
              <tr
                key={c.company_id}
                className="cursor-pointer transition-colors hover:bg-white/[0.05]"
                onClick={() => navigate(`/health/${c.company_id}`)}
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  opacity: 0,
                  animation: `row-fade 0.3s ease-out ${idx * 0.05}s forwards`,
                }}
              >
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded border border-white/10 bg-white/[0.05] flex items-center justify-center shrink-0 p-1">
                      {companyLogoUrl(c) ? (
                        <img src={companyLogoUrl(c)} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <Building2 size={16} className="text-white/30" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate text-white" style={{ fontFamily: "'Syne', sans-serif" }}>
                        {c.display_name}
                      </p>
                      {c.ticker && (
                        <span className="inline-block mt-0.5 rounded px-2 py-0.5 text-xs bg-white/[0.05] text-white/50" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {c.ticker}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <span className="text-xs font-medium uppercase" style={{ fontFamily: "'JetBrains Mono', monospace", color: SECTOR_COLORS[c.sector_type] || '#64748B' }}>
                    {SECTOR_LABELS[c.sector_type] || c.sector_type}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <span className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#3B82F6' }}>
                    {c.trial_count?.toLocaleString() || '0'}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <span className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#F59E0B' }}>
                    {c.payment_count?.toLocaleString() || '0'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──

export default function HealthDashboardPage() {
  const [stats, setStats] = useState<HealthDashboardStats | null>(null);
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      getHealthDashboardStats(),
      getHealthCompanies({ limit: 100 }),
    ])
      .then(([statsRes, compRes]) => {
        setStats(statsRes);
        setCompanies(compRes.companies || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DC2626] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <LightRays
          raysOrigin="top-center"
          raysColor="#ff0000"
          raysSpeed={1}
          lightSpread={2}
          rayLength={3}
          pulsating
          fadeDistance={2}
          saturation={1}
          followMouse
          mouseInfluence={0.1}
          noiseAmount={0.3}
          distortion={0}
        />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[1600px] flex flex-col px-8 py-8 md:px-12 md:py-10">
        <HealthSectorHeader />

        {/* Header */}
        <div className="flex items-end justify-between pb-6 mb-8 shrink-0 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="relative flex h-[6px] w-[6px]">
                <span className="absolute inline-flex h-full w-full rounded-sm animate-ping" style={{ background: '#DC2626', opacity: 0.75 }} />
                <span className="relative inline-flex h-[6px] w-[6px] rounded-sm" style={{ background: '#DC2626' }} />
              </span>
              <span className="text-sm uppercase text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.2em' }}>
                HEALTH SECTOR MONITORING
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>
              Health
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8' }}>
              How the healthcare industry influences policy — lobbying, government contracts, enforcement, and clinical pipeline data.
            </p>
          </div>
          <span className="hidden md:block text-sm text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-4 flex flex-col gap-6 pr-2">
            {stats && (
              <>
                {/* Political data first */}
                <VitalCard title="Lobbying Spend" value={formatMoney(stats.total_lobbying_spend || 0)} icon={DollarSign} blue delay={0} />
                <VitalCard title="Gov Contracts" value={formatMoney(stats.total_contract_value || 0)} icon={FileText} blue delay={0.1} />
                <VitalCard title="Enforcement Actions" value={fmtNum(stats.total_enforcement || 0)} icon={Shield} critical delay={0.2} />
                {/* Unique features kept */}
                <VitalCard title="Clinical Trials" value={fmtNum(stats.total_trials)} icon={FlaskConical} delay={0.3} />
                <VitalCard title="Physician Payments" value={fmtNum(stats.total_payments)} icon={Stethoscope} delay={0.4} />
                <VitalCard title="Tracked Companies" value={fmtNum(stats.total_companies)} icon={Building} delay={0.5} />
              </>
            )}
          </div>

          <div className="col-span-12 md:col-span-8 flex flex-col gap-6">
            {stats && <SectorBreakdown bySector={stats.by_sector} />}
            <CompanyTable companies={companies} navigate={navigate} />
          </div>
        </div>

        {/* Data Sources */}
        <div className="border-t border-white/10 pt-6 mt-8">
          <span className="font-mono text-xs font-bold tracking-[0.2em] uppercase text-white/30">Data Sources</span>
          <div className="flex flex-wrap gap-x-8 gap-y-3 mt-4">
            {['Senate LDA (Lobbying)', 'USASpending (Contracts)', 'FDA Enforcement', 'OpenFDA', 'ClinicalTrials.gov', 'CMS Open Payments', 'SEC EDGAR'].map((source) => (
              <div key={source} className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
                <span className="w-1.5 h-1.5 rounded-sm bg-zinc-600" />
                <span className="font-mono text-xs font-semibold tracking-wider uppercase text-zinc-300">{source}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes vitals-enter {
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes row-fade {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
