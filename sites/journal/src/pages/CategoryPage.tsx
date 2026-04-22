import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { StoryCard } from '../components/StoryCard';
import { EmptyState } from '../components/EmptyState';
import { useStories } from '../hooks/useStories';
import { CATEGORY_META, type StoryCategory } from '../types';

const validCategories: string[] = Object.keys(CATEGORY_META);

const backLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  textDecoration: 'none',
  transition: 'color 0.2s',
};

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>();
  const cat = (category ?? '') as StoryCategory;
  const isValid = validCategories.includes(cat);

  const { stories, loading, error } = useStories({ limit: 20, category: isValid ? cat : undefined });

  const meta = isValid ? CATEGORY_META[cat] : null;
  const filtered = isValid ? stories.filter((s) => s.category === cat) : stories;

  if (!isValid) {
    return (
      <main id="main-content" className="flex-1 px-4 py-20">
        <div className="max-w-xl mx-auto text-center">
          <h1
            className="mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(32px, 5vw, 48px)',
              color: 'var(--color-text-1)',
            }}
          >
            Unknown Category
          </h1>
          <p
            className="mb-6"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              color: 'var(--color-text-2)',
            }}
          >
            "{category}" is not a recognized investigation category.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2"
            style={{ ...backLinkStyle, color: 'var(--color-accent-text)' }}
          >
            <ArrowLeft size={14} />
            Back to Journal
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-10 sm:py-16"
      style={{ color: 'var(--color-text-1)' }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 mb-8"
          style={backLinkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
        >
          <ArrowLeft size={12} />
          Back to Journal
        </Link>

        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-2 mb-3">
            <span
              style={{
                height: 8,
                width: 8,
                borderRadius: '999px',
                background: meta?.color ?? 'var(--color-accent)',
                boxShadow: `0 0 10px ${meta?.color ?? 'var(--color-accent)'}`,
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: meta?.color ?? 'var(--color-accent-text)',
              }}
            >
              Category · {meta?.label ?? category}
            </span>
          </div>
          <h1
            className="mb-3"
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(40px, 6vw, 64px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.04,
              color: 'var(--color-text-1)',
            }}
          >
            {meta?.label ?? category}
          </h1>
          <p
            className="max-w-2xl"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '16px',
              lineHeight: 1.65,
              color: 'var(--color-text-2)',
            }}
          >
            Investigations tracking {meta?.label.toLowerCase()} activity across all sectors.
          </p>
        </header>

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

        {/* Error */}
        {error && !loading && <EmptyState message={error} />}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState message={`No ${meta?.label.toLowerCase()} investigations yet. Check back soon.`} />
        )}

        {/* Stories grid */}
        {!loading && !error && filtered.length > 0 && (
          <>
            <p
              className="mb-5"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--color-text-3)',
              }}
            >
              {filtered.length} {filtered.length === 1 ? 'investigation' : 'investigations'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {filtered.map((story) => (
                <StoryCard key={story.slug} story={story} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
