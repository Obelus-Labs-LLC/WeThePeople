import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import {
  FileText, Landmark, Scale, AlertTriangle, Lightbulb,
} from 'lucide-react';
import {
  SectorProfileLayout,
  ProfileSection,
  ProfileSummaryGrid,
  ProfileRecordCard,
  ProfileRecordMeta,
  ProfileRecordList,
} from '../components/sector/SectorProfileLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import { getApiBaseUrl } from '../api/client';
import { fmtDollar, fmtNum, fmtDate , sanitizeContractTitle } from '../utils/format';
import SpendingChart from '../components/SpendingChart';
import {
  getTechCompanyDetail,
  getTechCompanyPatents,
  getTechCompanyContracts,
  getTechCompanyContractSummary,
  getTechCompanyContractTrends,
  getTechCompanyLobbying,
  getTechCompanyLobbySummary,
  getTechCompanyEnforcement,
  getTechCompanyFilings,
  getTechCompanyStock,
  getTechCompanyPatentPolicy,
  type TechCompanyDetail,
  type TechPatentItem,
  type TechContractItem,
  type TechContractSummary,
  type TechContractTrend,
  type TechLobbyingItem,
  type TechLobbySummary,
  type TechEnforcementItem,
  type TechFilingItem,
  type TechStockData,
  type TechPatentPolicyResponse,
} from '../api/tech';

type TabKey = 'lobbying' | 'contracts' | 'enforcement' | 'patents' | 'filings';

export default function TechCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const config = SECTOR_MAP.tech;
  const accent = config.accent;

  const [activeTab, setActiveTab] = useState<TabKey>('lobbying');
  const [detail, setDetail] = useState<TechCompanyDetail | null>(null);
  const [stock, setStock] = useState<TechStockData['latest_stock']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  const [patents, setPatents] = useState<TechPatentItem[]>([]);
  const [patentTotal, setPatentTotal] = useState(0);
  const [patentsLoaded, setPatentsLoaded] = useState(false);
  const [patentPolicy, setPatentPolicy] = useState<TechPatentPolicyResponse | null>(null);

  const [contracts, setContracts] = useState<TechContractItem[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [contractSummary, setContractSummary] = useState<TechContractSummary | null>(null);
  const [contractTrends, setContractTrends] = useState<TechContractTrend[]>([]);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  const [lobbying, setLobbying] = useState<TechLobbyingItem[]>([]);
  const [lobbyTotal, setLobbyTotal] = useState(0);
  const [lobbySummary, setLobbySummary] = useState<TechLobbySummary | null>(null);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);

  const [enforcement, setEnforcement] = useState<TechEnforcementItem[]>([]);
  const [enforcementTotal, setEnforcementTotal] = useState(0);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);

  const [filings, setFilings] = useState<TechFilingItem[]>([]);
  const [filingTotal, setFilingTotal] = useState(0);
  const [filingsLoaded, setFilingsLoaded] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getTechCompanyDetail(companyId),
      getTechCompanyStock(companyId).catch(() => ({ latest_stock: null } as TechStockData)),
    ])
      .then(([d, s]) => {
        if (cancelled) return;
        setDetail(d);
        setStock(s.latest_stock || null);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch(`${getApiBaseUrl()}/tech/companies/${encodeURIComponent(companyId)}/trends`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled && d) setTrends(d); })
      .catch((err) => { console.warn('[TechCompanyProfilePage] fetch failed:', err); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    if (activeTab === 'patents' && !patentsLoaded) {
      Promise.all([
        getTechCompanyPatents(companyId, { limit: 100 }),
        getTechCompanyPatentPolicy(companyId).catch(() => null),
      ]).then(([r, pp]) => {
        setPatents(r.patents || []); setPatentTotal(r.total); setPatentsLoaded(true);
        if (pp) setPatentPolicy(pp);
      }).catch((err) => { console.warn('[TechCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'contracts' && !contractsLoaded) {
      Promise.all([
        getTechCompanyContracts(companyId, { limit: 100 }),
        getTechCompanyContractSummary(companyId).catch(() => null),
        getTechCompanyContractTrends(companyId).catch(() => ({ trends: [] })),
      ]).then(([c, s, t]) => {
        setContracts(c.contracts || []); setContractTotal(c.total);
        if (s) setContractSummary(s);
        setContractTrends(t.trends || []);
        setContractsLoaded(true);
      }).catch((err) => { console.warn('[TechCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'lobbying' && !lobbyingLoaded) {
      Promise.all([
        getTechCompanyLobbying(companyId, { limit: 100 }),
        getTechCompanyLobbySummary(companyId).catch(() => null),
      ]).then(([l, s]) => {
        setLobbying(l.filings || []); setLobbyTotal(l.total);
        if (s) setLobbySummary(s);
        setLobbyingLoaded(true);
      }).catch((err) => { console.warn('[TechCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getTechCompanyEnforcement(companyId, { limit: 100 }).then((r) => {
        setEnforcement(r.actions || []); setEnforcementTotal(r.total);
        setTotalPenalties(r.total_penalties || 0);
        setEnforcementLoaded(true);
      }).catch((err) => { console.warn('[TechCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'filings' && !filingsLoaded) {
      getTechCompanyFilings(companyId, { limit: 100 }).then((r) => {
        setFilings(r.filings || []); setFilingTotal(r.total); setFilingsLoaded(true);
      }).catch((err) => { console.warn('[TechCompanyProfilePage] fetch failed:', err); });
    }
  }, [activeTab, companyId, patentsLoaded, contractsLoaded, lobbyingLoaded, enforcementLoaded, filingsLoaded]);

  const tabs = [
    {
      key: 'lobbying',
      label: 'Lobbying',
      icon: Scale,
      count: lobbyTotal,
      render: () => (
        <ProfileSection title="Lobbying Filings" icon={Scale} count={lobbyTotal} accent={accent}>
          {lobbySummary && (
            <ProfileSummaryGrid accent={accent} items={[
              { label: 'Total Filings', value: fmtNum(lobbySummary.total_filings) },
              { label: 'Total Income', value: fmtDollar(lobbySummary.total_income) },
              { label: 'Firms', value: fmtNum(Object.keys(lobbySummary.top_firms).length) },
            ]} />
          )}
          <ProfileRecordList
            empty="No lobbying filings found"
            records={lobbying.map((l) => (
              <ProfileRecordCard
                key={l.id}
                accent={accent}
                title={l.registrant_name || l.client_name || 'Lobbying Filing'}
                amount={l.income != null && l.income > 0 ? fmtDollar(l.income) : undefined}
                amountAccent="var(--color-green)"
                description={l.lobbying_issues || null}
                url={l.filing_uuid ? `https://lda.senate.gov/filings/filing/${l.filing_uuid}/` : null}
                meta={<ProfileRecordMeta items={[
                  ...(l.filing_year ? [{ value: `${l.filing_year} ${l.filing_period || ''}`.trim() }] : []),
                  ...(l.government_entities ? [{ value: l.government_entities }] : []),
                ]} />}
              />
            ))}
          />
        </ProfileSection>
      ),
    },
    {
      key: 'contracts',
      label: 'Contracts',
      icon: Landmark,
      count: contractTotal,
      render: () => (
        <ProfileSection title="Government Contracts" icon={Landmark} count={contractTotal} accent={accent}>
          {contractSummary && (
            <ProfileSummaryGrid accent={accent} items={[
              { label: 'Total Contracts', value: fmtNum(contractSummary.total_contracts) },
              { label: 'Total Value', value: fmtDollar(contractSummary.total_amount) },
              { label: 'Agencies', value: fmtNum(Object.keys(contractSummary.by_agency).length) },
              { label: 'Types', value: fmtNum(Object.keys(contractSummary.by_type).length) },
            ]} />
          )}
          {contractTrends.length > 0 && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-3)] mb-4">Spending Over the Years</h3>
              <SpendingChart data={contractTrends} />
            </div>
          )}
          <ProfileRecordList
            empty="No contracts found"
            records={contracts.map((c) => (
              <ProfileRecordCard
                key={c.id}
                accent={accent}
                title={sanitizeContractTitle(c.description, 'Government Contract')}
                amount={c.award_amount != null ? fmtDollar(c.award_amount) : undefined}
                amountAccent="var(--color-green)"
                url={c.award_id ? `https://www.usaspending.gov/award/${c.award_id}` : null}
                meta={<ProfileRecordMeta items={[
                  ...(c.awarding_agency ? [{ value: c.awarding_agency }] : []),
                  ...(c.start_date ? [{ value: fmtDate(c.start_date) }] : []),
                  ...(c.contract_type ? [{ value: c.contract_type }] : []),
                ]} />}
              />
            ))}
          />
        </ProfileSection>
      ),
    },
    {
      key: 'enforcement',
      label: 'Enforcement',
      icon: AlertTriangle,
      count: enforcementTotal,
      render: () => (
        <ProfileSection title="Enforcement Actions" icon={AlertTriangle} count={enforcementTotal} accent={accent}>
          {enforcementLoaded && (
            <ProfileSummaryGrid accent={accent} items={[
              { label: 'Actions', value: fmtNum(enforcementTotal), accent: 'var(--color-red)' },
              { label: 'Total Penalties', value: fmtDollar(totalPenalties), accent: 'var(--color-red)' },
            ]} />
          )}
          <ProfileRecordList
            empty="No enforcement actions found"
            records={enforcement.map((e) => (
              <ProfileRecordCard
                key={e.id}
                accent={accent}
                title={e.case_title || 'Enforcement Action'}
                amount={e.penalty_amount != null && e.penalty_amount > 0 ? fmtDollar(e.penalty_amount) : undefined}
                amountAccent="var(--color-red)"
                description={e.description || null}
                url={e.case_url || null}
                meta={<ProfileRecordMeta items={[
                  ...(e.enforcement_type ? [{ value: e.enforcement_type, accent: 'var(--color-red)' }] : []),
                  ...(e.case_date ? [{ value: fmtDate(e.case_date) }] : []),
                  ...(e.source ? [{ value: e.source }] : []),
                ]} />}
              />
            ))}
          />
        </ProfileSection>
      ),
    },
    {
      key: 'patents',
      label: 'Patents',
      icon: Lightbulb,
      count: patentTotal,
      render: () => (
        <ProfileSection title="Patents" icon={Lightbulb} count={patentTotal} accent={accent}>
          {patentPolicy && (patentPolicy.lobbying_on_ip_policy > 0 || patentPolicy.related_bills_count > 0) && (
            <div className="rounded-2xl border p-5 mb-6" style={{ background: `${accent}10`, borderColor: `${accent}30` }}>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] mb-4" style={{ color: accent }}>Policy Connection</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div><p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-3)] mb-1">Patents Filed</p><p className="font-mono text-2xl font-bold text-[var(--color-text-1)]">{fmtNum(patentPolicy.patent_count)}</p></div>
                <div><p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-3)] mb-1">IP Policy Lobbying</p><p className="font-mono text-2xl font-bold" style={{ color: accent }}>{fmtNum(patentPolicy.lobbying_on_ip_policy)}</p>{patentPolicy.ip_lobbying_spend > 0 && <p className="font-mono text-xs text-[var(--color-text-3)] mt-1">{fmtDollar(patentPolicy.ip_lobbying_spend)}</p>}</div>
                <div><p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-3)] mb-1">Related Bills</p><p className="font-mono text-2xl font-bold text-[var(--color-dem)]">{fmtNum(patentPolicy.related_bills_count)}</p></div>
              </div>
              {patentPolicy.related_bills.length > 0 && (
                <div className="mt-4">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-3)] mb-2">Related Bills</p>
                  <div className="flex flex-col gap-2">
                    {patentPolicy.related_bills.slice(0, 5).map((b) => (
                      <Link key={b.bill_id} to={`/politics/bill/${b.bill_id}`} className="flex items-center gap-3 rounded-lg bg-[var(--color-surface-alt)] px-3 py-2 hover:bg-[var(--color-surface-hover)] transition-colors no-underline">
                        <span className="rounded bg-[var(--color-dem)]/20 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--color-dem)] uppercase shrink-0">{b.bill_type}{b.bill_number}</span>
                        <span className="font-body text-sm text-[var(--color-text-2)] truncate flex-1">{b.title || 'Untitled Bill'}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <ProfileRecordList
            empty="No patents found"
            records={patents.map((p) => (
              <ProfileRecordCard
                key={p.id}
                accent={accent}
                title={p.patent_title || 'Untitled Patent'}
                description={p.patent_abstract || null}
                url={p.patent_number ? `https://patents.google.com/patent/US${p.patent_number.replace(/[^0-9A-Za-z]/g, '')}` : null}
                meta={<ProfileRecordMeta items={[
                  ...(p.patent_number ? [{ value: `US${p.patent_number}`, accent }] : []),
                  ...(p.patent_date ? [{ value: fmtDate(p.patent_date) }] : []),
                  ...(p.num_claims != null ? [{ value: `${p.num_claims} claims` }] : []),
                ]} />}
              />
            ))}
          />
        </ProfileSection>
      ),
    },
    {
      key: 'filings',
      label: 'Financials',
      icon: FileText,
      count: filingTotal,
      render: () => (
        <ProfileSection title="SEC Filings" icon={FileText} count={filingTotal} accent={accent}>
          <ProfileRecordList
            empty="No SEC filings found"
            records={filings.map((f) => (
              <ProfileRecordCard
                key={f.id}
                accent={accent}
                title={f.description || f.accession_number || 'SEC Filing'}
                amount={f.form_type}
                url={f.filing_url || f.primary_doc_url || null}
                meta={<ProfileRecordMeta items={[
                  ...(f.filing_date ? [{ value: fmtDate(f.filing_date) }] : []),
                  ...(f.accession_number ? [{ value: f.accession_number }] : []),
                ]} />}
              />
            ))}
          />
        </ProfileSection>
      ),
    },
  ];

  return (
    <SectorProfileLayout
      config={config}
      detail={detail}
      stock={stock}
      trends={trends}
      tabs={tabs}
      activeTab={activeTab}
      onChangeTab={(k) => setActiveTab(k as TabKey)}
      loading={loading}
      error={error}
      companyIdParam={companyId || ''}
      companiesPath="/technology/companies"
    />
  );
}
