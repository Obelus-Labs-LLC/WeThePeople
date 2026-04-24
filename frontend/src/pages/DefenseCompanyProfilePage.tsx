import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText, Landmark, Shield, DollarSign, Newspaper,
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
import { fmtDollar, fmtNum } from '../utils/format';
import {
  getDefenseCompanyDetail,
  getDefenseCompanyContracts,
  getDefenseCompanyContractSummary,
  getDefenseCompanyLobbying,
  getDefenseCompanyLobbySummary,
  getDefenseCompanyEnforcement,
  getDefenseCompanyFilings,
  getDefenseCompanyStock,
  getDefenseCompanyDonations,
  getDefenseCompanyNews,
  type DefenseCompanyDetail,
  type DefenseContractItem,
  type DefenseContractSummary,
  type DefenseLobbyingItem,
  type DefenseLobbySummary,
  type DefenseEnforcementItem,
  type DefenseFilingItem,
  type DefenseStockData,
  type DefenseDonationItem,
  type DefenseNewsItem,
} from '../api/defense';

type TabKey = 'contracts' | 'lobbying' | 'enforcement' | 'donations' | 'filings' | 'news';

export default function DefenseCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const config = SECTOR_MAP.defense;
  const accent = config.accent;

  const [activeTab, setActiveTab] = useState<TabKey>('contracts');
  const [detail, setDetail] = useState<DefenseCompanyDetail | null>(null);
  const [stock, setStock] = useState<DefenseStockData['latest_stock']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  const [contracts, setContracts] = useState<DefenseContractItem[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [contractSummary, setContractSummary] = useState<DefenseContractSummary | null>(null);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  const [lobbying, setLobbying] = useState<DefenseLobbyingItem[]>([]);
  const [lobbyTotal, setLobbyTotal] = useState(0);
  const [lobbySummary, setLobbySummary] = useState<DefenseLobbySummary | null>(null);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);

  const [enforcement, setEnforcement] = useState<DefenseEnforcementItem[]>([]);
  const [enforcementTotal, setEnforcementTotal] = useState(0);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);

  const [filings, setFilings] = useState<DefenseFilingItem[]>([]);
  const [filingTotal, setFilingTotal] = useState(0);
  const [filingsLoaded, setFilingsLoaded] = useState(false);

  const [donations, setDonations] = useState<DefenseDonationItem[]>([]);
  const [donationTotal, setDonationTotal] = useState(0);
  const [donationTotalAmount, setDonationTotalAmount] = useState(0);
  const [donationsLoaded, setDonationsLoaded] = useState(false);

  const [news, setNews] = useState<DefenseNewsItem[]>([]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getDefenseCompanyDetail(companyId),
      getDefenseCompanyStock(companyId).catch(() => ({ latest_stock: null } as DefenseStockData)),
    ])
      .then(([d, s]) => {
        if (cancelled) return;
        setDetail(d);
        setStock(s.latest_stock || null);
        getDefenseCompanyNews(d.display_name, 5)
          .then((r) => { if (!cancelled) setNews(r.articles || []); })
          .catch((err) => { console.warn('[DefenseCompanyProfilePage] fetch failed:', err); });
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch(`${getApiBaseUrl()}/defense/companies/${encodeURIComponent(companyId)}/trends`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d && !cancelled) setTrends(d); })
      .catch((err) => { console.warn('[DefenseCompanyProfilePage] fetch failed:', err); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    // Guard against setState after unmount or tab switch: a slow response
    // could otherwise update state the user has already navigated away from.
    let cancelled = false;
    if (activeTab === 'contracts' && !contractsLoaded) {
      Promise.all([
        getDefenseCompanyContracts(companyId, { limit: 100 }),
        getDefenseCompanyContractSummary(companyId).catch(() => null),
      ]).then(([c, s]) => {
        if (cancelled) return;
        setContracts(c.contracts || []); setContractTotal(c.total);
        if (s) setContractSummary(s);
        setContractsLoaded(true);
      }).catch((err) => { console.warn('[DefenseCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'lobbying' && !lobbyingLoaded) {
      Promise.all([
        getDefenseCompanyLobbying(companyId, { limit: 100 }),
        getDefenseCompanyLobbySummary(companyId).catch(() => null),
      ]).then(([l, s]) => {
        if (cancelled) return;
        setLobbying(l.filings || []); setLobbyTotal(l.total);
        if (s) setLobbySummary(s);
        setLobbyingLoaded(true);
      }).catch((err) => { console.warn('[DefenseCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getDefenseCompanyEnforcement(companyId, { limit: 100 }).then((r) => {
        if (cancelled) return;
        setEnforcement(r.actions || []); setEnforcementTotal(r.total);
        setTotalPenalties(r.total_penalties || 0);
        setEnforcementLoaded(true);
      }).catch((err) => { console.warn('[DefenseCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'filings' && !filingsLoaded) {
      getDefenseCompanyFilings(companyId, { limit: 100 }).then((r) => {
        if (cancelled) return;
        setFilings(r.filings || []); setFilingTotal(r.total); setFilingsLoaded(true);
      }).catch((err) => { console.warn('[DefenseCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'donations' && !donationsLoaded) {
      getDefenseCompanyDonations(companyId, { limit: 100 }).then((r) => {
        if (cancelled) return;
        setDonations(r.donations || []); setDonationTotal(r.total);
        setDonationTotalAmount(r.total_amount || 0); setDonationsLoaded(true);
      }).catch((err) => { console.warn('[DefenseCompanyProfilePage] fetch failed:', err); });
    }
    return () => { cancelled = true; };
  }, [activeTab, companyId, contractsLoaded, lobbyingLoaded, enforcementLoaded, filingsLoaded, donationsLoaded]);

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
              { label: 'Total Value', value: fmtDollar(contractSummary.total_amount) },
              { label: 'Total Contracts', value: fmtNum(contractSummary.total_contracts) },
            ]} />
          )}
          <ProfileRecordList
            empty="No contracts found"
            records={contracts.map((ct) => (
              <ProfileRecordCard
                key={ct.id}
                accent={accent}
                title={ct.description || 'Contract Award'}
                amount={ct.award_amount != null ? fmtDollar(ct.award_amount) : undefined}
                amountAccent="var(--color-green)"
                meta={<ProfileRecordMeta items={[
                  ...(ct.awarding_agency ? [{ value: ct.awarding_agency }] : []),
                  ...(ct.start_date ? [{ value: ct.start_date }] : []),
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
      icon: DollarSign,
      count: lobbyTotal,
      render: () => (
        <ProfileSection title="Lobbying Disclosures" icon={DollarSign} count={lobbyTotal} accent={accent}>
          {lobbySummary && (
            <ProfileSummaryGrid accent={accent} items={[
              { label: 'Total Income', value: fmtDollar(lobbySummary.total_income) },
              { label: 'Total Filings', value: fmtNum(lobbySummary.total_filings) },
            ]} />
          )}
          <ProfileRecordList
            empty="No lobbying filings found"
            records={lobbying.map((r) => (
              <ProfileRecordCard
                key={r.id}
                accent={accent}
                title={r.client_name || r.registrant_name || 'Filing'}
                amount={r.income != null ? fmtDollar(r.income) : undefined}
                amountAccent="var(--color-green)"
                description={r.lobbying_issues || null}
                meta={<ProfileRecordMeta items={[
                  { value: `${r.filing_year} ${r.filing_period || ''}`.trim() },
                  ...(r.registrant_name ? [{ value: r.registrant_name }] : []),
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
      icon: Shield,
      count: enforcementTotal,
      render: () => (
        <ProfileSection title="Enforcement Actions" icon={Shield} count={enforcementTotal} accent={accent}>
          {totalPenalties > 0 && (
            <ProfileSummaryGrid accent={accent} items={[
              { label: 'Total Penalties', value: fmtDollar(totalPenalties), accent: 'var(--color-red)' },
            ]} />
          )}
          <ProfileRecordList
            empty="No enforcement actions found"
            records={enforcement.map((a) => (
              <ProfileRecordCard
                key={a.id}
                accent={accent}
                title={a.case_title}
                amount={a.penalty_amount != null && a.penalty_amount > 0 ? fmtDollar(a.penalty_amount) : undefined}
                amountAccent="var(--color-red)"
                url={a.case_url || null}
                meta={<ProfileRecordMeta items={[
                  ...(a.enforcement_type ? [{ value: a.enforcement_type, accent: 'var(--color-red)' }] : []),
                  ...(a.source ? [{ value: a.source }] : []),
                  ...(a.case_date ? [{ value: a.case_date }] : []),
                ]} />}
              />
            ))}
          />
        </ProfileSection>
      ),
    },
    {
      key: 'donations',
      label: 'Donations',
      icon: DollarSign,
      count: donationTotal,
      render: () => (
        <ProfileSection title="PAC Donations" icon={DollarSign} count={donationTotal} accent={accent}>
          {donationTotalAmount > 0 && (
            <ProfileSummaryGrid accent={accent} items={[
              { label: 'Total Donated', value: fmtDollar(donationTotalAmount) },
            ]} />
          )}
          <ProfileRecordList
            empty="No donation records found"
            records={donations.map((d) => (
              <ProfileRecordCard
                key={d.id}
                accent={accent}
                title={d.candidate_name || d.committee_name || 'Donation'}
                amount={d.amount != null ? fmtDollar(d.amount) : undefined}
                amountAccent="var(--color-green)"
                meta={<ProfileRecordMeta items={[
                  ...(d.committee_name ? [{ value: d.committee_name }] : []),
                  ...(d.cycle ? [{ label: 'Cycle', value: d.cycle }] : []),
                  ...(d.donation_date ? [{ value: d.donation_date }] : []),
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
                title={f.description || f.accession_number}
                amount={f.form_type}
                url={f.primary_doc_url || null}
                meta={<ProfileRecordMeta items={[
                  ...(f.filing_date ? [{ value: f.filing_date }] : []),
                ]} />}
              />
            ))}
          />
        </ProfileSection>
      ),
    },
    {
      key: 'news',
      label: 'News',
      icon: Newspaper,
      count: news.length,
      render: () => (
        <ProfileSection title="Recent News" icon={Newspaper} count={news.length} accent={accent}>
          <ProfileRecordList
            empty="No news articles found"
            records={news.map((n, i) => (
              <ProfileRecordCard
                key={i}
                accent={accent}
                title={n.title}
                url={n.link}
                meta={<ProfileRecordMeta items={[
                  ...(n.source ? [{ value: n.source }] : []),
                  ...(n.published ? [{ value: n.published }] : []),
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
      companiesPath="/defense/companies"
    />
  );
}
