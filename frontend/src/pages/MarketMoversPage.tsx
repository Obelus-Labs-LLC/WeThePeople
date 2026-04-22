import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, AlertTriangle, Newspaper, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { FinanceSectorHeader } from '../components/SectorHeader';
import {
  ResearchToolLayout,
  ResearchSection,
  ResearchRowCard,
  ResearchEmptyState,
} from '../components/research/ResearchToolLayout';
import {
  getAllInsiderTrades,
  getAllComplaints,
  getSectorNews,
  type InsiderTradeItem,
  type CFPBComplaintItem,
  type SectorNewsItem,
} from '../api/finance';
import { fmtDollar, fmtNum } from '../utils/format';

const TYPE_LABELS: Record<string, string> = { P: 'PURCHASE', S: 'SALE', A: 'AWARD' };

function typeAccent(t: string | null): string {
  if (t === 'P') return 'var(--color-green)';
  if (t === 'S') return 'var(--color-red)';
  return 'var(--color-dem)';
}

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
      .catch(() => {
        setError('Failed to load market data. Please try again later.');
      })
      .finally(() => setLoading(false));
  }, []);

  const totalTradeValue = trades.reduce((sum, t) => sum + (t.total_value || 0), 0);

  return (
    <ResearchToolLayout
      sectorHeader={<FinanceSectorHeader />}
      eyebrow={{ label: 'Market Intelligence', color: 'var(--color-green)' }}
      title="Market Movers"
      description="Biggest insider trades, complaint spikes, and notable sector news across finance."
      accent="var(--color-green)"
      loading={loading}
      error={error}
      stats={[
        { label: 'Trade Value', value: fmtDollar(totalTradeValue), icon: TrendingUp, accent: 'var(--color-green)' },
        { label: 'Insider Trades', value: fmtNum(trades.length), icon: ArrowUpRight },
        { label: 'Complaints', value: fmtNum(complaints.length), icon: AlertTriangle },
        { label: 'News Items', value: fmtNum(news.length), icon: Newspaper },
      ]}
    >
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: '80px', borderRadius: '12px', background: 'var(--color-surface)', opacity: 0.6 }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <ResearchSection
            title="Biggest Insider Trades"
            subtitle="Largest corporate-insider transactions by total dollar value."
          >
            {trades.length === 0 ? (
              <ResearchEmptyState icon={TrendingUp} text="No insider trades on record." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                {trades.map((t) => {
                  const accent = typeAccent(t.transaction_type);
                  return (
                    <Link key={t.id} to={`/finance/${t.institution_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <ResearchRowCard accent={accent}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', background: `${accent}1f`, color: accent }}>
                            {TYPE_LABELS[t.transaction_type || ''] || t.transaction_type || '—'}
                          </span>
                          {t.transaction_type === 'P' ? (
                            <ArrowUpRight size={14} color="var(--color-green)" />
                          ) : t.transaction_type === 'S' ? (
                            <ArrowDownRight size={14} color="var(--color-red)" />
                          ) : null}
                        </div>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-1)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.filer_name}
                        </p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-text-3)', margin: '2px 0 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.company_name}{t.ticker ? ` (${t.ticker})` : ''}
                        </p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--color-text-1)', margin: 0 }}>
                          {fmtDollar(t.total_value)}
                        </p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)', margin: '2px 0 0' }}>
                          {t.shares != null ? t.shares.toLocaleString() : '—'} shares · {t.transaction_date || '—'}
                        </p>
                      </ResearchRowCard>
                    </Link>
                  );
                })}
              </div>
            )}
          </ResearchSection>

          <ResearchSection
            title="Recent Complaints"
            subtitle="Consumer financial complaints filed with the CFPB."
          >
            {complaints.length === 0 ? (
              <ResearchEmptyState icon={AlertTriangle} text="No complaints on record." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                {complaints.map((c) => (
                  <Link key={c.id} to={`/finance/${c.institution_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <ResearchRowCard accent="var(--color-accent)">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        {c.product && (
                          <span style={{ padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, background: 'rgba(197,160,40,0.12)', color: 'var(--color-accent)' }}>
                            {c.product}
                          </span>
                        )}
                        {c.consumer_disputed === 'Yes' && (
                          <span style={{ padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, background: 'rgba(230,57,70,0.15)', color: 'var(--color-red)', border: '1px solid rgba(230,57,70,0.3)' }}>
                            DISPUTED
                          </span>
                        )}
                      </div>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-1)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.company_name}
                      </p>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-text-2)', margin: '4px 0 10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {c.issue}{c.sub_issue ? ` — ${c.sub_issue}` : ''}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {c.date_received && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)' }}>{c.date_received}</span>
                        )}
                        {c.state && (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(235,229,213,0.06)', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)' }}>{c.state}</span>
                        )}
                      </div>
                    </ResearchRowCard>
                  </Link>
                ))}
              </div>
            )}
          </ResearchSection>

          <ResearchSection
            title="Notable Sector News"
            subtitle="Press releases and market announcements from finance-sector entities."
          >
            {news.length === 0 ? (
              <ResearchEmptyState icon={Newspaper} text="No sector news available." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {news.map((item) => (
                  <a key={item.id} href={item.url || '#'} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <ResearchRowCard accent="var(--color-dem)">
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-1)', margin: '0 0 10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {item.title || 'Untitled'}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {item.release_date && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)' }}>{item.release_date}</span>
                        )}
                        {item.release_type && (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(74,127,222,0.12)', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-dem)' }}>
                            {item.release_type}
                          </span>
                        )}
                      </div>
                    </ResearchRowCard>
                  </a>
                ))}
              </div>
            )}
          </ResearchSection>
        </div>
      )}
    </ResearchToolLayout>
  );
}
