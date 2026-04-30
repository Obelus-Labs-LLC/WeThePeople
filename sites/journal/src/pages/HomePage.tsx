import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { StoryCard } from '../components/StoryCard';
import { NewsletterCTA } from '../components/NewsletterCTA';
import { EmptyState } from '../components/EmptyState';
import { usePersonalization } from '../components/Personalization';
import { useStories } from '../hooks/useStories';
import { usePageMeta } from '../hooks/usePageMeta';
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

// Maps the user's selected sectors (frontend keys) to the values
// that show up on Story.sector. The legacy keys (banking, tech,
// healthcare) are still listed so localStorage records from the
// v1 onboarding still match. Keep aligned with the
// sector_to_lifestyle map in routers/stories.py.
const SECTOR_KEY_TO_STORY_SECTORS: Record<string, string[]> = {
  finance:        ['finance'],
  banking:        ['finance'],
  health:         ['health'],
  healthcare:     ['health'],
  housing:        ['housing'],
  energy:         ['energy'],
  transportation: ['transportation', 'energy'],
  technology:     ['technology', 'tech'],
  tech:           ['technology', 'tech'],
  telecom:        ['telecom'],
  education:      ['education'],
  agriculture:    ['agriculture'],
  food:           ['agriculture'],
  chemicals:      ['chemicals'],
  defense:        ['defense'],
};

export default function HomePage() {
  // Single fetch covers both the home rail (first 10) and the search
  // index (full set). Avoids two parallel /stories/latest calls on
  // every cold visit and removes the brief race where the second
  // request resolved out-of-order and replaced the displayed list.
  const { stories: allStories, loading, error } = useStories({ limit: 200 });
  const { state: pState, openModal } = usePersonalization();
  const [search, setSearch] = useState('');
  const [personalizationOff, setPersonalizationOff] = useState(false);

  // First-visit prompt: if the reader has never onboarded, open the
  // modal automatically once the homepage has settled. Gated on a
  // session-scoped sentinel so we don't re-prompt on every refresh
  // within a tab (the persistent 90-day TTL still lives in
  // localStorage). PersonalizationProvider is the source of truth
  // for whether the modal opens.
  useEffect(() => {
    if (pState) return;
    if (typeof window === 'undefined') return;
    try {
      const seen = window.sessionStorage.getItem('wtp.onboarding.prompted');
      if (seen) return;
      window.sessionStorage.setItem('wtp.onboarding.prompted', '1');
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => openModal(), 600);
    return () => clearTimeout(t);
  }, [pState, openModal]);

  // Build the set of allowed Story.sector values from the user's
  // selected sectors. Falls back to "all" when the user hasn't
  // onboarded or has explicitly toggled personalization off.
  const allowedSectors = useMemo<Set<string> | null>(() => {
    if (!pState || personalizationOff) return null;
    if (!pState.lifestyle?.length) return null;
    const out = new Set<string>();
    for (const k of pState.lifestyle) {
      for (const s of SECTOR_KEY_TO_STORY_SECTORS[k] ?? []) out.add(s);
    }
    return out.size > 0 ? out : null;
  }, [pState, personalizationOff]);

  const personalizedStories = useMemo(() => {
    if (!allowedSectors) return allStories;
    const filtered = allStories.filter((s) =>
      s.sector ? allowedSectors.has(s.sector.toLowerCase()) : false,
    );
    // Cold-start protection: if the personalized filter would show
    // nothing, fall back to the full list rather than rendering an
    // empty masthead. The active-filter banner still tells the
    // reader the filter applied.
    return filtered.length > 0 ? filtered : allStories;
  }, [allStories, allowedSectors]);

  const displayStories = useMemo(
    () => personalizedStories.slice(0, 10),
    [personalizedStories],
  );

  usePageMeta({
    title: 'The Influence Journal — Data-Driven Civic Investigations',
    description:
      'Data-driven investigations into corporate influence on American democracy. Every claim cited, every dollar traced.',
    canonical: 'https://journal.wethepeopleforus.com/',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'The Influence Journal',
      url: 'https://journal.wethepeopleforus.com/',
      publisher: {
        '@type': 'Organization',
        name: 'WeThePeople Research',
        url: 'https://wethepeopleforus.com',
      },
    },
  });

  const q = search.trim().toLowerCase();
  // Search runs across the full library (no personalization filter)
  // so a reader can always find any story by name. The personalized
  // filter only affects the front-page browse view.
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
        {error && !loading && (
          <div
            role="alert"
            style={{
              borderRadius: '14px',
              border: '1px solid rgba(230,57,70,0.35)',
              background: 'rgba(230,57,70,0.06)',
              padding: '18px 22px',
              marginBottom: 24,
              textAlign: 'center',
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--color-red)',
            }}
          >
            {error}
          </div>
        )}
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

        {/* ── Personalized-feed banner ─────────────────────────────────
            Only shows for onboarded users, only when not searching.
            "Showing X for [sectors] · Edit · Show all" makes the
            filter visible (so the reader is never confused why the
            list is shorter than expected) and undoable in one click. */}
        {!q && allowedSectors && pState && pState.lifestyle.length > 0 && (
          <div
            className="flex items-center justify-between flex-wrap gap-3"
            style={{
              marginBottom: 24,
              padding: '10px 14px',
              border: '1px solid rgba(197,160,40,0.2)',
              background: 'rgba(197,160,40,0.05)',
              borderRadius: 10,
              fontFamily: 'var(--font-body)',
              fontSize: 13,
            }}
          >
            <div style={{ color: 'var(--color-text-2)' }}>
              <span style={{ color: 'var(--color-text-1)', fontWeight: 600 }}>
                Showing your sectors:{' '}
              </span>
              {pState.lifestyle.join(', ')}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => openModal()}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  color: 'var(--color-accent-text)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setPersonalizationOff(true)}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  color: 'var(--color-text-2)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                }}
              >
                Show all stories
              </button>
            </div>
          </div>
        )}

        {/* "Personalize your feed" prompt for unauthenticated/un-onboarded
            readers. Sits where the banner would otherwise be so the
            same vertical real estate is used for either state. */}
        {!q && !pState && !loading && !error && (
          <div
            className="flex items-center justify-between flex-wrap gap-3"
            style={{
              marginBottom: 24,
              padding: '10px 14px',
              border: '1px solid rgba(197,160,40,0.2)',
              background: 'rgba(197,160,40,0.05)',
              borderRadius: 10,
              fontFamily: 'var(--font-body)',
              fontSize: 13,
            }}
          >
            <div style={{ color: 'var(--color-text-1)' }}>
              <strong>Personalize your story feed.</strong>{' '}
              <span style={{ color: 'var(--color-text-2)' }}>
                Pick the sectors and concerns that matter to you and we&apos;ll
                surface stories that affect your bills and your reps.
              </span>
            </div>
            <button
              type="button"
              onClick={() => openModal()}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid rgba(197,160,40,0.4)',
                background: 'transparent',
                color: 'var(--color-accent-text)',
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Personalize (30 sec)
            </button>
          </div>
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
