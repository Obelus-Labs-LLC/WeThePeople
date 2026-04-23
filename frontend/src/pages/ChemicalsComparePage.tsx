import React, { useEffect, useState } from 'react';
import { Shield, TrendingUp } from 'lucide-react';
import {
  SectorCompareLayout,
  type CompareMetricGroup,
  type CompareEntity,
} from '../components/sector/SectorCompareLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getChemicalsCompanies,
  getChemicalsComparison,
  type ChemicalCompanyListItem,
  type ChemicalComparisonItem,
} from '../api/chemicals';
import { fmtDollar, fmtNum } from '../utils/format';

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

const METRIC_GROUPS: CompareMetricGroup[] = [
  {
    title: 'Political Influence',
    icon: Shield,
    iconColor: '#B06FD8',
    metrics: [
      { label: 'Lobbying Spend', key: 'lobbying_total', format: fmtDollar },
      { label: 'Gov Contracts', key: 'contract_count', format: fmtNum },
      { label: 'Contract Value', key: 'total_contract_value', format: fmtDollar },
      { label: 'Enforcement Actions', key: 'enforcement_count', format: fmtNum, lowerIsBetter: true },
      { label: 'Total Penalties', key: 'total_penalties', format: fmtDollar, lowerIsBetter: true },
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

type ListRow = ChemicalCompanyListItem & { id: string; name: string };
type ComparedRow = ChemicalComparisonItem & { id: string; name: string };

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

export default function ChemicalsComparePage() {
  const config = SECTOR_MAP.chemicals;
  const [allCompanies, setAllCompanies] = useState<ListRow[]>([]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [compared, setCompared] = useState<ComparedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    let stale = false;
    getChemicalsCompanies({ limit: 200 })
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
      .catch((err) => { console.warn('[ChemicalsComparePage] fetch failed:', err); })
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
    getChemicalsComparison([idA, idB])
      .then((res) => {
        const mapped = (res.companies || []).map((c) => ({
          ...c,
          id: c.company_id,
          name: c.display_name,
        })) as ComparedRow[];
        setCompared(mapped);
      })
      .catch((err) => { console.warn('[ChemicalsComparePage] fetch failed:', err); })
      .finally(() => setComparing(false));
  }

  useEffect(() => {
    if (!idA || !idB || idA === idB || compared.length !== 0 || comparing) return;
    let stale = false;
    setComparing(true);
    getChemicalsComparison([idA, idB])
      .then((res) => {
        if (stale) return;
        const mapped = (res.companies || []).map((c) => ({
          ...c,
          id: c.company_id,
          name: c.display_name,
        })) as ComparedRow[];
        setCompared(mapped);
      })
      .catch((err) => { console.warn('[ChemicalsComparePage] fetch failed:', err); })
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
      title="Chemicals comparison"
      subtitle="Side-by-side comparison of contracts, lobbying, enforcement, and financials across chemicals companies."
      dataCredit="EPA + USASPENDING + SENATE LDA"
      footerNote="Contracts via USASpending. Lobbying via Senate LDA. Enforcement via EPA ECHO."
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
