import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, AlertTriangle, Newspaper, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { FinanceSectorHeader } from '../components/SectorHeader';
import {
  getAllInsiderTrades,
  getAllComplaints,
  getSectorNews,
  type InsiderTradeItem,
  type CFPBComplaintItem,
  type SectorNewsItem,
} from '../api/finance';
import { fmtDollar } from '../utils/format';

// ── Helpers ──

const TYPE_LABELS: Record<string, string> = { P: 'PURCHASE', S: 'SALE', A: 'AWARD' };

function typeBadgeClasses(t: string | null): string {
  if (t === 'P') return 'bg-[rgba(16,185,129,0.1)] text-[#10B981]';
  if (t === 'S') return 'bg-[rgba(239,68,68,0.1)] text-[#EF4444]';
  return 'bg-[rgba(59,130,246,0.1)] text-[#34D399]';
}

// ── Page ──

export default function MarketMoversPage() {
  const [trades, setTrades] = useState<InsiderTradeItem[]>([]);
  const [complaints, setComplaints] = useState<CFPBComplaintItem[]>([]);
  const [news, setNews] = useState<SectorNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getAllInsiderTrades({ limit: 20 }),
      getAllComplaints({ limit: 20 }),
      getSectorNews(20),
    ])
      .then(([tradesRes, complaintsRes, newsRes]) => {
        setTrades(tradesRes.trades || []);
        setComplaints(complaintsRes.complaints || []);
        setNews(newsRes.news || []);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load market data. Please try again later.');
      })
      .finally(() => setLoading(false));
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#34D399] border-t-transparent" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
          <FinanceSectorHeader />
          <div className="flex flex-col items-center justify-center py-24">
            <AlertTriangle size={48} className="text-[#FBBF24] mb-4" />
            <p className="font-body text-lg text-white/60">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        <FinanceSectorHeader />

        {/* Header */}
        <div className="flex items-end justify-between mb-8 animate-fade-up">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
              Market Movers
            </h1>
            <p className="mt-1 font-body text-lg text-white/50">
              Biggest insider trades, complaint spikes, and notable sector news
            </p>
          </div>
          <div className="hidden md:flex flex-col items-end gap-1">
            <p className="font-mono text-[11px] text-white/30">
              DATA SOURCES: <span className="text-white/50">SEC / CFPB / FRED</span>
            </p>
            <p className="font-mono text-[11px] text-white/30">
              STATUS: <span className="text-[#34D399]">ONLINE</span>
            </p>
          </div>
        </div>

        {/* ── Section 1: Biggest Insider Trades ── */}
        <div
          className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] shadow-2xl animate-fade-up"
          style={{ animationDelay: '100ms', animationFillMode: 'both' }}
        >
          <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.05] px-6 py-4">
            <TrendingUp size={18} className="text-[#34D399]" />
            <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-white">
              Biggest Insider Trades
            </h2>
          </div>
          {trades.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="font-body text-sm text-white/40">No insider trades on record.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
              {trades.map((t) => (
                <Link
                  key={t.id}
                  to={`/finance/${t.institution_id}`}
                  className="group block rounded-lg border border-white/10 bg-white/[0.03] p-4 transition-all duration-150 hover:bg-white/[0.08] hover:border-[#34D399]/40 no-underline"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-block rounded px-2 py-1 font-mono text-xs font-bold uppercase ${typeBadgeClasses(t.transaction_type)}`}>
                      {TYPE_LABELS[t.transaction_type || ''] || t.transaction_type || '—'}
                    </span>
                    {t.transaction_type === 'P' ? (
                      <ArrowUpRight size={16} className="text-[#10B981]" />
                    ) : t.transaction_type === 'S' ? (
                      <ArrowDownRight size={16} className="text-[#EF4444]" />
                    ) : null}
                  </div>
                  <p className="font-body text-sm font-bold text-white group-hover:text-[#34D399] transition-colors truncate mb-1">
                    {t.filer_name}
                  </p>
                  <p className="font-body text-xs text-white/50 truncate mb-3">
                    {t.company_name}
                    {t.ticker ? ` (${t.ticker})` : ''}
                  </p>
                  <p className="font-mono text-xl font-bold text-white">
                    {fmtDollar(t.total_value)}
                  </p>
                  <p className="font-mono text-xs text-white/40 mt-1">
                    {t.shares != null ? t.shares.toLocaleString() : '—'} shares &middot; {t.transaction_date || '—'}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 2: Recent Complaints ── */}
        <div
          className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] shadow-2xl animate-fade-up"
          style={{ animationDelay: '200ms', animationFillMode: 'both' }}
        >
          <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.05] px-6 py-4">
            <AlertTriangle size={18} className="text-[#FBBF24]" />
            <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-white">
              Recent Complaints
            </h2>
          </div>
          {complaints.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="font-body text-sm text-white/40">No complaints on record.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
              {complaints.map((c) => (
                <Link
                  key={c.id}
                  to={`/finance/${c.institution_id}`}
                  className="group block rounded-lg border border-white/10 bg-white/[0.03] p-4 transition-all duration-150 hover:bg-white/[0.08] hover:border-[#FBBF24]/40 no-underline"
                >
                  <div className="flex items-center gap-2 mb-3">
                    {c.product && (
                      <span className="rounded bg-[rgba(52,211,153,0.1)] px-2 py-1 font-mono text-xs font-bold text-[#34D399] truncate">
                        {c.product}
                      </span>
                    )}
                    {c.consumer_disputed === 'Yes' && (
                      <span className="rounded bg-[rgba(245,158,11,0.2)] px-2 py-1 font-mono text-xs font-bold text-[#FBBF24] border border-[rgba(245,158,11,0.3)]">
                        DISPUTED
                      </span>
                    )}
                  </div>
                  <p className="font-body text-sm font-bold text-white group-hover:text-[#34D399] transition-colors truncate mb-1">
                    {c.company_name}
                  </p>
                  <p className="font-body text-xs text-white/60 line-clamp-2 mb-3">
                    {c.issue}{c.sub_issue ? ` — ${c.sub_issue}` : ''}
                  </p>
                  <div className="flex items-center justify-between">
                    {c.date_received && (
                      <span className="font-mono text-xs text-white/40">{c.date_received}</span>
                    )}
                    {c.state && (
                      <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-white/50">{c.state}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 3: Sector News ── */}
        <div
          className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] shadow-2xl animate-fade-up"
          style={{ animationDelay: '300ms', animationFillMode: 'both' }}
        >
          <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.05] px-6 py-4">
            <Newspaper size={18} className="text-[#60A5FA]" />
            <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-white">
              Notable Sector News
            </h2>
          </div>
          {news.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="font-body text-sm text-white/40">No sector news available.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
              {news.map((item) => (
                <a
                  key={item.id}
                  href={item.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-lg border border-white/10 bg-white/[0.03] p-4 transition-all duration-150 hover:bg-white/[0.08] hover:border-[#60A5FA]/40 no-underline"
                >
                  <p className="font-body text-sm font-medium text-white group-hover:text-[#60A5FA] transition-colors mb-3 line-clamp-2">
                    {item.title || 'Untitled'}
                  </p>
                  <div className="flex items-center gap-3">
                    {item.release_date && (
                      <span className="font-mono text-xs text-white/40">{item.release_date}</span>
                    )}
                    {item.release_type && (
                      <span className="rounded bg-[#60A5FA]/10 px-2 py-0.5 font-mono text-xs text-[#60A5FA]">
                        {item.release_type}
                      </span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
