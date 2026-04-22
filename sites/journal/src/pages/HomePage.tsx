import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { StoryCard } from '../components/StoryCard';
import { NewsletterCTA } from '../components/NewsletterCTA';
import { EmptyState } from '../components/EmptyState';
import { useStories } from '../hooks/useStories';
import { CATEGORY_META, type StoryCategory } from '../types';

const categories: StoryCategory[] = [
  'contract_windfall', 'revolving_door', 'bipartisan_buying', 'stock_act_violation',
  'committee_stock_trade', 'prolific_trader', 'enforcement_immunity', 'penalty_contract_ratio',
  'lobbying_spike', 'enforcement_gap', 'trade_timing', 'full_influence_loop',
  'foreign_lobbying', 'regulatory_capture', 'regulatory_arbitrage', 'trade_cluster',
];

export default function HomePage() {
  const { stories: displayStories, loading, error } = useStories({ limit: 10 });
  const { stories: allStories } = useStories({ limit: 200 });
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const filteredStories = q
    ? allStories.filter(
        (s) => s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q)
      )
    : displayStories;

  const featured = q ? null : (filteredStories.find((s) => s.featured) ?? filteredStories[0] ?? null);
  const rest = featured ? filteredStories.filter((s) => s !== featured) : filteredStories;

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-10 sm:py-16 relative"
      style={{ color: 'var(--color-text-1)' }}
    >
      {/* Decorative grid + radial */}
      <div style={{ pointerEvents: 'none', position: 'fixed', inset: 0, zIndex: 0 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at 50% -20%, var(--color-journal) 0%, transparent 55%)',
            opacity: 0.06,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(235,229,213,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(235,229,213,0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            opacity: 0.4,
          }}
        />
      </div>

      <div className="max-w-5xl mx-auto relative" style={{ zIndex: 1 }}>
        {/* Masthead */}
        <header className="text-center mb-12 sm:mb-16">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span style={{ position: 'relative', display: 'inline-flex', height: 8, width: 8 }}>
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '999px',
                  background: 'var(--color-journal)',
                  opacity: 0.5,
                  animation: 'research-ping 1.6s cubic-bezier(0,0,0.2,1) infinite',
                }}
              />
              <span
                style={{
                  position: 'relative',
                  height: 8,
                  width: 8,
                  borderRadius: '999px',
                  background: 'var(--color-journal)',
                  boxShadow: '0 0 10px var(--color-journal)',
                }}
              />
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: 'var(--color-journal)',
              }}
            >
              WeThePeople Research
            </span>
          </div>
          <h1
            className="mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(40px, 6vw, 72px)',
              letterSpacing: '-0.025em',
              lineHeight: 1,
              color: 'var(--color-text-1)',
            }}
          >
            The Influence Journal
          </h1>
          <p
            className="max-w-2xl mx-auto"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '17px',
              lineHeight: 1.6,
              color: 'var(--color-text-2)',
            }}
          >
            Data-driven investigations into corporate influence on government. Every claim cited.
            Every dollar traced.
          </p>
        </header>

        {/* Search bar */}
        <div className="relative max-w-md mx-auto mb-10">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-3)' }}
          />
          <input
            type="search"
            placeholder="Search stories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full focus:outline-none transition-all"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid rgba(235,229,213,0.1)',
              borderRadius: '10px',
              padding: '10px 14px 10px 38px',
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--color-text-1)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(197,160,40,0.35)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(197,160,40,0.08)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(235,229,213,0.1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Category pills */}
        <nav className="flex flex-wrap items-center justify-center gap-2 mb-12">
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat];
            return (
              <Link
                key={cat}
                to={`/category/${cat}`}
                className="transition-colors no-underline"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  padding: '6px 14px',
                  borderRadius: '999px',
                  border: '1px solid rgba(235,229,213,0.1)',
                  color: 'var(--color-text-2)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(197,160,40,0.35)';
                  e.currentTarget.style.color = 'var(--color-accent-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(235,229,213,0.1)';
                  e.currentTarget.style.color = 'var(--color-text-2)';
                }}
              >
                {meta.label}
              </Link>
            );
          })}
        </nav>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div
              className="animate-spin"
              role="status"
              style={{
                height: 32,
                width: 32,
                borderRadius: '999px',
                border: '2px solid rgba(235,229,213,0.15)',
                borderTopColor: 'var(--color-accent)',
              }}
            >
              <span className="sr-only">Loading stories…</span>
            </div>
          </div>
        )}

        {/* Error / Empty */}
        {error && !loading && <EmptyState message={error} />}
        {!loading && !error && displayStories.length === 0 && <EmptyState />}

        {/* Search results count */}
        {q && !loading && (
          <p
            className="text-center mb-6"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
            }}
          >
            {filteredStories.length} {filteredStories.length === 1 ? 'result' : 'results'} for "
            {search.trim()}"
          </p>
        )}

        {/* Stories */}
        {!loading && !error && filteredStories.length > 0 && (
          <>
            {featured && (
              <section className="mb-12">
                <StoryCard story={featured} featured />
              </section>
            )}

            {rest.length > 0 && (
              <section className="mb-16">
                <div className="flex items-center justify-between mb-6">
                  <h2
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      fontWeight: 700,
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-1)',
                    }}
                  >
                    Recent Investigations
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {rest.map((story) => (
                    <StoryCard key={story.slug} story={story} />
                  ))}
                </div>
              </section>
            )}

            <section className="mb-16">
              <h2
                className="mb-6"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-1)',
                }}
              >
                Browse by Category
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {categories.map((cat) => {
                  const meta = CATEGORY_META[cat];
                  const count = allStories.filter((s) => s.category === cat).length;
                  return (
                    <Link
                      key={cat}
                      to={`/category/${cat}`}
                      className="group flex flex-col items-center text-center no-underline transition-all"
                      style={{
                        padding: '16px 14px',
                        borderRadius: '12px',
                        border: '1px solid rgba(235,229,213,0.08)',
                        background: 'var(--color-surface)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(197,160,40,0.3)';
                        e.currentTarget.style.background = 'var(--color-surface-2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)';
                        e.currentTarget.style.background = 'var(--color-surface)';
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 700,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                          color: 'var(--color-text-1)',
                          marginBottom: 4,
                        }}
                      >
                        {meta.label}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          color: 'var(--color-text-3)',
                        }}
                      >
                        {count} {count === 1 ? 'story' : 'stories'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* Newsletter */}
        <section className="mb-12">
          <NewsletterCTA />
        </section>

        {/* About link */}
        <div className="text-center">
          <Link
            to="/about"
            className="inline-flex items-center gap-2 no-underline transition-colors"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-accent-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-3)';
            }}
          >
            About The Influence Journal
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </main>
  );
}
