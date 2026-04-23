import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText, Landmark, Scale, AlertTriangle, Activity, Pill,
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
  getHealthCompanyDetail,
  getHealthCompanyRecalls,
  getHealthCompanyTrials,
  getHealthCompanyPayments,
  getHealthCompanyPaymentSummary,
  getHealthCompanyFilings,
  getHealthCompanyStock,
  getHealthCompanyLobbying,
  getHealthCompanyLobbySummary,
  getHealthCompanyContracts,
  getHealthCompanyEnforcement,
  type CompanyDetail,
  type RecallItem,
  type ClinicalTrialItem,
  type PaymentItem,
  type PaymentSummary,
  type HealthFiling,
  type HealthStockSnapshot,
  type HealthLobbyingFiling,
  type HealthLobbySummary,
  type HealthContractItem,
  type HealthEnforcementAction,
} from '../api/health';

type TabKey = 'lobbying' | 'contracts' | 'enforcement' | 'trials' | 'payments' | 'recalls';

function recallAccent(cls: string | null): string {
  if (!cls) return 'var(--color-text-3)';
  if (cls.includes('I') && !cls.includes('II') && !cls.includes('III')) return 'var(--color-red)';
  if (cls.includes('II') && !cls.includes('III')) return 'var(--color-accent)';
  if (cls.includes('III')) return 'var(--color-dem)';
  return 'var(--color-text-3)';
}

function trialStatusAccent(status: string | null): string {
  if (!status) return 'var(--color-text-3)';
  const lower = status.toLowerCase();
  if (lower.includes('recruit') && !lower.includes('not')) return 'var(--color-green)';
  if (lower.includes('active') || lower.includes('not yet')) return 'var(--color-accent)';
  if (lower.includes('completed')) return 'var(--color-dem)';
  return 'var(--color-red)';
}

export default function HealthCompanyProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const config = SECTOR_MAP.health;
  const accent = config.accent;

  const [activeTab, setActiveTab] = useState<TabKey>('lobbying');
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [stock, setStock] = useState<HealthStockSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<{ years: number[]; series: Record<string, number[]> } | null>(null);

  const [lobbying, setLobbying] = useState<HealthLobbyingFiling[]>([]);
  const [lobbyTotal, setLobbyTotal] = useState(0);
  const [lobbySummary, setLobbySummary] = useState<HealthLobbySummary | null>(null);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);

  const [contracts, setContracts] = useState<HealthContractItem[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  const [enforcement, setEnforcement] = useState<HealthEnforcementAction[]>([]);
  const [enforcementTotal, setEnforcementTotal] = useState(0);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);

  const [trials, setTrials] = useState<ClinicalTrialItem[]>([]);
  const [trialTotal, setTrialTotal] = useState(0);
  const [trialsLoaded, setTrialsLoaded] = useState(false);

  const [recalls, setRecalls] = useState<RecallItem[]>([]);
  const [recallTotal, setRecallTotal] = useState(0);
  const [recallsLoaded, setRecallsLoaded] = useState(false);

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [filings, setFilings] = useState<HealthFiling[]>([]);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getHealthCompanyDetail(companyId),
      getHealthCompanyStock(companyId).catch(() => ({ stock: null })),
    ])
      .then(([d, s]) => {
        if (cancelled) return;
        setDetail(d);
        setStock(s.stock || null);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch(`${getApiBaseUrl()}/health/companies/${encodeURIComponent(companyId)}/trends`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled && d) setTrends(d); })
      .catch((err) => { console.warn('[HealthCompanyProfilePage] fetch failed:', err); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    if (activeTab === 'lobbying' && !lobbyingLoaded) {
      Promise.all([
        getHealthCompanyLobbying(companyId, { limit: 100 }),
        getHealthCompanyLobbySummary(companyId).catch(() => null),
      ]).then(([l, s]) => {
        setLobbying(l.filings || []); setLobbyTotal(l.total);
        if (s) setLobbySummary(s);
        setLobbyingLoaded(true);
      }).catch((err) => { console.warn('[HealthCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'contracts' && !contractsLoaded) {
      getHealthCompanyContracts(companyId, { limit: 100 }).then((r) => {
        setContracts(r.contracts || []); setContractTotal(r.total); setContractsLoaded(true);
      }).catch((err) => { console.warn('[HealthCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'enforcement' && !enforcementLoaded) {
      getHealthCompanyEnforcement(companyId, { limit: 100 }).then((r) => {
        setEnforcement(r.actions || []); setEnforcementTotal(r.total);
        setTotalPenalties(r.total_penalties || 0);
        setEnforcementLoaded(true);
      }).catch((err) => { console.warn('[HealthCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'trials' && !trialsLoaded) {
      getHealthCompanyTrials(companyId, { limit: 100 }).then((r) => {
        setTrials(r.trials || []); setTrialTotal(r.total); setTrialsLoaded(true);
      }).catch((err) => { console.warn('[HealthCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'recalls' && !recallsLoaded) {
      getHealthCompanyRecalls(companyId, { limit: 100 }).then((r) => {
        setRecalls(r.recalls || []); setRecallTotal(r.total); setRecallsLoaded(true);
      }).catch((err) => { console.warn('[HealthCompanyProfilePage] fetch failed:', err); });
    }
    if (activeTab === 'payments' && !paymentsLoaded) {
      Promise.all([
        getHealthCompanyPayments(companyId, { limit: 50 }),
        getHealthCompanyPaymentSummary(companyId).catch(() => null),
        getHealthCompanyFilings(companyId, { limit: 20 }),
      ]).then(([p, s, f]) => {
        setPayments(p.payments || []);
        if (s) setPaymentSummary(s);
        setFilings(f.filings || []);
        setPaymentsLoaded(true);
      }).catch((err) => { console.warn('[HealthCompanyProfilePage] fetch failed:', err); });
    }
  }, [activeTab, companyId, lobbyingLoaded, contractsLoaded, enforcementLoaded, trialsLoaded, recallsLoaded, paymentsLoaded]);

  const profileDetail = detail ? {
    company_id: detail.company_id,
    display_name: detail.display_name,
    ticker: detail.ticker,
    sector_type: detail.sector_type,
    headquarters: detail.headquarters,
    logo_url: detail.logo_url,
    sec_cik: detail.sec_cik,
    sanctions_status: detail.sanctions_status,
    ai_profile_summary: detail.ai_profile_summary,
    enforcement_count: detail.enforcement_count,
  } : null;

  const profileStock = stock ? {
    market_cap: stock.market_cap,
    pe_ratio: stock.pe_ratio,
    profit_margin: stock.profit_margin,
  } : null;

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
              { label: 'Total Spend', value: fmtDollar(lobbySummary.total_income) },
            ]} />
          )}
          <ProfileRecordList
            empty="No lobbying filings found"
            records={lobbying.map((f) => (
              <ProfileRecordCard
                key={f.id}
                accent={accent}
                title={f.registrant_name || 'Lobbying Filing'}
                amount={f.income != null && f.income > 0 ? fmtDollar(f.income) : undefined}
                amountAccent="var(--color-green)"
                description={f.lobbying_issues || null}
                url={f.filing_uuid ? `https://lda.senate.gov/filings/filing/${f.filing_uuid}/` : null}
                meta={<ProfileRecordMeta items={[
                  ...(f.filing_year ? [{ value: `${f.filing_year} ${f.filing_period || ''}`.trim() }] : []),
                  ...(f.government_entities ? [{ value: f.government_entities }] : []),
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
            records={enforcement.map((a) => (
              <ProfileRecordCard
                key={a.id}
                accent={accent}
                title={a.case_title || 'Enforcement Action'}
                amount={a.penalty_amount != null && a.penalty_amount > 0 ? fmtDollar(a.penalty_amount) : undefined}
                amountAccent="var(--color-red)"
                description={a.description || null}
                url={a.case_url || null}
                meta={<ProfileRecordMeta items={[
                  ...(a.source ? [{ value: a.source, accent: 'var(--color-red)' }] : []),
                  ...(a.enforcement_type ? [{ value: a.enforcement_type }] : []),
                  ...(a.case_date ? [{ value: fmtDate(a.case_date) }] : []),
                ]} />}
              />
            ))}
          />
        </ProfileSection>
      ),
    },
    {
      key: 'trials',
      label: 'Drug Pipeline',
      icon: Activity,
      count: trialTotal,
      render: () => (
        <ProfileSection title="Clinical Trials" icon={Activity} count={trialTotal} accent={accent}>
          <ProfileRecordList
            empty="No clinical trials on record"
            records={trials.map((t) => (
              <ProfileRecordCard
                key={t.id}
                accent={accent}
                title={t.title || 'Untitled Trial'}
                amount={t.phase || undefined}
                url={t.nct_id ? `https://clinicaltrials.gov/study/${t.nct_id}` : null}
                description={t.conditions || null}
                meta={<ProfileRecordMeta items={[
                  ...(t.overall_status ? [{ value: t.overall_status, accent: trialStatusAccent(t.overall_status) }] : []),
                  ...(t.nct_id ? [{ value: t.nct_id }] : []),
                  ...(t.enrollment != null ? [{ value: `Target: ${t.enrollment.toLocaleString()}` }] : []),
                ]} />}
              />
            ))}
          />
        </ProfileSection>
      ),
    },
    {
      key: 'payments',
      label: 'Payments & Filings',
      icon: FileText,
      count: payments.length + filings.length,
      render: () => (
        <>
          <ProfileSection title="CMS Open Payments" icon={FileText} count={payments.length} accent={accent}>
            {paymentSummary && (
              <ProfileSummaryGrid accent={accent} items={[
                { label: 'Total Payments', value: fmtNum(paymentSummary.total_payments) },
                { label: 'Total Amount', value: fmtDollar(paymentSummary.total_amount), accent: 'var(--color-red)' },
                { label: 'Categories', value: fmtNum(Object.keys(paymentSummary.by_nature).length) },
                { label: 'Specialties', value: fmtNum(Object.keys(paymentSummary.by_specialty).length) },
              ]} />
            )}
            <ProfileRecordList
              empty="No payment records found"
              records={payments.slice(0, 30).map((p) => (
                <ProfileRecordCard
                  key={p.id}
                  accent={accent}
                  title={p.physician_name || 'Unknown Physician'}
                  amount={p.amount != null ? fmtDollar(p.amount) : undefined}
                  amountAccent="var(--color-red)"
                  meta={<ProfileRecordMeta items={[
                    ...(p.payment_nature ? [{ value: p.payment_nature, accent: 'var(--color-dem)' }] : []),
                    ...(p.physician_specialty ? [{ value: p.physician_specialty }] : []),
                    ...(p.state ? [{ value: p.state }] : []),
                    ...(p.payment_date ? [{ value: fmtDate(p.payment_date) }] : []),
                  ]} />}
                />
              ))}
            />
          </ProfileSection>
          <ProfileSection title="SEC Filings" icon={FileText} count={filings.length} accent={accent}>
            <ProfileRecordList
              empty="No SEC filings found"
              records={filings.map((f) => (
                <ProfileRecordCard
                  key={f.id}
                  accent={accent}
                  title={f.description || f.form_type || 'Filing'}
                  amount={f.form_type || undefined}
                  url={f.primary_doc_url || f.filing_url || null}
                  meta={<ProfileRecordMeta items={[
                    ...(f.filing_date ? [{ value: fmtDate(f.filing_date) }] : []),
                  ]} />}
                />
              ))}
            />
          </ProfileSection>
        </>
      ),
    },
    {
      key: 'recalls',
      label: 'Recalls',
      icon: Pill,
      count: recallTotal,
      render: () => (
        <ProfileSection title="FDA Recalls" icon={Pill} count={recallTotal} accent={accent}>
          <ProfileRecordList
            empty="No FDA recalls on record"
            records={recalls.map((r) => (
              <ProfileRecordCard
                key={r.id}
                accent={accent}
                title={r.product_description || 'Product Recall'}
                amount={r.classification || undefined}
                amountAccent={recallAccent(r.classification)}
                description={r.reason_for_recall || null}
                meta={<ProfileRecordMeta items={[
                  ...(r.status ? [{ value: r.status.toUpperCase(), accent: r.status.toLowerCase().includes('ongoing') ? 'var(--color-red)' : undefined }] : []),
                  ...(r.recall_number ? [{ value: r.recall_number }] : []),
                  ...(r.recall_initiation_date ? [{ value: fmtDate(r.recall_initiation_date) }] : []),
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
      detail={profileDetail}
      stock={profileStock}
      trends={trends}
      tabs={tabs}
      activeTab={activeTab}
      onChangeTab={(k) => setActiveTab(k as TabKey)}
      loading={loading}
      error={error}
      companyIdParam={companyId || ''}
      companiesPath="/health/companies"
    />
  );
}
