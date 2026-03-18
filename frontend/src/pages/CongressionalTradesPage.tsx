import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowUpDown, Search, ExternalLink, User } from 'lucide-react';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

interface CongressionalTrade {
  id: number;
  person_id: string;
  member_name: string;
  ticker: string | null;
  asset_name: string | null;
  transaction_type: string;
  amount_range: string | null;
  disclosure_date: string | null;
  transaction_date: string | null;
  owner: string | null;
  source_url: string | null;
  reporting_gap: string | null;
}

export default function CongressionalTradesPage() {
  const [trades, setTrades] = useState<CongressionalTrade[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'purchase' | 'sale'>('all');
  const [search, setSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (filter !== 'all') params.set('transaction_type', filter);
    if (search) params.set('ticker', search.toUpperCase());
    fetch(`${API_BASE}/congressional-trades?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setTrades(data.trades || []);
        setTotal(data.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter, search]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        <PoliticsSectorHeader />

        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Congressional Stock Trades</h1>
              <p className="text-white/50">
                STOCK Act financial disclosures — what members of Congress are buying and selling.
              </p>
            </div>
            <a
              href="https://www.capitoltrades.com/trades"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-blue-400 transition-colors hover:bg-white/10 hover:text-blue-300"
            >
              Explore more on Capitol Trades
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            {(['all', 'purchase', 'sale'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {f === 'all' ? 'All' : f === 'purchase' ? 'Purchases' : 'Sales'}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Filter by ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Search by politician..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          <span className="text-white/30 text-sm ml-auto">
            {total.toLocaleString()} trades
          </span>
        </div>

        {/* Client-side member name filter */}
        {(() => {
          const filteredTrades = memberSearch
            ? trades.filter((t) => t.member_name.toLowerCase().includes(memberSearch.toLowerCase()))
            : trades;

          return (<>
        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : filteredTrades.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            <ArrowUpDown className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No congressional trades found yet.</p>
            <p className="text-sm mt-2">Trade data will appear once the sync job runs.</p>
          </div>
        ) : (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  {['Member', 'Ticker', 'Type', 'Amount', 'Trade Date', 'Disclosed', 'Filing Delay', 'Owner', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-mono text-white/40 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((t) => (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/politics/people/${t.person_id}`} className="text-blue-400 hover:text-blue-300 text-sm font-medium no-underline">
                        {t.member_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-white font-semibold">
                        {t.ticker || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${
                        t.transaction_type === 'purchase'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : t.transaction_type === 'sale'
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-white/10 text-white/50'
                      }`}>
                        {t.transaction_type === 'purchase' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {t.transaction_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-white/70">
                      {t.amount_range || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/50">
                      {t.transaction_date || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/50">
                      {t.disclosure_date || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {t.reporting_gap ? (
                        <span className={`font-mono text-xs font-semibold px-2 py-0.5 rounded ${
                          parseInt(t.reporting_gap) > 45
                            ? 'bg-red-500/15 text-red-400'
                            : parseInt(t.reporting_gap) > 30
                            ? 'bg-yellow-500/15 text-yellow-400'
                            : 'bg-emerald-500/15 text-emerald-400'
                        }`}>
                          {t.reporting_gap}
                        </span>
                      ) : (
                        <span className="text-sm text-white/20">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/40">
                      {t.owner || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {t.source_url && (
                          <a href={t.source_url} target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/60" title="Source filing">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <a
                          href="https://www.capitoltrades.com/trades"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400/40 hover:text-blue-300 transition-colors"
                          title="Capitol Trades"
                        >
                          <TrendingUp className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>);
        })()}
      </div>
    </div>
  );
}
