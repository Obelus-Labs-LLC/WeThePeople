import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Scale, Building2, TrendingUp } from 'lucide-react';
import { TechSectorHeader } from '../components/SectorHeader';
import {
  ResearchToolLayout,
  ResearchSection,
  ResearchRowCard,
  ResearchEmptyState,
  researchItemVariants,
} from '../components/research/ResearchToolLayout';
import {
  getTechCompanies,
  getTechCompanyLobbying,
  type TechLobbyingItem,
} from '../api/tech';
import { fmtDollar, fmtNum } from '../utils/format';

interface LobbyingWithCompany extends TechLobbyingItem {
  company_id: string;
  company_name: string;
}

interface IssueBreakdown {
  issue: string;
  totalIncome: number;
  filingCount: number;
  companies: Map<string, { name: string; income: number }>;
}

const BAR_COLORS = [
  'var(--color-ind)', 'var(--color-dem)', 'var(--color-green)', 'var(--color-accent)', 'var(--color-red)',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#A855F7',
];

export default function LobbyingBreakdownPage() {
  const [allFilings, setAllFilings] = useState<LobbyingWithCompany[]>([]);
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
            getTechCompanyLobbying(c.company_id, { limit: 100 }).then((r) =>
              (r.filings || []).map((f) => ({ ...f, company_id: c.company_id, company_name: c.display_name })),
            ),
          ),
        );
        if (cancelled) return;
        const combined: LobbyingWithCompany[] = [];
        for (const result of results) if (result.status === 'fulfilled') combined.push(...result.value);
        setAllFilings(combined);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load lobbying data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const issueBreakdown = useMemo(() => {
    const issueMap = new Map<string, IssueBreakdown>();
    for (const filing of allFilings) {
      if (!filing.lobbying_issues) continue;
      const income = filing.income || 0;
      const issues = filing.lobbying_issues.split(/[;,]/).map((s) => s.trim()).filter((s) => s.length > 0 && s.length < 100);
      for (const raw of issues) {
        const issue = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
        const existing = issueMap.get(issue);
        if (existing) {
          existing.totalIncome += income;
          existing.filingCount += 1;
          const comp = existing.companies.get(filing.company_id);
          if (comp) comp.income += income;
          else existing.companies.set(filing.company_id, { name: filing.company_name, income });
        } else {
          const companies = new Map<string, { name: string; income: number }>();
          companies.set(filing.company_id, { name: filing.company_name, income });
          issueMap.set(issue, { issue, totalIncome: income, filingCount: 1, companies });
        }
      }
    }
    return Array.from(issueMap.values()).sort((a, b) => b.totalIncome - a.totalIncome).slice(0, 25);
  }, [allFilings]);

  const totalIncome = allFilings.reduce((sum, f) => sum + (f.income || 0), 0);
  const totalFilings = allFilings.length;
  const uniqueCompanies = new Set(allFilings.map((f) => f.company_id)).size;
  const maxIncome = issueBreakdown.length > 0 ? issueBreakdown[0].totalIncome : 0;

  return (
    <ResearchToolLayout
      sectorHeader={<TechSectorHeader />}
      eyebrow={{ label: 'Lobbying Activity', color: 'var(--color-ind)' }}
      title="Lobbying Breakdown"
      description="Lobbying spending by issue area across all tracked technology companies."
      accent="var(--color-ind)"
      loading={loading}
      error={error}
      stats={[
        { label: 'Total Income', value: fmtDollar(totalIncome), icon: TrendingUp, accent: 'var(--color-green)' },
        { label: 'Total Filings', value: fmtNum(totalFilings), icon: Scale },
        { label: 'Companies', value: fmtNum(uniqueCompanies), icon: Building2 },
      ]}
    >
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ height: '64px', borderRadius: '12px', background: 'var(--color-surface)', opacity: 0.6 }} />
          ))}
        </div>
      ) : issueBreakdown.length === 0 ? (
        <ResearchEmptyState icon={Scale} text="No lobbying issue data available." />
      ) : (
        <ResearchSection
          title="Spending by Issue Area"
          subtitle="Top 25 lobbying issue categories ranked by total reported income."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {issueBreakdown.map((item, idx) => {
              const pct = maxIncome > 0 ? (item.totalIncome / maxIncome) * 100 : 0;
              const color = BAR_COLORS[idx % BAR_COLORS.length];
              const allCompanies = Array.from(item.companies.entries()).map(([companyId, v]) => ({ companyId, ...v })).sort((a, b) => b.income - a.income);
              const topCompanies = allCompanies.slice(0, 3);
              const isExpanded = expandedId === item.issue;

              return (
                <ResearchRowCard key={item.issue} accent={color} onClick={() => setExpandedId(isExpanded ? null : item.issue)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: color, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-text-1)', whiteSpace: isExpanded ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.issue}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                        {item.filingCount} filings
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--color-text-1)' }}>
                        {fmtDollar(item.totalIncome)}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(235,229,213,0.06)', borderRadius: '999px', overflow: 'hidden', marginBottom: '10px' }}>
                    <motion.div
                      style={{ height: '100%', background: color, borderRadius: '999px' }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(pct, 2)}%` }}
                      transition={{ duration: 0.8, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                  {isExpanded ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-3)' }}>
                        All Companies
                      </span>
                      {allCompanies.map((comp) => (
                        <div key={comp.companyId} style={{ display: 'flex', alignItems: 'center', padding: '2px 4px', borderRadius: '4px' }} onClick={(e) => e.stopPropagation()}>
                          <Link to={`/technology/${comp.companyId}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-2)', textDecoration: 'none' }}>
                            {comp.name}
                          </Link>
                          <div style={{ flex: 1, borderBottom: '1px dotted rgba(235,229,213,0.15)', margin: '0 8px' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                            {fmtDollar(comp.income)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      {topCompanies.map((comp) => (
                        <Link key={comp.companyId} to={`/technology/${comp.companyId}`} onClick={(e) => e.stopPropagation()} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', textDecoration: 'none' }}>
                          {comp.name}: {fmtDollar(comp.income)}
                        </Link>
                      ))}
                    </div>
                  )}
                </ResearchRowCard>
              );
            })}
          </div>
        </ResearchSection>
      )}
    </ResearchToolLayout>
  );
}
