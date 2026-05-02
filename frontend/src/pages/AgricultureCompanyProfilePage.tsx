import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText, Landmark, Scale, AlertTriangle,
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
import {
  getAgricultureCompanyDetail,
  getAgricultureCompanyContracts,
  getAgricultureCompanyContractSummary,
  getAgricultureCompanyLobbying,
  getAgricultureCompanyLobbySummary,
  getAgricultureCompanyEnforcement,
  getAgricultureCompanyFilings,
  getAgricultureCompanyStock,
  type AgricultureCompanyDetail,
  type AgricultureContractItem,
  type AgricultureContractSummary,
  type AgricultureLobbyingItem,
  type AgricultureLobbySummary,
  type AgricultureEnforcementItem,
  type AgricultureFilingItem,
  type AgricultureStockData,
} from '../api/agriculture';

type TabKey = 'contracts' | 'lobbying' | 'enforcement' | 'filings';

export default function AgricultureCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const config = SECTOR_MAP.agriculture;
  const accent = config.accent;

  const [activeTab, setActiveTab] = useState<TabKey>('contracts');
  const [detail, setDetail] = useState<AgricultureCompanyDetail | null>(null);
  const [stock, setStock] = useState<AgricultureStockData['latest_stock']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  const [contracts, setContracts] = useState<AgricultureContractItem[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [contractSummary, setContractSummary] = useState<AgricultureContractSummary | null>(null);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  const [lobbying, setLobbying] = useState<AgricultureLobbyingItem[]>([]);
  const [lobbyTotal, setLobbyTotal] = useState(0);
  const [lobbySummary, setLobbySummary] = useState<AgricultureLobbySummary | null>(null);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);

  const [enforcement, setEnforcement] = useState<AgricultureEnforcementItem[]>([]);
  const [enforcementTotal, setEnforcementTotal] = useState(0);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);

  const [filings, setFilings] = useState<AgricultureFilingItem[]>([]);
  const [filingTotal, setFilingTotal] = useState(0);
  const [filingsLoaded, setFilingsLoaded] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getAgricultureCompanyDetail(companyId),
      getAgricultureCompanyStock(companyId).catch(() => ({ latest_stock: null } as AgricultureStockData)),
    ])
      .then(([d, s]) => {
        if (cancelled) return;
        setDetail(d);
        setStock(s.latest_stock || null);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch(`${getApiBaseUrl()}/agriculture/companies/${encodeURIComponent(companyId)}/trends`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled && d) setTrends(d); })
      .catch((err) => { console.warn('[AgricultureCompanyProfilePage] fetch failed:', err); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    if (activeTab === 'contracts' && !contractsLoaded) {
      Promise.all([
        getAgricultureCompanyContracts(companyId, { limit: 100 }),
        getAgricultureCompanyContractSummary(companyId).catch(() => null),
      ]).then(([c, s]) => {
        setContracts(c.contracts || []); setContractTotal(c.total);
        if (s) setContractSummary(s);
        setContractsLoaded(true);
      }).catch((err) => { console.warn('[AgricultureCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'lobbying' && !lobbyingLoaded) {
      Promise.all([
        getAgricultureCompanyLobbying(companyId, { limit: 100 }),
        getAgricultureCompanyLobbySummary(companyId).catch(() => null),
      ]).then(([l, s]) => {
        setLobbying(l.filings || []); setLobbyTotal(l.total);
        if (s) setLobbySummary(s);
        setLobbyingLoaded(true);
      }).catch((err) => { console.warn('[AgricultureCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getAgricultureCompanyEnforcement(companyId, { limit: 100 }).then((r) => {
        setEnforcement(r.actions || []); setEnforcementTotal(r.total);
        setTotalPenalties(r.total_penalties || 0);
        setEnforcementLoaded(true);
      }).catch((err) => { console.warn('[AgricultureCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'filings' && !filingsLoaded) {
      getAgricultureCompanyFilings(companyId, { limit: 100 }).then((r) => {
        setFilings(r.filings || []); setFilingTotal(r.total); setFilingsLoaded(true);
      }).catch((err) => { console.warn('[AgricultureCompanyProfilePage] fetch failed:', err); });
    }
  }, [activeTab, companyId, contractsLoaded, lobbyingLoaded, enforcementLoaded, filingsLoaded]);

  const tabs = [
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
            ]} />
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
      key: 'filings',
      label: 'SEC Filings',
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
      companiesPath="/agriculture/companies"
    />
  );
}
