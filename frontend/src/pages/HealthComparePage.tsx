import React, { useEffect, useState } from 'react';
import { Shield, AlertTriangle, FlaskConical, TrendingUp } from 'lucide-react';
import {
  SectorCompareLayout,
  type CompareMetricGroup,
  type CompareEntity,
} from '../components/sector/SectorCompareLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import { getHealthCompanies, type CompanyListItem } from '../api/health';
import { fmtDollar, fmtNum } from '../utils/format';
import { getApiBaseUrl } from '../api/client';

// ── Types ──

interface HealthComparisonItem {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  adverse_event_count: number;
  recall_count: number;
  trial_count: number;
  contract_count: number;
  total_contract_value: number;
  lobbying_total: number;
  enforcement_count: number;
  total_penalties: number;
  market_cap: number | null;
  pe_ratio: number | null;
  profit_margin: number | null;
}

interface HealthComparisonResponse {
  companies: HealthComparisonItem[];
}

async function getHealthComparison(ids: string[]): Promise<HealthComparisonResponse> {
  const API_BASE = getApiBaseUrl();
  const url = `${API_BASE}/health/compare?ids=${ids.map((id) => encodeURIComponent(id)).join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── Helpers ──

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

// ── Metric groups ──

const METRIC_GROUPS: CompareMetricGroup[] = [
  {
    title: 'Political Influence',
    icon: Shield,
    iconColor: '#E63946',
    metrics: [
      { label: 'Lobbying Spend', key: 'lobbying_total', format: fmtDollar },
      { label: 'Gov Contracts', key: 'contract_count', format: fmtNum },
      { label: 'Contract Value', key: 'total_contract_value', format: fmtDollar },
      { label: 'Enforcement Actions', key: 'enforcement_count', format: fmtNum, lowerIsBetter: true },
      { label: 'Total Penalties', key: 'total_penalties', format: fmtDollar, lowerIsBetter: true },
    ],
  },
  {
    title: 'Safety & Compliance',
    icon: AlertTriangle,
    iconColor: '#D4AE35',
    metrics: [
      { label: 'Adverse Events', key: 'adverse_event_count', format: fmtNum, lowerIsBetter: true },
      { label: 'Active Recalls', key: 'recall_count', format: fmtNum, lowerIsBetter: true },
    ],
  },
  {
    title: 'Clinical Pipeline',
    icon: FlaskConical,
    iconColor: '#B06FD8',
    metrics: [{ label: 'Clinical Trials', key: 'trial_count', format: fmtNum }],
  },
  {
    title: 'Financials',
    icon: TrendingUp,
    iconColor: '#3DB87A',
    metrics: [
      { label: 'Market Cap', key: 'market_cap', format: fmtDollar },
      { label: 'P/E Ratio', key: 'pe_ratio', format: (v) => (v != null ? v.toFixed(1) : '—') },
      { label: 'Profit Margin', key: 'profit_margin', format: fmtPct },
    ],
  },
];

// ── Entity adapters ──

type ListRow = CompanyListItem & { id: string; name: string };
type ComparedRow = HealthComparisonItem & { id: string; name: string };

function listToDisplay(co: ListRow): CompareEntity {
  return {
    id: co.company_id,
    name: co.display_name,
    ticker: co.ticker ?? null,
    subtitle: co.sector_type || null,
    logo: null,
  };
}

function comparedToDisplay(co: ComparedRow): CompareEntity {
  return {
    id: co.company_id,
    name: co.display_name,
    ticker: co.ticker ?? null,
    subtitle: co.sector_type || null,
    logo: null,
  };
}

// ── Page ──

export default function HealthComparePage() {
  const config = SECTOR_MAP.health;
  const [allCompanies, setAllCompanies] = useState<ListRow[]>([]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [compared, setCompared] = useState<ComparedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    let stale = false;
    getHealthCompanies({ limit: 200 })
      .then((res) => {
        if (stale) return;
        const list = (res.companies || []).map((c) => ({
          ...c,
          id: c.company_id,
          name: c.display_name,
        })) as ListRow[];
        setAllCompanies(list);
        if (list.length >= 2) {
          setIdA(list[0].company_id);
          setIdB(list[1].company_id);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, []);

  function handleCompare() {
    if (!idA || !idB || idA === idB) return;
    setComparing(true);
    getHealthComparison([idA, idB])
      .then((res) => {
        const mapped = (res.companies || []).map((c) => ({
          ...c,
          id: c.company_id,
          name: c.display_name,
        })) as ComparedRow[];
        setCompared(mapped);
      })
      .catch(() => {})
      .finally(() => setComparing(false));
  }

  useEffect(() => {
    if (!idA || !idB || idA === idB || compared.length !== 0 || comparing) return;
    let stale = false;
    setComparing(true);
    getHealthComparison([idA, idB])
      .then((res) => {
        if (stale) return;
        const mapped = (res.companies || []).map((c) => ({
          ...c,
          id: c.company_id,
          name: c.display_name,
        })) as ComparedRow[];
        setCompared(mapped);
      })
      .catch(() => {})
      .finally(() => {
        if (!stale) setComparing(false);
      });
    return () => {
      stale = true;
    };
  }, [idA, idB]);

  return (
    <SectorCompareLayout<ListRow, ComparedRow>
      config={config}
      title="Health comparison"
      subtitle="Side-by-side comparison of political influence, safety, clinical pipeline, and financials across health companies."
      dataCredit="FDA + CLINICALTRIALS.GOV + USASPENDING + SENATE LDA"
      footerNote="Adverse events via FDA FAERS. Trials via ClinicalTrials.gov. Contracts via USASpending."
      entities={allCompanies}
      compared={compared}
      entityToDisplay={listToDisplay}
      comparedToDisplay={comparedToDisplay}
      metricGroups={METRIC_GROUPS}
      idA={idA}
      idB={idB}
      onChangeA={setIdA}
      onChangeB={setIdB}
      onCompare={handleCompare}
      loading={loading}
      comparing={comparing}
      labelA="Company A"
      labelB="Company B"
    />
  );
}
