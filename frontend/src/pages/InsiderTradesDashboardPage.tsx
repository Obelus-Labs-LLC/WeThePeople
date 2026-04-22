import React, { useEffect, useState, useMemo } from 'react';
import { Filter, Landmark, Search, TrendingUp, ArrowUpRight, ArrowDownRight, Newspaper } from 'lucide-react';
import { FinanceSectorHeader } from '../components/SectorHeader';
import {
  ResearchToolLayout,
  ResearchSection,
  ResearchRowCard,
  ResearchEmptyState,
} from '../components/research/ResearchToolLayout';
import {
  getAllInsiderTrades,
  getMacroIndicators,
  getSectorNews,
  type InsiderTradeItem,
  type MacroIndicator,
  type SectorNewsItem,
} from '../api/finance';
import { fmtDollar, fmtNum } from '../utils/format';

const TYPE_LABELS: Record<string, string> = { P: 'PURCHASE', S: 'SALE', A: 'AWARD' };

function typeAccent(t: string | null): string {
  if (t === 'P') return 'var(--color-green)';
  if (t === 'S') return 'var(--color-red)';
  return 'var(--color-dem)';
}

function fmtShares(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

export default function InsiderTradesDashboardPage() {
  const [trades, setTrades] = useState<InsiderTradeItem[]>([]);
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [news, setNews] = useState<SectorNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filteredTrades = useMemo(() => {
    if (!search.trim()) return trades;
    const q = search.toLowerCase();
    return trades.filter(
      (t) =>
        t.company_name?.toLowerCase().includes(q) ||
        t.filer_name?.toLowerCase().includes(q),
    );
  }, [trades, search]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getAllInsiderTrades({ limit: 100, transaction_type: filter || undefined }),
      getMacroIndicators(),
      getSectorNews(15),
    ])
      .then(([tradesRes, macroRes, newsRes]) => {
        setTrades(tradesRes.trades || []);
        setIndicators(macroRes.indicators || []);
        setNews(newsRes.news || []);
      })
      .catch(() => {
        setError('Failed to load insider trades.');
      })
      .finally(() => setLoading(false));
  }, [filter]);

  const totalValue = trades.reduce((sum, t) => sum + (t.total_value || 0), 0);
  const purchases = trades.filter((t) => t.transaction_type === 'P').length;
  const sales = trades.filter((t) => t.transaction_type === 'S').length;

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px 8px 34px',
    borderRadius: '8px',
    border: '1px solid rgba(235,229,213,0.1)',
    background: 'var(--color-surface)',
    color: 'var(--color-text-1)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    outline: 'none',
    width: '240px',
  };

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(235,229,213,0.1)',
    background: 'var(--color-surface)',
    color: 'var(--color-text-1)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    outline: 'none',
    colorScheme: 'dark',
  };

  return (
    <ResearchToolLayout
      sectorHeader={<FinanceSectorHeader />}
      eyebrow={{ label: 'Insider Trades', color: 'var(--color-green)' }}
      title="Insider Trades"
      description="SEC Form 4 executive transactions, macro indicators, and sector news."
      accent="var(--color-green)"
      loading={loading && trades.length === 0}
      error={error}
      stats={[
        { label: 'Trade Value', value: fmtDollar(totalValue), icon: TrendingUp, accent: 'var(--color-green)' },
        { label: 'Purchases', value: fmtNum(purchases), icon: ArrowUpRight, accent: 'var(--color-green)' },
        { label: 'Sales', value: fmtNum(sales), icon: ArrowDownRight, accent: 'var(--color-red)' },
        { label: 'Trades', value: fmtNum(trades.length), icon: Landmark },
      ]}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <ResearchSection
            title="Recent Insider Trades"
            subtitle="Filter and search Form 4 transactions by type, company, or executive."
            action={(
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)' }} />
                  <input
                    type="text"
                    placeholder="Search company or insider…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <Filter size={14} color="var(--color-text-3)" />
                <select value={filter || ''} onChange={(e) => setFilter(e.target.value || null)} style={selectStyle}>
                  <option value="">ALL TYPES</option>
                  <option value="P">PURCHASE</option>
                  <option value="S">SALE</option>
                  <option value="A">AWARD</option>
                </select>
              </div>
            )}
          >
            {filteredTrades.length === 0 ? (
              <ResearchEmptyState icon={TrendingUp} text={search.trim() ? 'No trades match your search.' : 'No insider trades on record.'} />
            ) : (
              <div style={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid rgba(235,229,213,0.08)', background: 'var(--color-surface)' }}>
                <table style={{ width: '100%', minWidth: '620px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(235,229,213,0.08)' }}>
                      <th style={thStyle}>DATE</th>
                      <th style={thStyle}>INSIDER</th>
                      <th style={thStyle}>COMPANY</th>
                      <th style={thStyle}>TYPE</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>SHARES</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>VALUE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrades.map((t) => {
                      const accent = typeAccent(t.transaction_type);
                      return (
                        <tr
                          key={t.id}
                          onClick={() => t.filing_url && window.open(t.filing_url, '_blank')}
                          style={{ borderBottom: '1px solid rgba(235,229,213,0.04)', cursor: t.filing_url ? 'pointer' : 'default' }}
                        >
                          <td style={tdStyle}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                              {t.transaction_date || '—'}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-1)', margin: 0 }}>{t.filer_name}</p>
                            {t.filer_title && (
                              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)', margin: '2px 0 0' }}>{t.filer_title}</p>
                            )}
                          </td>
                          <td style={tdStyle}>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-text-1)', margin: 0 }}>{t.company_name}</p>
                            {t.ticker && (
                              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-green)', margin: '2px 0 0' }}>{t.ticker}</p>
                            )}
                          </td>
                          <td style={tdStyle}>
                            <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', background: `${accent}1f`, color: accent }}>
                              {TYPE_LABELS[t.transaction_type || ''] || t.transaction_type || '—'}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-text-1)' }}>{fmtShares(t.shares)}</span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-1)' }}>{fmtDollar(t.total_value)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ResearchSection>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <ResearchSection title="Macro Indicators" subtitle="Headline FRED series.">
            {indicators.length === 0 ? (
              <ResearchEmptyState icon={Landmark} text="No macro data available." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {indicators.map((ind) => (
                  <ResearchRowCard key={ind.series_id} hoverable={false}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-text-1)', margin: 0 }}>
                          {ind.series_title || ind.series_id}
                        </p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)', margin: '2px 0 0' }}>
                          {ind.observation_date}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--color-text-1)', margin: 0 }}>
                          {ind.value != null ? ind.value.toFixed(2) : '—'}
                        </p>
                        {ind.units && (
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)', margin: '2px 0 0' }}>{ind.units}</p>
                        )}
                      </div>
                    </div>
                  </ResearchRowCard>
                ))}
              </div>
            )}
          </ResearchSection>

          <ResearchSection title="Sector News" subtitle="Finance-sector press releases.">
            {news.length === 0 ? (
              <ResearchEmptyState icon={Newspaper} text="No sector news available." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {news.map((item) => (
                  <a key={item.id} href={item.url || '#'} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <ResearchRowCard accent="var(--color-dem)">
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-1)', margin: '0 0 8px' }}>
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
      </div>
    </ResearchToolLayout>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 14px',
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  background: 'var(--color-surface)',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'top',
};
