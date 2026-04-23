import React, { useEffect, useState } from 'react';
import { Shield, TrendingUp, BarChart3, Activity, Building2 } from 'lucide-react';
import {
  SectorCompareLayout,
  type CompareMetricGroup,
  type CompareEntity,
} from '../components/sector/SectorCompareLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import { LOCAL_LOGOS } from '../data/financeLogos';
import { getLogoUrl } from '../utils/logos';
import {
  getInstitutions,
  getFinanceComparison,
  type InstitutionListItem,
  type ComparisonInstitution,
} from '../api/finance';
import { fmtDollar, fmtNum } from '../utils/format';

// ── Helpers ──

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function fmtPctRaw(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(2)}%`;
}

function fmtRatio(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(2);
}

const SECTOR_LABELS: Record<string, string> = {
  bank: 'Banking',
  investment: 'Investment',
  insurance: 'Insurance',
  fintech: 'Fintech',
  central_bank: 'Central Bank',
};

// ── Metric groups ──

const METRIC_GROUPS: CompareMetricGroup[] = [
  {
    title: 'Valuation',
    icon: TrendingUp,
    iconColor: '#3DB87A',
    metrics: [
      { label: 'Market Cap', key: 'market_cap', format: fmtDollar },
      { label: 'P/E Ratio', key: 'pe_ratio', format: fmtRatio },
      { label: 'Forward P/E', key: 'forward_pe', format: fmtRatio, lowerIsBetter: true },
      { label: 'PEG Ratio', key: 'peg_ratio', format: fmtRatio, lowerIsBetter: true },
      { label: 'Price / Book', key: 'price_to_book', format: fmtRatio },
      { label: 'EPS (TTM)', key: 'eps', format: (v) => (v != null ? `$${v.toFixed(2)}` : '—') },
      { label: 'Revenue (TTM)', key: 'revenue_ttm', format: fmtDollar },
    ],
  },
  {
    title: 'Performance',
    icon: BarChart3,
    iconColor: '#3DB87A',
    metrics: [
      { label: 'Profit Margin', key: 'profit_margin', format: fmtPct },
      { label: 'Operating Margin', key: 'operating_margin', format: fmtPct },
      { label: 'ROA', key: 'roa', format: fmtPctRaw },
      { label: 'ROE', key: 'roe', format: fmtPctRaw },
      { label: 'Return on Equity', key: 'return_on_equity', format: fmtPct },
      { label: 'Efficiency Ratio', key: 'efficiency_ratio', format: fmtPctRaw, lowerIsBetter: true },
    ],
  },
  {
    title: 'Balance Sheet',
    icon: Building2,
    iconColor: '#4A7FDE',
    metrics: [
      { label: 'Total Assets', key: 'total_assets', format: fmtDollar },
      { label: 'Total Deposits', key: 'total_deposits', format: fmtDollar },
      { label: 'Net Loans', key: 'net_loans', format: fmtDollar },
      { label: 'Net Income', key: 'net_income', format: fmtDollar },
      { label: 'Dividend Yield', key: 'dividend_yield', format: fmtPct },
      {
        label: 'Dividend / Share',
        key: 'dividend_per_share',
        format: (v) => (v != null ? `$${v.toFixed(2)}` : '—'),
      },
    ],
  },
  {
    title: 'Risk & Capital',
    icon: Shield,
    iconColor: '#D4AE35',
    metrics: [
      { label: 'Tier 1 Capital', key: 'tier1_capital_ratio', format: fmtPctRaw },
      { label: 'Noncurrent Loans', key: 'noncurrent_loan_ratio', format: fmtPctRaw, lowerIsBetter: true },
      { label: 'Net Charge-Offs', key: 'net_charge_off_ratio', format: fmtPctRaw, lowerIsBetter: true },
      { label: '52-Week High', key: 'week_52_high', format: (v) => (v != null ? `$${v.toFixed(2)}` : '—') },
      { label: '52-Week Low', key: 'week_52_low', format: (v) => (v != null ? `$${v.toFixed(2)}` : '—') },
    ],
  },
  {
    title: 'Regulatory Activity',
    icon: Activity,
    iconColor: '#E63946',
    metrics: [
      { label: 'SEC Filings', key: 'filing_count', format: fmtNum },
      { label: 'CFPB Complaints', key: 'complaint_count', format: fmtNum, lowerIsBetter: true },
    ],
  },
];

// ── Entity adapters ──
// Generic layout expects { id, name, ticker, subtitle, logo } shape

type ListRow = InstitutionListItem & { id: string; name: string };
type ComparedRow = ComparisonInstitution & { id: string; name: string };

function instLogo(inst: {
  institution_id: string;
  logo_url?: string | null;
  display_name: string;
}): string | null {
  return getLogoUrl(inst.institution_id, inst.logo_url, LOCAL_LOGOS) || null;
}

function listToDisplay(inst: ListRow): CompareEntity {
  return {
    id: inst.institution_id,
    name: inst.display_name,
    ticker: inst.ticker ?? null,
    subtitle: inst.sector_type ? SECTOR_LABELS[inst.sector_type] || inst.sector_type : null,
    logo: instLogo(inst),
  };
}

function comparedToDisplay(inst: ComparedRow): CompareEntity {
  return {
    id: inst.institution_id,
    name: inst.display_name,
    ticker: inst.ticker ?? null,
    subtitle: inst.sector_type
      ? `${SECTOR_LABELS[inst.sector_type] || inst.sector_type}${inst.headquarters ? ` · ${inst.headquarters}` : ''}`
      : inst.headquarters ?? null,
    logo: instLogo(inst),
  };
}

// ── Page ──

export default function FinanceComparePage() {
  const config = SECTOR_MAP.finance;
  const [allInstitutions, setAllInstitutions] = useState<ListRow[]>([]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [compared, setCompared] = useState<ComparedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInstitutions({ limit: 200 })
      .then((res) => {
        if (cancelled) return;
        const list = (res.institutions || []).map((inst) => ({
          ...inst,
          id: inst.institution_id,
          name: inst.display_name,
        })) as ListRow[];
        setAllInstitutions(list);
        if (list.length >= 2) {
          setIdA(list[0].institution_id);
          setIdB(list[1].institution_id);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleCompare() {
    if (!idA || !idB || idA === idB) return;
    setComparing(true);
    getFinanceComparison([idA, idB])
      .then((res) => {
        const mapped = (res.institutions || []).map((inst) => ({
          ...inst,
          id: inst.institution_id,
          name: inst.display_name,
        })) as ComparedRow[];
        setCompared(mapped);
      })
      .catch(() => {})
      .finally(() => setComparing(false));
  }

  useEffect(() => {
    if (idA && idB && idA !== idB && compared.length === 0 && !comparing) {
      handleCompare();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idA, idB]);

  return (
    <SectorCompareLayout<ListRow, ComparedRow>
      config={config}
      title="Finance comparison"
      subtitle="Side-by-side financial metrics across valuation, performance, balance sheet, risk, and regulatory activity."
      dataCredit="FDIC + SEC + CFPB + ALPHA VANTAGE"
      footerNote="FDIC data in thousands USD. Stock data via Alpha Vantage. Complaints via CFPB."
      entities={allInstitutions}
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
      labelA="Institution A"
      labelB="Institution B"
    />
  );
}
