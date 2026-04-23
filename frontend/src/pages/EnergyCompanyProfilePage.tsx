import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText, Landmark, Scale, AlertTriangle, Flame,
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
import { fmtDollar, fmtNum, fmtDate } from '../utils/format';
import {
  getEnergyCompanyDetail,
  getEnergyCompanyEmissions,
  getEnergyCompanyEmissionsSummary,
  getEnergyCompanyContracts,
  getEnergyCompanyContractSummary,
  getEnergyCompanyLobbying,
  getEnergyCompanyLobbySummary,
  getEnergyCompanyEnforcement,
  getEnergyCompanyFilings,
  getEnergyCompanyStock,
  type EnergyCompanyDetail,
  type EnergyEmissionItem,
  type EnergyEmissionsSummary,
  type EnergyContractItem,
  type EnergyContractSummary,
  type EnergyLobbyingItem,
  type EnergyLobbySummary,
  type EnergyEnforcementItem,
  type EnergyFilingItem,
  type EnergyStockData,
} from '../api/energy';

type TabKey = 'emissions' | 'contracts' | 'lobbying' | 'enforcement' | 'filings';

function fmtEmissions(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function EnergyCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const config = SECTOR_MAP.energy;
  const accent = config.accent;

  const [activeTab, setActiveTab] = useState<TabKey>('emissions');
  const [detail, setDetail] = useState<EnergyCompanyDetail | null>(null);
  const [stock, setStock] = useState<EnergyStockData['latest_stock']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  const [emissions, setEmissions] = useState<EnergyEmissionItem[]>([]);
  const [emissionTotal, setEmissionTotal] = useState(0);
  const [emissionSummary, setEmissionSummary] = useState<EnergyEmissionsSummary | null>(null);
  const [emissionsLoaded, setEmissionsLoaded] = useState(false);

  const [contracts, setContracts] = useState<EnergyContractItem[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [contractSummary, setContractSummary] = useState<EnergyContractSummary | null>(null);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  const [lobbying, setLobbying] = useState<EnergyLobbyingItem[]>([]);
  const [lobbyTotal, setLobbyTotal] = useState(0);
  const [lobbySummary, setLobbySummary] = useState<EnergyLobbySummary | null>(null);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);

  const [enforcement, setEnforcement] = useState<EnergyEnforcementItem[]>([]);
  const [enforcementTotal, setEnforcementTotal] = useState(0);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);

  const [filings, setFilings] = useState<EnergyFilingItem[]>([]);
  const [filingTotal, setFilingTotal] = useState(0);
  const [filingsLoaded, setFilingsLoaded] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getEnergyCompanyDetail(companyId),
      getEnergyCompanyStock(companyId).catch(() => ({ latest_stock: null } as EnergyStockData)),
    ])
      .then(([d, s]) => {
        if (cancelled) return;
        setDetail(d);
        setStock(s.latest_stock || null);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch(`${getApiBaseUrl()}/energy/companies/${encodeURIComponent(companyId)}/trends`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled && d) setTrends(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    if (activeTab === 'emissions' && !emissionsLoaded) {
      Promise.all([
        getEnergyCompanyEmissions(companyId, { limit: 100 }),
        getEnergyCompanyEmissionsSummary(companyId).catch(() => null),
      ]).then(([e, s]) => {
        setEmissions(e.emissions || []); setEmissionTotal(e.total);
        if (s) setEmissionSummary(s);
        setEmissionsLoaded(true);
      }).catch(() => {});
    }
    if (activeTab === 'contracts' && !contractsLoaded) {
      Promise.all([
        getEnergyCompanyContracts(companyId, { limit: 100 }),
        getEnergyCompanyContractSummary(companyId).catch(() => null),
      ]).then(([c, s]) => {
        setContracts(c.contracts || []); setContractTotal(c.total);
        if (s) setContractSummary(s);
        setContractsLoaded(true);
      }).catch(() => {});
    }
    if (activeTab === 'lobbying' && !lobbyingLoaded) {
      Promise.all([
        getEnergyCompanyLobbying(companyId, { limit: 100 }),
        getEnergyCompanyLobbySummary(companyId).catch(() => null),
      ]).then(([l, s]) => {
        setLobbying(l.filings || []); setLobbyTotal(l.total);
        if (s) setLobbySummary(s);
        setLobbyingLoaded(true);
      }).catch(() => {});
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getEnergyCompanyEnforcement(companyId, { limit: 100 }).then((r) => {
        setEnforcement(r.actions || []); setEnforcementTotal(r.total);
        setTotalPenalties(r.total_penalties || 0);
        setEnforcementLoaded(true);
      }).catch(() => {});
    }
    if (activeTab === 'filings' && !filingsLoaded) {
      getEnergyCompanyFilings(companyId, { limit: 100 }).then((r) => {
        setFilings(r.filings || []); setFilingTotal(r.total); setFilingsLoaded(true);
      }).catch(() => {});
    }
  }, [activeTab, companyId, emissionsLoaded, contractsLoaded, lobbyingLoaded, enforcementLoaded, filingsLoaded]);

  const tabs = [
    {
      key: 'emissions',
      label: 'Emissions',
      icon: Flame,
      count: emissionTotal,
      render: () => (
        <ProfileSection title="EPA GHG Emissions" icon={Flame} count={emissionTotal} accent={accent}>
          {emissionSummary && (
            <ProfileSummaryGrid accent={accent} items={[
              { label: 'Total CO₂e', value: fmtEmissions(emissionSummary.total_co2e), accent: 'var(--color-red)' },
              { label: 'Records', value: fmtNum(emissionSummary.total_records) },
              ...(emissionSummary.yoy_change_pct != null ? [{
                label: 'YoY Change',
                value: `${emissionSummary.yoy_change_pct >= 0 ? '+' : ''}${emissionSummary.yoy_change_pct.toFixed(1)}%`,
                accent: emissionSummary.yoy_change_pct > 0 ? 'var(--color-red)' : 'var(--color-green)',
              }] : []),
              ...(emissionSummary.climate_lobbying_spend > 0 ? [{
                label: 'Climate Lobbying',
                value: fmtDollar(emissionSummary.climate_lobbying_spend),
              }] : []),
            ]} />
          )}
          <ProfileRecordList
            empty="No emissions records found"
            records={emissions.map((e) => (
              <ProfileRecordCard
                key={e.id}
                accent={accent}
                title={e.facility_name || 'Facility'}
                amount={e.total_emissions != null ? fmtEmissions(e.total_emissions) : undefined}
                amountAccent="var(--color-red)"
                url={e.source_url || null}
                meta={<ProfileRecordMeta items={[
                  ...(e.reporting_year ? [{ value: e.reporting_year }] : []),
                  ...(e.facility_city || e.facility_state ? [{ value: [e.facility_city, e.facility_state].filter(Boolean).join(', ') }] : []),
                  ...(e.industry_type ? [{ value: e.industry_type }] : []),
                  ...(e.emission_type ? [{ value: e.emission_type }] : []),
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
            ]} />
          )}
          <ProfileRecordList
            empty="No contracts found"
            records={contracts.map((c) => (
              <ProfileRecordCard
                key={c.id}
                accent={accent}
                title={c.description || 'Government Contract'}
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
                amount={f.form_type || undefined}
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
      companiesPath="/energy/companies"
    />
  );
}
