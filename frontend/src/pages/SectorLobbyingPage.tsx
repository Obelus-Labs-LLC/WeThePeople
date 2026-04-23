import React, { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Scale, Building2, TrendingUp } from 'lucide-react';
import CSVExport from '../components/CSVExport';
import SectorTabLayout, {
  statCard,
  statLabel,
  statNumber,
  sectionTitle,
  sectionSubtitle,
  emptyState,
} from '../components/sector/SectorTabLayout';
import { SECTOR_MAP, detectSector } from '../components/sector/sectorConfig';
import { fmtDollar, fmtNum } from '../utils/format';

// ── Types ──

interface LobbyingFiling {
  id: number;
  filing_uuid: string | null;
  filing_year: number | null;
  filing_period: string | null;
  income: number | null;
  expenses: number | null;
  registrant_name: string | null;
  client_name: string | null;
  lobbying_issues: string | null;
  government_entities: string | null;
  entity_id: string;
  entity_name: string;
  ai_summary?: string;
}

interface IssueBreakdown {
  issue: string;
  totalIncome: number;
  filingCount: number;
  companies: Map<string, { name: string; income: number }>;
  aiSummaries: string[];
}

// ── Animation variants ──

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 130, damping: 22 },
  },
};

// ── Issue bar palette keyed from design tokens ──

const BAR_PALETTE: string[] = [
  '#D4AE35', // accent-text
  '#3DB87A', // green
  '#4A7FDE', // dem
  '#B06FD8', // ind
  '#E63946', // red
  '#C5A028', // accent
  '#6B95E8', // dem-light
  '#5EC090', // green-mid
  '#D48B3A', // warm
  '#8F9EE6', // dem-soft
];

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── Page ──

export default function SectorLobbyingPage() {
  const location = useLocation();
  const sectorKey = detectSector(location.pathname);
  const config = SECTOR_MAP[sectorKey];
  const entityWord = config.entityKey === 'institutions' ? 'institutions' : 'companies';
  const EntityWord = config.entityKey === 'institutions' ? 'Institutions' : 'Companies';

  const [allFilings, setAllFilings] = useState<LobbyingFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const endpoint = config.endpoints.lobbying;

    async function loadData() {
      if (!endpoint) {
        setError('No lobbying data available for this sector.');
        setLoading(false);
        return;
      }

      try {
        const data = await fetchJSON<{ filings: LobbyingFiling[] }>(endpoint);
        if (cancelled) return;
        setAllFilings(data.filings || []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load lobbying data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    setError(null);
    setAllFilings([]);
    setExpandedId(null);
    loadData();
    return () => { cancelled = true; };
  }, [sectorKey, config.endpoints.lobbying]);

  // Parse lobbying issues and build breakdown
  const issueBreakdown = useMemo<IssueBreakdown[]>(() => {
    const issueMap = new Map<string, IssueBreakdown>();

    for (const filing of allFilings) {
      if (!filing.lobbying_issues) continue;
      const income = filing.income || 0;

      const issues = filing.lobbying_issues
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length < 100);

      for (const raw of issues) {
        const issue = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
        const existing = issueMap.get(issue);

        if (existing) {
          existing.totalIncome += income;
          existing.filingCount += 1;
          const comp = existing.companies.get(filing.entity_id);
          if (comp) {
            comp.income += income;
          } else {
            existing.companies.set(filing.entity_id, { name: filing.entity_name, income });
          }
          const aiSum = filing.ai_summary;
          if (aiSum && !existing.aiSummaries.includes(aiSum)) existing.aiSummaries.push(aiSum);
        } else {
          const companies = new Map<string, { name: string; income: number }>();
          companies.set(filing.entity_id, { name: filing.entity_name, income });
          const aiSum = filing.ai_summary;
          issueMap.set(issue, {
            issue,
            totalIncome: income,
            filingCount: 1,
            companies,
            aiSummaries: aiSum ? [aiSum] : [],
          });
        }
      }
    }

    return Array.from(issueMap.values())
      .sort((a, b) => b.totalIncome - a.totalIncome)
      .slice(0, 25);
  }, [allFilings]);

  // Top-level stats
  const totalIncome = allFilings.reduce((sum, f) => sum + (f.income || 0), 0);
  const totalFilings = allFilings.length;
  const uniqueCompanies = new Set(allFilings.map((f) => f.entity_id)).size;
  const maxIncome = issueBreakdown.length > 0 ? issueBreakdown[0].totalIncome : 0;

  const csvExport = (
    <CSVExport
      data={allFilings}
      filename={`${config.key}-lobbying`}
      columns={[
        { key: 'entity_name', label: 'Company' },
        { key: 'registrant_name', label: 'Registrant' },
        { key: 'client_name', label: 'Client' },
        { key: 'filing_year', label: 'Year' },
        { key: 'filing_period', label: 'Period' },
        { key: 'income', label: 'Income' },
        { key: 'lobbying_issues', label: 'Issues' },
        { key: 'government_entities', label: 'Gov Entities' },
      ]}
    />
  );

  return (
    <SectorTabLayout
      config={config}
      eyebrow="Lobbying Activity"
      title={`${config.label} lobbying breakdown`}
      subtitle={`Lobbying spending by issue area across all tracked ${config.label.toLowerCase()} ${entityWord}.`}
      rightSlot={csvExport}
      error={error}
      errorLabel="lobbying data"
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}
      >
        {/* Stat cards */}
        {loading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '12px',
            }}
          >
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ ...statCard, height: '96px' }} />
            ))}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            <motion.div variants={itemVariants} style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={statLabel}>Total Lobbying Income</span>
                <TrendingUp size={16} color="var(--color-text-3)" />
              </div>
              <span style={{ ...statNumber, color: config.accent }}>{fmtDollar(totalIncome)}</span>
            </motion.div>
            <motion.div variants={itemVariants} style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={statLabel}>Total Filings</span>
                <Scale size={16} color="var(--color-text-3)" />
              </div>
              <span style={statNumber}>{fmtNum(totalFilings)}</span>
            </motion.div>
            <motion.div variants={itemVariants} style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={statLabel}>{EntityWord}</span>
                <Building2 size={16} color="var(--color-text-3)" />
              </div>
              <span style={statNumber}>{uniqueCompanies}</span>
            </motion.div>
          </motion.div>
        )}

        {/* Issue breakdown */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} style={{ ...statCard, height: '72px' }} />
            ))}
          </div>
        ) : issueBreakdown.length === 0 ? (
          <div style={emptyState}>
            <Scale size={40} color="var(--color-text-3)" style={{ opacity: 0.4, marginBottom: '16px' }} />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '16px',
                color: 'var(--color-text-3)',
                margin: 0,
              }}
            >
              No lobbying issue data available
            </p>
          </div>
        ) : (
          <motion.div variants={containerVariants}>
            <motion.div variants={itemVariants}>
              <h2 style={sectionTitle}>
                Spending by <span style={{ color: config.accent, fontStyle: 'italic' }}>issue area</span>
              </h2>
              <p style={sectionSubtitle}>
                Top 25 lobbying issue categories ranked by total reported income.
              </p>
            </motion.div>

            <div
              style={{
                padding: '8px',
                background: 'var(--color-surface)',
                border: '1px solid rgba(235,229,213,0.08)',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {issueBreakdown.map((item, idx) => {
                const pct = maxIncome > 0 ? (item.totalIncome / maxIncome) * 100 : 0;
                const color = BAR_PALETTE[idx % BAR_PALETTE.length];
                const allCompanies = Array.from(item.companies.entries())
                  .map(([entityId, v]) => ({ entityId, ...v }))
                  .sort((a, b) => b.income - a.income);
                const topCompanies = allCompanies.slice(0, 3);
                const isExpanded = expandedId === item.issue;

                return (
                  <motion.div
                    key={item.issue}
                    variants={itemVariants}
                    onClick={() => setExpandedId(isExpanded ? null : item.issue)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: isExpanded ? 'rgba(235,229,213,0.04)' : 'transparent',
                      border: '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 0.18s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = 'rgba(235,229,213,0.03)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        marginBottom: '10px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '3px',
                            background: color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: 'var(--color-text-1)',
                            overflow: isExpanded ? 'visible' : 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: isExpanded ? 'normal' : 'nowrap',
                          }}
                        >
                          {item.issue}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            color: 'var(--color-text-3)',
                          }}
                        >
                          {item.filingCount} filings
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: 'var(--color-text-1)',
                          }}
                        >
                          {fmtDollar(item.totalIncome)}
                        </span>
                      </div>
                    </div>

                    {/* Bar */}
                    <div
                      style={{
                        height: '6px',
                        background: 'var(--color-surface-2)',
                        borderRadius: '999px',
                        overflow: 'hidden',
                        marginBottom: isExpanded ? '14px' : '8px',
                      }}
                    >
                      <motion.div
                        style={{
                          height: '100%',
                          borderRadius: '999px',
                          background: color,
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(pct, 2)}%` }}
                        transition={{ duration: 0.7, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>

                    {/* AI summaries */}
                    {isExpanded && item.aiSummaries.length > 0 && (
                      <div style={{ marginBottom: '14px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            color: 'var(--color-text-3)',
                            marginBottom: '4px',
                          }}
                        >
                          AI analysis
                        </span>
                        {item.aiSummaries.slice(0, 3).map((s, si) => (
                          <p
                            key={si}
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '13px',
                              color: 'var(--color-text-2)',
                              margin: '4px 0 0',
                              lineHeight: 1.55,
                            }}
                          >
                            {s}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Companies — expanded list or top-3 summary */}
                    {isExpanded ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            color: 'var(--color-text-3)',
                            marginBottom: '6px',
                          }}
                        >
                          All {entityWord}
                        </span>
                        {allCompanies.map((comp) => (
                          <div
                            key={comp.entityId}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '3px 4px',
                              borderRadius: '6px',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(235,229,213,0.04)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <Link
                              to={config.profilePath(comp.entityId)}
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                color: 'var(--color-text-2)',
                                textDecoration: 'none',
                                flexShrink: 0,
                                maxWidth: '60%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = config.accent; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
                            >
                              {comp.name}
                            </Link>
                            <div
                              style={{
                                flex: 1,
                                borderBottom: '1px dotted rgba(235,229,213,0.15)',
                                margin: '0 4px',
                                transform: 'translateY(-2px)',
                              }}
                            />
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                color: 'var(--color-text-3)',
                                flexShrink: 0,
                              }}
                            >
                              {fmtDollar(comp.income)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '8px 14px',
                          opacity: 0.75,
                        }}
                      >
                        {topCompanies.map((comp) => (
                          <Link
                            key={comp.entityId}
                            to={config.profilePath(comp.entityId)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: 'var(--color-text-3)',
                              textDecoration: 'none',
                              transition: 'color 0.15s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = config.accent; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-3)'; }}
                          >
                            {comp.name}: {fmtDollar(comp.income)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </motion.div>
    </SectorTabLayout>
  );
}
