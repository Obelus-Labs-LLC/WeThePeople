import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Search, AlertTriangle, FlaskConical,
} from 'lucide-react';
import { HealthSectorHeader } from '../components/SectorHeader';
import CompanyLogo from '../components/CompanyLogo';
import { getLogoUrl } from '../utils/logos';
import {
  getHealthCompanies,
  type CompanyListItem,
} from '../api/health';
import { LOCAL_LOGOS } from '../data/healthLogos';

function companyLogoUrl(c: { company_id: string; logo_url?: string | null; display_name: string }): string {
  return getLogoUrl(c.company_id, c.logo_url, LOCAL_LOGOS);
}

const SECTOR_COLORS: Record<string, string> = {
  pharma: '#DC2626',
  insurer: '#3B82F6',
  biotech: '#10B981',
  pharmacy: '#F59E0B',
  distributor: '#64748B',
};

const SECTOR_LABELS: Record<string, string> = {
  pharma: 'PHARMA',
  insurer: 'INSURER',
  biotech: 'BIOTECH',
  pharmacy: 'PHARMACY',
  distributor: 'DISTRIBUTOR',
};

const SECTOR_TYPES = ['all', 'pharma', 'biotech', 'insurer', 'pharmacy', 'distributor'];

export default function HealthCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    getHealthCompanies({ limit: 200 })
      .then((res) => setCompanies(res.companies || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = companies.filter((c) => {
    if (sectorFilter !== 'all' && c.sector_type !== sectorFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.display_name.toLowerCase().includes(q) ||
        (c.ticker && c.ticker.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10 mx-auto max-w-[1400px] px-8 py-8 md:px-12 md:py-10">
        <HealthSectorHeader />

        {/* Header */}
        <div className="flex items-end justify-between pb-6 mb-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div>
            <h1 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0' }}>
              Companies
            </h1>
            <p className="text-sm mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8' }}>
              {filtered.length} of {companies.length} tracked healthcare entities
            </p>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Search by name or ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border py-3 pl-11 pr-4 text-sm outline-none transition-colors"
              style={{
                background: 'rgba(255,255,255,0.06)',
                borderColor: 'rgba(255,255,255,0.1)',
                fontFamily: "'JetBrains Mono', monospace",
                color: '#E2E8F0',
              }}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {SECTOR_TYPES.map((s) => {
              const isActive = sectorFilter === s;
              const color = s === 'all' ? '#0F172A' : SECTOR_COLORS[s] || '#64748B';
              return (
                <button
                  key={s}
                  onClick={() => setSectorFilter(s)}
                  className="rounded-lg border px-4 py-2 text-xs font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer transition-colors"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    background: isActive ? color : 'rgba(255,255,255,0.06)',
                    borderColor: isActive ? color : 'rgba(255,255,255,0.1)',
                    color: isActive ? '#FFFFFF' : '#94A3B8',
                  }}
                >
                  {s === 'all' ? 'ALL' : SECTOR_LABELS[s] || s.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DC2626] border-t-transparent" />
          </div>
        ) : (
          /* Company Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((c, idx) => {
              const sectorColor = SECTOR_COLORS[c.sector_type] || '#64748B';
              return (
                <div
                  key={c.company_id}
                  onClick={() => navigate(`/health/${c.company_id}`)}
                  className="flex flex-col rounded-xl border p-5 cursor-pointer transition-all hover:border-white/20"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    opacity: 0,
                    animation: `card-enter 0.4s ease-out ${idx * 0.03}s forwards`,
                  }}
                >
                  {/* Top: Logo + Sector */}
                  <div className="flex items-start justify-between mb-3">
                    <CompanyLogo
                      id={c.company_id}
                      name={c.display_name}
                      logoUrl={c.logo_url}
                      localLogos={LOCAL_LOGOS}
                      size={40}
                      iconFallback
                    />
                    <span
                      className="rounded border px-2 py-0.5 text-xs font-bold uppercase"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        background: `${sectorColor}10`,
                        borderColor: `${sectorColor}30`,
                        color: sectorColor,
                      }}
                    >
                      {SECTOR_LABELS[c.sector_type] || c.sector_type}
                    </span>
                  </div>

                  {/* Name + Ticker */}
                  <h3 className="text-base font-bold leading-tight truncate mb-0.5" style={{ fontFamily: "'Syne', sans-serif", color: '#E2E8F0' }}>
                    {c.display_name}
                  </h3>
                  {c.ticker && (
                    <span
                      className="text-xs mb-3"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8' }}
                    >
                      {c.ticker}
                    </span>
                  )}

                  {/* Stats */}
                  <div className="mt-auto grid grid-cols-3 gap-2 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8' }}>ADVERSE EFFECTS</p>
                      <p className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#DC2626' }}>
                        {c.adverse_event_count.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8' }}>RECALLS</p>
                      <p className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: c.recall_count > 0 ? '#991B1B' : '#94A3B8' }}>
                        {c.recall_count}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8' }}>TRIALS</p>
                      <p className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#0F172A' }}>
                        {c.trial_count}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <Search size={48} style={{ color: '#E2E8F0' }} className="mb-4" />
            <p className="text-sm" style={{ color: '#94A3B8' }}>No companies match your search.</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes card-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
