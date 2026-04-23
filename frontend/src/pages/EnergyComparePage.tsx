import React, { useEffect, useState } from 'react';
import { Shield, Flame, TrendingUp } from 'lucide-react';
import {
  SectorCompareLayout,
  type CompareMetricGroup,
  type CompareEntity,
} from '../components/sector/SectorCompareLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getEnergyCompanies,
  getEnergyComparison,
  type EnergyCompanyListItem,
  type EnergyComparisonItem,
} from '../api/energy';
import { fmtDollar, fmtNum } from '../utils/format';

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function fmtEmissions(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

const METRIC_GROUPS: CompareMetricGroup[] = [
  {
    title: 'Political Influence',
    icon: Shield,
    iconColor: '#C5A028',
    metrics: [
      { label: 'Lobbying Spend', key: 'lobbying_total', format: fmtDollar },
      { label: 'Gov Contracts', key: 'contract_count', format: fmtNum },
      { label: 'Contract Value', key: 'total_contract_value', format: fmtDollar },
      { label: 'Enforcement Actions', key: 'enforcement_count', format: fmtNum, lowerIsBetter: true },
      { label: 'Total Penalties', key: 'total_penalties', format: fmtDollar, lowerIsBetter: true },
    ],
  },
  {
    title: 'Emissions',
    icon: Flame,
    iconColor: '#E63946',
    metrics: [
      { label: 'Emission Records', key: 'emission_count', format: fmtNum },
      { label: 'Total Emissions (CO2e)', key: 'total_emissions', format: fmtEmissions, lowerIsBetter: true },
    ],
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

type ListRow = EnergyCompanyListItem & { id: string; name: string };
type ComparedRow = EnergyComparisonItem & { id: string; name: string };

const listToDisplay = (co: ListRow): CompareEntity => ({
  id: co.company_id,
  name: co.display_name,
  ticker: co.ticker ?? null,
  subtitle: co.sector_type ? co.sector_type.replace(/_/g, ' ') : null,
  logo: null,
});

const comparedToDisplay = (co: ComparedRow): CompareEntity => ({
  id: co.company_id,
  name: co.display_name,
  ticker: co.ticker ?? null,
  subtitle: co.sector_type ? co.sector_type.replace(/_/g, ' ') : null,
  logo: null,
});

export default function EnergyComparePage() {
  const config = SECTOR_MAP.energy;
  const [allCompanies, setAllCompanies] = useState<ListRow[]>([]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [compared, setCompared] = useState<ComparedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    let stale = false;
    getEnergyCompanies({ limit: 200 })
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
    getEnergyComparison([idA, idB])
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
    getEnergyComparison([idA, idB])
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
      title="Energy comparison"
      subtitle="Side-by-side comparison of emissions, contracts, lobbying, and financials across energy companies."
      dataCredit="EPA + USASPENDING + SENATE LDA + ALPHA VANTAGE"
      footerNote="Emissions via EPA. Contracts via USASpending. Lobbying via Senate LDA."
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
