import React, { useEffect, useState } from 'react';
import { Shield, TrendingUp } from 'lucide-react';
import {
  SectorCompareLayout,
  type CompareMetricGroup,
  type CompareEntity,
} from '../components/sector/SectorCompareLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getTelecomCompanies,
  getTelecomComparison,
  type TelecomCompanyListItem,
  type TelecomComparisonItem,
} from '../api/telecom';
import { fmtDollar, fmtNum } from '../utils/format';

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

const METRIC_GROUPS: CompareMetricGroup[] = [
  {
    title: 'Political Influence',
    icon: Shield,
    iconColor: '#4A7FDE',
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

type ListRow = TelecomCompanyListItem & { id: string; name: string };
type ComparedRow = TelecomComparisonItem & { id: string; name: string };

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

export default function TelecomComparePage() {
  const config = SECTOR_MAP.telecom;
  const [allCompanies, setAllCompanies] = useState<ListRow[]>([]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [compared, setCompared] = useState<ComparedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    let stale = false;
    getTelecomCompanies({ limit: 200 })
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
    getTelecomComparison([idA, idB])
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
    getTelecomComparison([idA, idB])
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
      title="Telecommunications comparison"
      subtitle="Side-by-side comparison of contracts, lobbying, enforcement, and financials across telecom companies."
      dataCredit="USASPENDING + SENATE LDA + FCC"
      footerNote="Contracts via USASpending. Lobbying via Senate LDA. Enforcement via FCC."
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
