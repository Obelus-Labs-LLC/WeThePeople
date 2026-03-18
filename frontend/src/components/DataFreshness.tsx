import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '../api/client';

interface FreshnessItem {
  last_updated: string | null;
  record_count: number;
}

interface FreshnessData {
  lobbying: FreshnessItem;
  contracts: FreshnessItem;
  enforcement: FreshnessItem;
  trades: FreshnessItem;
  insider_trades: FreshnessItem;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`.replace('.0K', 'K');
  return n.toLocaleString();
}

export default function DataFreshness() {
  const [data, setData] = useState<FreshnessData | null>(null);

  useEffect(() => {
    const base = getApiBaseUrl();
    fetch(`${base}/influence/data-freshness`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, []);

  if (!data) return null;

  // Find the most recent date across all categories
  const allDates = [
    data.lobbying.last_updated,
    data.contracts.last_updated,
    data.enforcement.last_updated,
    data.trades.last_updated,
    data.insider_trades.last_updated,
  ].filter(Boolean) as string[];

  const mostRecent = allDates.length > 0
    ? allDates.sort().reverse()[0]
    : null;

  const segments = [
    { label: 'lobbying records', count: data.lobbying.record_count },
    { label: 'contracts', count: data.contracts.record_count },
    { label: 'enforcement actions', count: data.enforcement.record_count },
  ].filter((s) => s.count > 0);

  return (
    <div className="font-mono text-[11px] text-white/30 mt-4">
      <span>
        Data as of {formatDate(mostRecent)}
        {segments.map((s, i) => (
          <span key={s.label}>
            {' '}&middot; {fmtCount(s.count)} {s.label}
          </span>
        ))}
      </span>
    </div>
  );
}
