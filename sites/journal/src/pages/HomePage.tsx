import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { StoryCard } from '../components/StoryCard';
import { NewsletterCTA } from '../components/NewsletterCTA';
import { EmptyState } from '../components/EmptyState';
import { useStories } from '../hooks/useStories';
import { CATEGORY_META, type StoryCategory } from '../types';

/**
 * Influence Journal home — editorial masthead + featured story + 3-col
 * latest grid + newsletter CTA. Matches the layout from the
 * `WTP Ecosystem Sites.html` Journal section:
 *
 *   - Centered masthead: small mono URL overline, big italic Playfair
 *     "The Influence Journal", 60×2 crimson rule, tagline
 *   - Featured story (uses the existing StoryCard `featured` variant —
 *     same data shape so no API change required)
 *   - "Latest" overline + 3-column StoryCard grid
 *   - Newsletter CTA
 *   - Search + Category browse (kept below the editorial fold so the page
 *     reads like a magazine first, search-second)
 *
 * Data still flows through useStories(/stories/latest) — no backend change.
 */

const categories: StoryCategory[] = [
  'contract_windfall',
  'revolving_door',
  'bipartisan_buying',
  'stock_act_violation',
  'committee_stock_trade',
  'prolific_trader',
  'enforcement_immunity',
  'penalty_contract_ratio',
  'lobbying_spike',
  'enforcement_gap',
  'trade_timing',
  'full_influence_loop',
  'foreign_lobbying',
  'regulatory_capture',
  'regulatory_arbitrage',
  'trade_cluster',
];

export default function HomePage() {
  const { stories: displayStories, loading, error } = useStories({ limit: 10 });
  const { stories: allStories } = useStories({ limit: 200 });
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const filteredStories = q
    ? allStories.filter(
        (s) => s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q),
      )
    : displayStories;

  // Featured = first explicitly-flagged story, falling back to most recent.
  // Skip featuring while a search is active so the result list isn't split.
  const featured = q
    ? null
    : (filteredStories.find((s) => s.featured) ?? filteredStories[0] ?? null);
  const rest = featured ? filteredStories.filter((s) => s !== featured) : filteredStories;

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-10 sm:py-14 relative"
      style={{ color: 'var(--color-text-1)' }}
    >
      {/* Decorative background — soft crimson radial + subtle grid. */}
      <div
        aria-hidden
        style={{ pointerEvents: 'none', position: 'fixed', inset: 0, zIndex: 0 }}
      >
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
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <header
          className="text-center"
          style={{
            paddingBottom: 28,
            borderBottom: '1px solid var(--color-border)',
            marginBottom: 36,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              marginBottom: 10,
            }}
          >
            wethepeopleforus.com
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(36px, 6vw, 56px)',
              letterSpacing: '-0.02em',
              lineHeight: 1.0,
              color: 'var(--color-text-1)',
              marginBottom: 12,
            }}
          >
            The Influence Journal
          </h1>
          <div
            aria-hidden
            style={{
              width: 60,
              height: 2,
              background: 'var(--color-journal)',
              margin: '0 auto 12px',
            }}
          />
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--color-text-3)',
              maxWidth: 520,
              margin: '0 auto',
              lineHeight: 1.55,
            }}
          >
            Data-driven investigations into corporate influence on American democracy.
            Every claim cited. Every dollar traced.
          </p>
        </header>

        {/* ── Loading / error / empty states ───────────────────────── */}
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
        {error && !loading && <EmptyState message={error} />}
        {!loading && !error && displayStories.length === 0 && <EmptyState />}

        {/* ── Search results count (only while filtering) ───────────── */}
        {q && !loading && (
          <p
            className="text-center mb-6"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
            }}
          >
            {filteredStories.length} {filteredStories.length === 1 ? 'result' : 'results'} for &ldquo;
            {search.trim()}&rdquo;
          </p>
        )}

        {/* ── Featured + Latest grid ───────────────────────────────── */}
        {!loading && !error && filteredStories.length > 0 && (
          <>
            {featured && (
              <section className="mb-12">
                <StoryCard story={featured} featured />
              </section>
            )}

            {rest.length > 0 && (
              <section style={{ marginBottom: 56 }}>
                <div
                  className="flex items-center justify-between"
                  style={{ marginBottom: 16 }}
                >
                  <h2
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-3)',
                    }}
                  >
                    Latest
                  </h2>
                  <Link
                    to="/coverage"
                    className="no-underline"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--color-accent-text)',
                    }}
                  >
                    Browse all →
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {rest.map((story) => (
                    <StoryCard key={story.slug} story={story} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── Newsletter ───────────────────────────────────────────── */}
        <section className="mb-16">
          <NewsletterCTA />
        </section>

        {/* ── Search + Category browse (post-fold tools) ───────────── */}
        <section style={{ marginBottom: 48 }}>
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--color-text-3)',
              }}
            >
              Search & Browse
            </h2>
          </div>

          {/* Search input — sticks out on its own row so the cursor target is
              obvious; pressing Enter doesn't navigate, just filters in place. */}
          <div className="relative max-w-md mb-6">
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
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: '10px 14px 10px 38px',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'var(--color-text-1)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(230,57,70,0.45)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(230,57,70,0.10)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          <nav className="flex flex-wrap items-center gap-2" aria-label="Browse by category">
            {categories.map((cat) => {
              const meta = CATEGORY_META[cat];
              return (
                <Link
                  key={cat}
                  to={`/category/${cat}`}
                  className="transition-colors no-underline"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-2)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(230,57,70,0.4)';
                    e.currentTarget.style.color = 'var(--color-accent-text)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.color = 'var(--color-text-2)';
                  }}
                >
                  {meta?.label ?? cat}
                </Link>
              );
            })}
          </nav>
        </section>

        {/* ── About link ──────────────────────────────────────────── */}
        <div className="text-center">
          <Link
            to="/about"
            className="inline-flex items-center gap-2 no-underline transition-colors"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
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
            About The Influence Journal →
          </Link>
        </div>
      </div>
    </main>
  );
}
