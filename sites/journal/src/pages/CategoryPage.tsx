import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { StoryCard } from '../components/StoryCard';
import { EmptyState } from '../components/EmptyState';
import { useStories } from '../hooks/useStories';
import { CATEGORY_META, type StoryCategory } from '../types';

const validCategories: StoryCategory[] = ['lobbying', 'contracts', 'enforcement', 'trades', 'regulatory'];

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>();
  const cat = (category ?? '') as StoryCategory;
  const isValid = validCategories.includes(cat);

  // Fetch all stories, filter client-side (API may or may not support category filter)
  const { stories, loading, error } = useStories({ limit: 20, category: isValid ? cat : undefined });

  const meta = isValid ? CATEGORY_META[cat] : null;
  const filtered = isValid
    ? stories.filter((s) => s.category === cat)
    : stories;

  if (!isValid) {
    return (
      <main className="flex-1 px-4 py-20">
        <div className="max-w-xl mx-auto text-center">
          <h1
            className="text-3xl font-bold text-white mb-4"
            style={{ fontFamily: 'Oswald, sans-serif' }}
          >
            Unknown Category
          </h1>
          <p className="text-zinc-400 mb-6">
            "{category}" is not a recognized investigation category.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Journal
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-4 py-10 sm:py-16">
      <div className="max-w-5xl mx-auto">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          Back to Journal
        </Link>

        {/* Header */}
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-400 font-medium mb-2">
            Category
          </p>
          <h1
            className={`text-3xl sm:text-4xl font-bold mb-2 ${meta?.color ?? 'text-white'}`}
            style={{ fontFamily: 'Oswald, sans-serif' }}
          >
            {meta?.label ?? category}
          </h1>
          <p className="text-zinc-400 text-base">
            Investigations tracking {meta?.label.toLowerCase()} activity across all sectors.
          </p>
        </header>

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
        {!loading && !error && filtered.length === 0 && (
          <EmptyState message={`No ${meta?.label.toLowerCase()} investigations yet. Check back soon.`} />
        )}

        {/* Stories grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {filtered.map((story) => (
              <StoryCard key={story.slug} story={story} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
