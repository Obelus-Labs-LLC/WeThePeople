import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Banknote, TrendingDown, TrendingUp, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';

// ── Types ──

type Dataset = 'debt' | 'revenue' | 'spending';

interface TreasuryRow {
  period: string;
  label: string | null;
  amount: number | null;
  category: string | null;
  change_pct: number | null;
}

interface TreasuryResponse {
  dataset: string;
  total: number;
  rows: TreasuryRow[];
  as_of: string | null;
}

// ── Helpers ──

function fmtCurrency(val: number | null): string {
  if (val == null) return '\u2014';
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000_000) return `$${(val / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtPct(val: number | null): string {
  if (val == null) return '';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${(val * 100).toFixed(1)}%`;
}

// ── Dataset config ──

const DATASETS: { key: Dataset; label: string; description: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  {
    key: 'debt',
    label: 'National Debt',
    description: 'Total public debt outstanding over time',
    icon: TrendingUp,
  },
  {
    key: 'revenue',
    label: 'Federal Revenue',
    description: 'Government receipts by source category',
    icon: Banknote,
  },
  {
    key: 'spending',
    label: 'Government Spending',
    description: 'Federal outlays by agency and category',
    icon: TrendingDown,
  },
];

// ── Page ──

export default function TreasuryDataPage() {
  const [activeDataset, setActiveDataset] = useState<Dataset>('debt');
  const [data, setData] = useState<TreasuryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (dataset: Dataset) => {
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<TreasuryResponse>(
        '/research/treasury-data',
        { params: { dataset } },
      );
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(activeDataset);
  }, [activeDataset, fetchData]);

  const handleTabChange = (dataset: Dataset) => {
    setActiveDataset(dataset);
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Back link */}
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8">
        <ArrowLeft size={14} />
        Back to Research Tools
      </Link>

      {/* Header */}
      <div className="mb-8">
        <span className="text-xs font-bold tracking-[0.2em] text-emerald-400 uppercase">Treasury</span>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50 mt-1" style={{ fontFamily: 'Oswald, sans-serif' }}>
          Treasury / Budget Data
        </h1>
        <p className="text-base text-zinc-400 mt-2 max-w-2xl">
          Explore U.S. Treasury data including national debt trends, federal revenue sources, and government spending breakdowns.
        </p>
      </div>

      {/* Dataset tabs */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {DATASETS.map((ds) => {
          const Icon = ds.icon;
          const isActive = activeDataset === ds.key;
          return (
            <button
              key={ds.key}
              onClick={() => handleTabChange(ds.key)}
              className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium cursor-pointer border transition-all ${
                isActive
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <Icon size={16} />
              {ds.label}
            </button>
          );
        })}
      </div>

      {/* Dataset description */}
      <div className="mb-6">
        <p className="text-sm text-zinc-500">
          {DATASETS.find((d) => d.key === activeDataset)?.description}
          {data?.as_of && <span className="ml-2 text-zinc-600">| As of {data.as_of}</span>}
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mb-4" />
          <p className="text-sm text-zinc-500">Loading treasury data...</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-lg text-red-400 mb-2">Failed to load data</p>
          <p className="text-sm text-zinc-500 mb-4">{error}</p>
          <button
            onClick={() => fetchData(activeDataset)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Data table */}
      {!loading && !error && data && (
        <>
          <div className="mb-4">
            <span className="text-sm text-zinc-500">
              {data.total.toLocaleString()} record{data.total !== 1 ? 's' : ''}
            </span>
          </div>

          {data.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-zinc-800 bg-zinc-900/30">
              <BarChart3 size={48} className="text-zinc-800 mb-4" />
              <p className="text-sm text-zinc-500">No data available for this dataset.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60">
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Period</th>
                    {activeDataset !== 'debt' && (
                      <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Category</th>
                    )}
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500 text-right">Amount</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500 text-right">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-zinc-800/40 hover:bg-zinc-900/40 transition-colors"
                      style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.02}s forwards` }}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-white font-mono">{row.period}</td>
                      {activeDataset !== 'debt' && (
                        <td className="px-4 py-3 text-sm text-zinc-400">{row.category || row.label || '\u2014'}</td>
                      )}
                      <td className="px-4 py-3 text-sm font-bold text-right text-emerald-400 font-mono">
                        {fmtCurrency(row.amount)}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium text-right font-mono ${
                        row.change_pct == null
                          ? 'text-zinc-600'
                          : row.change_pct >= 0
                          ? 'text-red-400'
                          : 'text-emerald-400'
                      }`}>
                        {row.change_pct != null ? fmtPct(row.change_pct) : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes card-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
