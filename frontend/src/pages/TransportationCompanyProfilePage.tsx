import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText, Landmark, Scale, AlertTriangle, Car, Newspaper,
  DollarSign, Star,
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
  getTransportationCompanyDetail,
  getTransportationCompanyContracts,
  getTransportationCompanyContractSummary,
  getTransportationCompanyLobbying,
  getTransportationCompanyLobbySummary,
  getTransportationCompanyEnforcement,
  getTransportationCompanyFilings,
  getTransportationCompanyStock,
  getTransportationCompanyRecalls,
  getTransportationCompanyComplaints,
  getTransportationCompanySafetyRatings,
  getTransportationCompanyDonations,
  getTransportationCompanyNews,
  type TransportationCompanyDetail,
  type TransportationContractItem,
  type TransportationContractSummary,
  type TransportationLobbyingItem,
  type TransportationLobbySummary,
  type TransportationEnforcementItem,
  type TransportationFilingItem,
  type TransportationStockData,
  type TransportationRecallItem,
  type TransportationComplaintItem,
  type TransportationSafetyRatingItem,
  type TransportationDonationItem,
  type TransportationNewsItem,
} from '../api/transportation';

type TabKey = 'contracts' | 'lobbying' | 'enforcement' | 'recalls' | 'complaints' | 'safety_ratings' | 'donations' | 'filings' | 'news';

export default function TransportationCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const config = SECTOR_MAP.transportation;
  const accent = config.accent;

  const [activeTab, setActiveTab] = useState<TabKey>('contracts');
  const [detail, setDetail] = useState<TransportationCompanyDetail | null>(null);
  const [stock, setStock] = useState<TransportationStockData['latest_stock']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  const [contracts, setContracts] = useState<TransportationContractItem[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [contractSummary, setContractSummary] = useState<TransportationContractSummary | null>(null);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  const [lobbying, setLobbying] = useState<TransportationLobbyingItem[]>([]);
  const [lobbyTotal, setLobbyTotal] = useState(0);
  const [lobbySummary, setLobbySummary] = useState<TransportationLobbySummary | null>(null);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);

  const [enforcement, setEnforcement] = useState<TransportationEnforcementItem[]>([]);
  const [enforcementTotal, setEnforcementTotal] = useState(0);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);

  const [recalls, setRecalls] = useState<TransportationRecallItem[]>([]);
  const [recallTotal, setRecallTotal] = useState(0);
  const [recallsLoaded, setRecallsLoaded] = useState(false);

  const [complaints, setComplaints] = useState<TransportationComplaintItem[]>([]);
  const [complaintTotal, setComplaintTotal] = useState(0);
  const [complaintsLoaded, setComplaintsLoaded] = useState(false);

  const [safetyRatings, setSafetyRatings] = useState<TransportationSafetyRatingItem[]>([]);
  const [safetyRatingsTotal, setSafetyRatingsTotal] = useState(0);
  const [safetyRatingsLoaded, setSafetyRatingsLoaded] = useState(false);
  const [avgOverallRating, setAvgOverallRating] = useState<number | null>(null);

  const [donations, setDonations] = useState<TransportationDonationItem[]>([]);
  const [donationTotal, setDonationTotal] = useState(0);
  const [donationTotalAmount, setDonationTotalAmount] = useState(0);
  const [donationsLoaded, setDonationsLoaded] = useState(false);

  const [filings, setFilings] = useState<TransportationFilingItem[]>([]);
  const [filingTotal, setFilingTotal] = useState(0);
  const [filingsLoaded, setFilingsLoaded] = useState(false);

  const [news, setNews] = useState<TransportationNewsItem[]>([]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getTransportationCompanyDetail(companyId),
      getTransportationCompanyStock(companyId).catch(() => ({ latest_stock: null } as TransportationStockData)),
    ])
      .then(([d, s]) => {
        if (cancelled) return;
        setDetail(d);
        setStock(s.latest_stock || null);
        getTransportationCompanyNews(d.display_name, 5)
          .then((r) => { if (!cancelled) setNews(r.articles || []); })
          .catch((err) => { console.warn('[TransportationCompanyProfilePage] fetch failed:', err); });
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch(`${getApiBaseUrl()}/transportation/companies/${encodeURIComponent(companyId)}/trends`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d && !cancelled) setTrends(d); })
      .catch((err) => { console.warn('[TransportationCompanyProfilePage] fetch failed:', err); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    // Prevent setState after unmount / tab switch mid-request.
    let cancelled = false;
    if (activeTab === 'contracts' && !contractsLoaded) {
      Promise.all([
        getTransportationCompanyContracts(companyId, { limit: 100 }),
        getTransportationCompanyContractSummary(companyId).catch(() => null),
      ]).then(([c, s]) => {
        if (cancelled) return;
        setContracts(c.contracts || []); setContractTotal(c.total);
        if (s) setContractSummary(s);
        setContractsLoaded(true);
      }).catch((err) => { console.warn('[TransportationCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'lobbying' && !lobbyingLoaded) {
      Promise.all([
        getTransportationCompanyLobbying(companyId, { limit: 100 }),
        getTransportationCompanyLobbySummary(companyId).catch(() => null),
      ]).then(([l, s]) => {
        if (cancelled) return;
        setLobbying(l.filings || []); setLobbyTotal(l.total);
        if (s) setLobbySummary(s);
        setLobbyingLoaded(true);
      }).catch((err) => { console.warn('[TransportationCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getTransportationCompanyEnforcement(companyId, { limit: 100 }).then((r) => {
        if (cancelled) return;
        setEnforcement(r.actions || []); setEnforcementTotal(r.total);
        setTotalPenalties(r.total_penalties || 0);
        setEnforcementLoaded(true);
      }).catch((err) => { console.warn('[TransportationCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'recalls' && !recallsLoaded) {
      getTransportationCompanyRecalls(companyId, { limit: 100 }).then((r) => {
        if (cancelled) return;
        setRecalls(r.recalls || []); setRecallTotal(r.total); setRecallsLoaded(true);
      }).catch((err) => { console.warn('[TransportationCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'complaints' && !complaintsLoaded) {
      getTransportationCompanyComplaints(companyId, { limit: 100 }).then((r) => {
        if (cancelled) return;
        setComplaints(r.complaints || []); setComplaintTotal(r.total); setComplaintsLoaded(true);
      }).catch((err) => { console.warn('[TransportationCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'safety_ratings' && !safetyRatingsLoaded) {
      getTransportationCompanySafetyRatings(companyId, { limit: 100 }).then((r) => {
        if (cancelled) return;
        setSafetyRatings(r.ratings || []); setSafetyRatingsTotal(r.total);
        setAvgOverallRating(r.avg_overall_rating);
        setSafetyRatingsLoaded(true);
      }).catch((err) => { console.warn('[TransportationCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'donations' && !donationsLoaded) {
      getTransportationCompanyDonations(companyId, { limit: 100 }).then((r) => {
        if (cancelled) return;
        setDonations(r.donations || []); setDonationTotal(r.total);
        setDonationTotalAmount(r.total_amount || 0); setDonationsLoaded(true);
      }).catch((err) => { console.warn('[TransportationCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'filings' && !filingsLoaded) {
      getTransportationCompanyFilings(companyId, { limit: 100 }).then((r) => {
        if (cancelled) return;
        setFilings(r.filings || []); setFilingTotal(r.total); setFilingsLoaded(true);
      }).catch((err) => { console.warn('[TransportationCompanyProfilePage] fetch failed:', err); });
    }
    return () => { cancelled = true; };
  }, [activeTab, companyId, contractsLoaded, lobbyingLoaded, enforcementLoaded, recallsLoaded, complaintsLoaded, safetyRatingsLoaded, donationsLoaded, filingsLoaded]);

  const vehicleLabel = (make?: string | null, model?: string | null, year?: number | null) =>
    [year, make, model].filter(Boolean).join(' ') || 'Vehicle';

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
      key: 'recalls',
      label: 'Recalls',
      icon: AlertTriangle,
      count: recallTotal,
      render: () => (
        <ProfileSection title="Vehicle Recalls" icon={AlertTriangle} count={recallTotal} accent={accent}>
          <ProfileRecordList
            empty="No recalls found"
            records={recalls.map((r) => (
              <ProfileRecordCard
                key={r.id}
                accent={accent}
                title={vehicleLabel(r.make, r.model, r.model_year)}
                amount={r.recall_number || undefined}
                description={r.summary || r.consequence || r.remedy || null}
                meta={<ProfileRecordMeta items={[
                  ...(r.component ? [{ value: r.component, accent: 'var(--color-red)' }] : []),
                  ...(r.recall_date ? [{ value: fmtDate(r.recall_date) }] : []),
                  ...(r.manufacturer ? [{ value: r.manufacturer }] : []),
                ]} />}
              />
            ))}
          />
        </ProfileSection>
      ),
    },
    {
      key: 'complaints',
      label: 'Complaints',
      icon: AlertTriangle,
      count: complaintTotal,
      render: () => (
        <ProfileSection title="NHTSA Complaints" icon={AlertTriangle} count={complaintTotal} accent={accent}>
          <ProfileRecordList
            empty="No complaints found"
            records={complaints.map((c) => {
              const flags = [
                c.crash ? 'Crash' : null,
                c.fire ? 'Fire' : null,
                c.injuries > 0 ? `${c.injuries} injur${c.injuries === 1 ? 'y' : 'ies'}` : null,
                c.deaths > 0 ? `${c.deaths} death${c.deaths === 1 ? '' : 's'}` : null,
              ].filter(Boolean);
              return (
                <ProfileRecordCard
                  key={c.id}
                  accent={accent}
                  title={vehicleLabel(c.make, c.model, c.model_year)}
                  amount={c.odi_number || undefined}
                  description={c.summary || null}
                  meta={<ProfileRecordMeta items={[
                    ...(c.component ? [{ value: c.component }] : []),
                    ...(c.date_of_complaint ? [{ value: fmtDate(c.date_of_complaint) }] : []),
                    ...flags.map((f) => ({ value: f!, accent: 'var(--color-red)' })),
                  ]} />}
                />
              );
            })}
          />
        </ProfileSection>
      ),
    },
    {
      key: 'safety_ratings',
      label: 'Safety Ratings',
      icon: Star,
      count: safetyRatingsTotal,
      render: () => (
        <ProfileSection title="NHTSA Safety Ratings" icon={Star} count={safetyRatingsTotal} accent={accent}>
          {avgOverallRating != null && (
            <ProfileSummaryGrid accent={accent} items={[
              { label: 'Average Overall Rating', value: `${avgOverallRating.toFixed(2)} / 5` },
            ]} />
          )}
          <ProfileRecordList
            empty="No safety ratings found"
            records={safetyRatings.map((r) => (
              <ProfileRecordCard
                key={r.id}
                accent={accent}
                title={vehicleLabel(r.make, r.model, r.model_year)}
                amount={r.overall_rating != null ? `${r.overall_rating} / 5` : undefined}
                amountAccent={r.overall_rating != null && r.overall_rating >= 4 ? 'var(--color-green)' : r.overall_rating != null && r.overall_rating <= 2 ? 'var(--color-red)' : undefined}
                meta={<ProfileRecordMeta items={[
                  ...(r.frontal_crash_rating != null ? [{ label: 'Frontal', value: r.frontal_crash_rating }] : []),
                  ...(r.side_crash_rating != null ? [{ label: 'Side', value: r.side_crash_rating }] : []),
                  ...(r.rollover_rating != null ? [{ label: 'Rollover', value: r.rollover_rating }] : []),
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
                url={d.source_url || null}
                meta={<ProfileRecordMeta items={[
                  ...(d.committee_name ? [{ value: d.committee_name }] : []),
                  ...(d.cycle ? [{ label: 'Cycle', value: d.cycle }] : []),
                  ...(d.donation_date ? [{ value: fmtDate(d.donation_date) }] : []),
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
      companiesPath="/transportation/companies"
    />
  );
}
