import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Landmark, TrendingUp, Building2, Calendar, ExternalLink } from 'lucide-react';
import { TechSectorHeader } from '../components/SectorHeader';
import {
  ResearchToolLayout,
  ResearchSection,
  ResearchRowCard,
  ResearchEmptyState,
} from '../components/research/ResearchToolLayout';
import {
  getTechCompanies,
  getTechCompanyContracts,
  type TechContractItem,
} from '../api/tech';
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';
import SpendingChart from '../components/SpendingChart';

interface ContractWithCompany extends TechContractItem {
  company_id: string;
  company_name: string;
}

interface YearBucket {
  year: string;
  totalAmount: number;
  count: number;
}

interface CompanyContractStats {
  company_id: string;
  company_name: string;
  totalAmount: number;
  contractCount: number;
}

const BAR_COLORS = [
  'var(--color-ind)', 'var(--color-accent)', 'var(--color-green)', 'var(--color-dem)', 'var(--color-red)',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#A855F7',
];

export default function ContractTimelinePage() {
  const [allContracts, setAllContracts] = useState<ContractWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const compRes = await getTechCompanies({ limit: 200 });
        const comps = compRes.companies || [];
        if (cancelled) return;
        const results = await Promise.allSettled(
          comps.map((c) =>
            getTechCompanyContracts(c.company_id, { limit: 100 }).then((r) =>
              (r.contracts || []).map((ct) => ({ ...ct, company_id: c.company_id, company_name: c.display_name })),
            ),
          ),
        );
        if (cancelled) return;
        const combined: ContractWithCompany[] = [];
        for (const result of results) if (result.status === 'fulfilled') combined.push(...result.value);
        combined.sort((a, b) => {
          if (!a.start_date && !b.start_date) return 0;
          if (!a.start_date) return 1;
          if (!b.start_date) return -1;
          return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
        });
        setAllContracts(combined);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load contracts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const yearBuckets = useMemo<YearBucket[]>(() => {
    const buckets = new Map<string, YearBucket>();
    for (const c of allContracts) {
      const year = c.start_date ? new Date(c.start_date).getFullYear().toString() : 'Unknown';
      if (year === 'Unknown' || year === 'NaN') continue;
      const existing = buckets.get(year);
      if (existing) {
        existing.totalAmount += c.award_amount || 0;
        existing.count += 1;
      } else {
        buckets.set(year, { year, totalAmount: c.award_amount || 0, count: 1 });
      }
    }
    return Array.from(buckets.values()).sort((a, b) => a.year.localeCompare(b.year));
  }, [allContracts]);

  const topContractors = useMemo<CompanyContractStats[]>(() => {
    const statsMap = new Map<string, CompanyContractStats>();
    for (const c of allContracts) {
      const existing = statsMap.get(c.company_id);
      if (existing) {
        existing.totalAmount += c.award_amount || 0;
        existing.contractCount += 1;
      } else {
        statsMap.set(c.company_id, { company_id: c.company_id, company_name: c.company_name, totalAmount: c.award_amount || 0, contractCount: 1 });
      }
    }
    return Array.from(statsMap.values()).sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 15);
  }, [allContracts]);

  const totalValue = allContracts.reduce((sum, c) => sum + (c.award_amount || 0), 0);
  const totalContracts = allContracts.length;
  const uniqueCompanies = new Set(allContracts.map((c) => c.company_id)).size;
  const maxContractorAmount = topContractors.length > 0 ? topContractors[0].totalAmount : 0;

  return (
    <ResearchToolLayout
      sectorHeader={<TechSectorHeader />}
      eyebrow={{ label: 'Government Contracts', color: 'var(--color-dem)' }}
      title="Contract Timeline"
      description="Government contract awards over time across all tracked technology companies."
      accent="var(--color-dem)"
      loading={loading}
      error={error}
      stats={[
        { label: 'Total Value', value: fmtDollar(totalValue), icon: TrendingUp, accent: 'var(--color-green)' },
        { label: 'Contracts', value: fmtNum(totalContracts), icon: Landmark },
        { label: 'Companies', value: fmtNum(uniqueCompanies), icon: Building2 },
      ]}
    >
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ height: '280px', borderRadius: '14px', background: 'var(--color-surface)', opacity: 0.6 }} />
          <div style={{ height: '400px', borderRadius: '14px', background: 'var(--color-surface)', opacity: 0.6 }} />
        </div>
      ) : allContracts.length === 0 ? (
        <ResearchEmptyState icon={Landmark} text="No contract data available." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {yearBuckets.length > 0 && (
            <ResearchSection
              title="Spending Over Time"
              subtitle="Contract award values by fiscal year."
            >
              <div
                style={{
                  padding: '20px',
                  borderRadius: '14px',
                  border: '1px solid rgba(235,229,213,0.08)',
                  background: 'var(--color-surface)',
                }}
              >
                <SpendingChart
                  data={yearBuckets.map((b) => ({ year: b.year, total_amount: b.totalAmount, count: b.count }))}
                  height={260}
                  countLabel="award"
                />
              </div>
            </ResearchSection>
          )}

          {topContractors.length > 0 && (
            <ResearchSection
              title="Top Contractors"
              subtitle="Companies ranked by total government contract value."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {topContractors.map((comp, idx) => {
                  const pct = maxContractorAmount > 0 ? (comp.totalAmount / maxContractorAmount) * 100 : 0;
                  const color = BAR_COLORS[idx % BAR_COLORS.length];
                  const isExpanded = expandedId === comp.company_id;
                  const companyContracts = isExpanded
                    ? allContracts.filter((c) => c.company_id === comp.company_id)
                    : [];

                  return (
                    <ResearchRowCard key={comp.company_id} accent={color} onClick={() => setExpandedId(isExpanded ? null : comp.company_id)}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', width: '24px', textAlign: 'right', flexShrink: 0 }}>
                            {idx + 1}
                          </span>
                          <Link
                            to={`/technology/${comp.company_id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-1)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {comp.company_name}
                          </Link>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                            {comp.contractCount} contracts
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--color-green)' }}>
                            {fmtDollar(comp.totalAmount)}
                          </span>
                        </div>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(235,229,213,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                        <motion.div
                          style={{ height: '100%', background: color, borderRadius: '999px' }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(pct, 2)}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>

                      {isExpanded && companyContracts.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-3)' }}>
                            Contract Details
                          </span>
                          {companyContracts.map((ct) => (
                            <div key={ct.id} style={{ borderRadius: '8px', background: 'rgba(235,229,213,0.04)', padding: '10px 12px' }} onClick={(e) => e.stopPropagation()}>
                              {ct.description && (
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-text-2)', margin: '0 0 4px' }}>{ct.description}</p>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                {ct.award_amount != null && (
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-green)' }}>{fmtDollar(ct.award_amount)}</span>
                                )}
                                {ct.awarding_agency && (
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>{ct.awarding_agency}</span>
                                )}
                                {ct.start_date && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                                    <Calendar size={11} />{fmtDate(ct.start_date)}{ct.end_date ? ` — ${fmtDate(ct.end_date)}` : ''}
                                  </span>
                                )}
                                {ct.contract_type && (
                                  <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(235,229,213,0.06)', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)' }}>{ct.contract_type}</span>
                                )}
                                {ct.award_id && (
                                  <a
                                    href={`https://www.usaspending.gov/award/${ct.award_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-ind)', textDecoration: 'none' }}
                                  >
                                    <ExternalLink size={11} />Source
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ResearchRowCard>
                  );
                })}
              </div>
            </ResearchSection>
          )}
        </div>
      )}
    </ResearchToolLayout>
  );
}
