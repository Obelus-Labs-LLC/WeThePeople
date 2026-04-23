import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowUpDown, Search, ExternalLink, User, ChevronUp, ChevronDown } from 'lucide-react';
import CSVExport from '../components/CSVExport';
import { PoliticsSectorHeader } from '../components/SectorHeader';
import { getApiBaseUrl } from '../api/client';
import TradeTimeline from '../components/TradeTimeline';
import { fetchTradeTimeline, type TradeMarker, type TradeTimelineRange } from '../api/influence';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
  type RowData,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    hiddenOnMobile?: boolean;
  }
}

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

const columnHelper = createColumnHelper<CongressionalTrade>();

const columns = [
  columnHelper.accessor('member_name', {
    header: 'Member',
    cell: (info) => (
      <Link to={`/politics/people/${info.row.original.person_id}`} className="text-blue-400 hover:text-blue-300 text-sm font-medium no-underline">
        {info.getValue()}
      </Link>
    ),
    size: 180,
  }),
  columnHelper.accessor('ticker', {
    header: 'Ticker',
    cell: (info) => (
      <span className="font-mono text-sm text-white font-semibold">
        {info.getValue() || '\u2014'}
      </span>
    ),
    size: 90,
  }),
  columnHelper.accessor('transaction_type', {
    header: 'Type',
    cell: (info) => {
      const v = info.getValue();
      return (
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${
          v === 'purchase' ? 'bg-emerald-500/15 text-emerald-400'
          : v === 'sale' ? 'bg-red-500/15 text-red-400'
          : 'bg-white/10 text-white/50'
        }`}>
          {v === 'purchase' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {(v || '').toUpperCase()}
        </span>
      );
    },
    size: 110,
  }),
  columnHelper.accessor('amount_range', {
    header: 'Amount',
    cell: (info) => <span className="font-mono text-sm text-white/70">{info.getValue() || '\u2014'}</span>,
    size: 150,
  }),
  columnHelper.accessor('transaction_date', {
    header: 'Trade Date',
    cell: (info) => <span className="text-sm text-white/50">{info.getValue() || '\u2014'}</span>,
    size: 110,
  }),
  columnHelper.accessor('disclosure_date', {
    header: 'Disclosed',
    cell: (info) => <span className="text-sm text-white/50">{info.getValue() || '\u2014'}</span>,
    size: 110,
    meta: { hiddenOnMobile: true },
  }),
  columnHelper.accessor('reporting_gap', {
    header: 'Filing Delay',
    cell: (info) => {
      const gap = info.getValue();
      if (!gap) return <span className="text-sm text-white/20">{'\u2014'}</span>;
      const n = Number(gap);
      const cls = !isNaN(n) && n > 45 ? 'bg-red-500/15 text-red-400'
        : !isNaN(n) && n > 30 ? 'bg-yellow-500/15 text-yellow-400'
        : 'bg-emerald-500/15 text-emerald-400';
      return <span className={`font-mono text-xs font-semibold px-2 py-0.5 rounded ${cls}`}>{gap}</span>;
    },
    size: 110,
  }),
  columnHelper.accessor('owner', {
    header: 'Owner',
    cell: (info) => <span className="text-sm text-white/40">{info.getValue() || '\u2014'}</span>,
    size: 80,
    meta: { hiddenOnMobile: true },
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: (info) => {
      const t = info.row.original;
      return (
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
      );
    },
    size: 60,
    meta: { hiddenOnMobile: true },
  }),
];

export default function CongressionalTradesPage() {
  const [trades, setTrades] = useState<CongressionalTrade[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'purchase' | 'sale'>('all');
  const [search, setSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  // Trade timeline state
  const [timelineTrades, setTimelineTrades] = useState<TradeMarker[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineRange, setTimelineRange] = useState<TradeTimelineRange>('1y');

  // Fetch timeline when ticker search changes
  useEffect(() => {
    let cancelled = false;
    if (!search || search.length < 1) {
      setTimelineTrades([]);
      return;
    }
    setTimelineLoading(true);
    fetchTradeTimeline(search.toUpperCase(), undefined, timelineRange)
      .then((data) => setTimelineTrades(data.trades || []))
      .catch(() => setTimelineTrades([]))
      .finally(() => setTimelineLoading(false));
    return () => { cancelled = true; };
  }, [search, timelineRange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ limit: '200' });
    if (filter !== 'all') params.set('transaction_type', filter);
    if (search) params.set('ticker', search.toUpperCase());
    fetch(`${API_BASE}/congressional-trades?${params}`)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        setTrades(data.trades || []);
        setTotal(data.total || 0);
      })
      .catch((err) => { console.warn('[CongressionalTradesPage] fetch failed:', err); })
      .finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, [filter, search]);

  // Client-side member name filter
  const filteredData = useMemo(() => {
    if (!memberSearch) return trades;
    const q = memberSearch.toLowerCase();
    return trades.filter((t) => t.member_name.toLowerCase().includes(q));
  }, [trades, memberSearch]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  // Virtual scrolling
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 48,
    getScrollElement: () => tableContainerRef.current,
    overscan: 20,
  });

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        <PoliticsSectorHeader />

        <div className="mb-8">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Congressional Stock Trades</h1>
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
            {filteredData.length.toLocaleString()} of {total.toLocaleString()} trades
          </span>
          <CSVExport
            data={filteredData}
            filename="congressional-trades"
            columns={[
              { key: 'member_name', label: 'Politician' },
              { key: 'ticker', label: 'Ticker' },
              { key: 'asset_name', label: 'Asset' },
              { key: 'transaction_type', label: 'Type' },
              { key: 'amount_range', label: 'Amount Range' },
              { key: 'transaction_date', label: 'Transaction Date' },
              { key: 'disclosure_date', label: 'Disclosure Date' },
              { key: 'owner', label: 'Owner' },
              { key: 'reporting_gap', label: 'Reporting Gap' },
            ]}
          />
        </div>

        {/* Trade Timeline (visible when ticker is searched) */}
        {search && timelineTrades.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              {(['3m', '6m', '1y', '2y'] as TradeTimelineRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimelineRange(r)}
                  className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                    timelineRange === r
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-white/30 hover:text-white/50'
                  }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
            <TradeTimeline trades={timelineTrades} ticker={search.toUpperCase()} />
          </div>
        )}
        {search && timelineLoading && (
          <div className="flex justify-center py-6 mb-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            <ArrowUpDown className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No congressional trades found yet.</p>
            <p className="text-sm mt-2">Trade data will appear once the sync job runs.</p>
          </div>
        ) : (
          <div
            ref={tableContainerRef}
            className="bg-white/[0.03] border border-white/10 rounded-xl overflow-auto"
            style={{ maxHeight: '70vh' }}
          >
            <table className="w-full min-w-[800px]">
              <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-sm">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-white/10">
                    {hg.headers.map((header) => {
                      const hiddenOnMobile = header.column.columnDef.meta?.hiddenOnMobile;
                      return (
                        <th
                          key={header.id}
                          className={`px-4 py-3 text-left text-xs font-mono text-white/40 uppercase tracking-wider select-none ${
                            header.column.getCanSort() ? 'cursor-pointer hover:text-white/70' : ''
                          } ${hiddenOnMobile ? 'hidden md:table-cell' : ''}`}
                          style={{ width: header.getSize() }}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <div className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === 'asc' ? (
                              <ChevronUp className="w-3 h-3 text-blue-400" />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <ChevronDown className="w-3 h-3 text-blue-400" />
                            ) : header.column.getCanSort() ? (
                              <ArrowUpDown className="w-3 h-3 opacity-30" />
                            ) : null}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {/* Spacer for virtual scroll */}
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td colSpan={columns.length} style={{ height: rowVirtualizer.getVirtualItems()[0]?.start ?? 0 }} />
                  </tr>
                )}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <tr
                      key={row.id}
                      data-index={virtualRow.index}
                      ref={(node) => rowVirtualizer.measureElement(node)}
                      className="border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => {
                        const hiddenOnMobile = cell.column.columnDef.meta?.hiddenOnMobile;
                        return (
                          <td
                            key={cell.id}
                            className={`px-4 py-3 ${hiddenOnMobile ? 'hidden md:table-cell' : ''}`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Bottom spacer */}
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td colSpan={columns.length} style={{
                      height: rowVirtualizer.getTotalSize() -
                        (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end ?? 0),
                    }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
