import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { StoryCard } from '../components/StoryCard';
import { NewsletterCTA } from '../components/NewsletterCTA';
import { EmptyState } from '../components/EmptyState';
import { useStories } from '../hooks/useStories';
import { CATEGORY_META, type StoryCategory } from '../types';

const categories: StoryCategory[] = ['lobbying', 'contracts', 'enforcement', 'trades', 'regulatory'];

export default function HomePage() {
  const { stories, loading, error } = useStories({ limit: 10 });

  const featured = stories.find((s) => s.featured) ?? stories[0] ?? null;
  const rest = stories.filter((s) => s !== featured);

  return (
    <main className="flex-1 px-4 py-10 sm:py-16">
      <div className="max-w-5xl mx-auto">
        {/* Masthead */}
        <header className="text-center mb-12 sm:mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-400 font-medium mb-3">
            WeThePeople Research
          </p>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-3"
            style={{ fontFamily: 'Oswald, sans-serif' }}
          >
            The Influence Journal
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
            Data-driven investigations into corporate influence on government.
            Every claim cited. Every dollar traced.
          </p>
        </header>

        {/* Category pills */}
        <nav className="flex flex-wrap items-center justify-center gap-2 mb-10">
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat];
            return (
              <Link
                key={cat}
                to={`/category/${cat}`}
                className={`text-xs px-3 py-1.5 rounded-full border border-zinc-800 hover:border-zinc-700 transition-colors font-medium ${meta.color}`}
              >
                {meta.label}
              </Link>
            );
          })}
        </nav>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <EmptyState message={error} />
        )}

        {/* Empty */}
        {!loading && !error && stories.length === 0 && (
          <EmptyState />
        )}

        {/* Stories */}
        {!loading && !error && stories.length > 0 && (
          <>
            {/* Featured story */}
            {featured && (
              <section className="mb-10">
                <StoryCard story={featured} featured />
              </section>
            )}

            {/* Recent stories grid */}
            {rest.length > 0 && (
              <section className="mb-16">
                <div className="flex items-center justify-between mb-6">
                  <h2
                    className="text-xl font-bold text-white"
                    style={{ fontFamily: 'Oswald, sans-serif' }}
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

            {/* Browse by category */}
            <section className="mb-16">
              <h2
                className="text-xl font-bold text-white mb-6"
                style={{ fontFamily: 'Oswald, sans-serif' }}
              >
                Browse by Category
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {categories.map((cat) => {
                  const meta = CATEGORY_META[cat];
                  const count = stories.filter((s) => s.category === cat).length;
                  return (
                    <Link
                      key={cat}
                      to={`/category/${cat}`}
                      className="group flex flex-col items-center rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-5 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all text-center"
                    >
                      <span className={`text-sm font-semibold mb-1 group-hover:text-amber-400 transition-colors ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {count} {count === 1 ? 'story' : 'stories'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* Newsletter CTA */}
        <section className="mb-12">
          <NewsletterCTA />
        </section>

        {/* About link */}
        <div className="text-center">
          <Link
            to="/about"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-amber-400 transition-colors"
          >
            About The Influence Journal
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </main>
  );
}
