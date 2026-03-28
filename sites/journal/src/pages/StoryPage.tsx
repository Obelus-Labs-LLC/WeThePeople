import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, FileText, Link2, Share2 } from 'lucide-react';
import { CategoryBadge } from '../components/CategoryBadge';
import { SectorTag } from '../components/SectorTag';
import { StoryCard } from '../components/StoryCard';
import { useStory } from '../hooks/useStories';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function copyLink() {
  navigator.clipboard.writeText(window.location.href).catch(() => {});
}

function shareOnTwitter(title: string) {
  const text = encodeURIComponent(title);
  const url = encodeURIComponent(window.location.href);
  window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, '_blank');
}

/**
 * Very basic content renderer. If the story content contains markdown-style
 * paragraphs (double newlines), we split and render each as a <p>. Otherwise
 * render as a single block.
 */
function renderContent(content: string) {
  const paragraphs = content.split(/\n{2,}/).filter(Boolean);
  if (paragraphs.length <= 1) {
    return <p className="text-zinc-300 leading-[1.85] text-base">{content}</p>;
  }
  return paragraphs.map((para, i) => (
    <p key={i} className="text-zinc-300 leading-[1.85] text-base mb-6">
      {para}
    </p>
  ));
}

export default function StoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { story, related, loading, error } = useStory(slug);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
      </main>
    );
  }

  if (error || !story) {
    return (
      <main className="flex-1 px-4 py-20">
        <div className="max-w-xl mx-auto text-center">
          <h1
            className="text-3xl font-bold text-white mb-4"
            style={{ fontFamily: 'Oswald, sans-serif' }}
          >
            Story Not Found
          </h1>
          <p className="text-zinc-400 mb-6">
            {error || 'This story could not be loaded.'}
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
      <article className="max-w-[720px] mx-auto">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          Back to Journal
        </Link>

        {/* Category + sector */}
        <div className="flex items-center gap-2 mb-4">
          <CategoryBadge category={story.category} size="md" />
          <SectorTag sector={story.sector} />
        </div>

        {/* Title */}
        <h1
          className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-5"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          {story.title}
        </h1>

        {/* Byline */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500 mb-8 pb-8 border-b border-zinc-800">
          <span className="font-medium text-zinc-400">WeThePeople Research</span>
          <span className="text-zinc-700">|</span>
          <span>{formatDate(story.published_at)}</span>
          <span className="text-zinc-700">|</span>
          <span className="flex items-center gap-1">
            <Clock size={14} />
            {story.read_time_minutes} min read
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex items-center gap-1">
            <FileText size={14} />
            {story.citations?.length ?? 0} cited sources
          </span>
        </div>

        {/* Summary / lede */}
        <div className="mb-8">
          <p className="text-lg text-zinc-300 leading-relaxed font-medium">
            {story.summary}
          </p>
        </div>

        {/* Body */}
        <div className="mb-12">
          {renderContent(story.content)}
        </div>

        {/* Share buttons */}
        <div className="flex items-center gap-3 mb-10 pb-10 border-b border-zinc-800">
          <span className="text-xs text-zinc-500 uppercase tracking-wider mr-2">Share</span>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer bg-transparent"
          >
            <Link2 size={14} />
            Copy Link
          </button>
          <button
            onClick={() => shareOnTwitter(story.title)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer bg-transparent"
          >
            <Share2 size={14} />
            Share on X
          </button>
        </div>

        {/* Citations */}
        {story.citations && story.citations.length > 0 && (
          <section className="mb-10 pb-10 border-b border-zinc-800">
            <h2
              className="text-xl font-bold text-white mb-4"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              Sources & Citations
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              All data sourced from public government records and verified databases.
            </p>
            <ol className="space-y-3">
              {story.citations.map((cite, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="text-amber-400 font-mono text-xs mt-0.5 shrink-0">
                    [{i + 1}]
                  </span>
                  <div>
                    <span className="text-zinc-300">{cite.label}</span>
                    {cite.source_type && (
                      <span className="text-zinc-600 ml-2 text-xs">
                        ({cite.source_type})
                      </span>
                    )}
                    {cite.url && (
                      <a
                        href={cite.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-amber-400/70 hover:text-amber-400 text-xs transition-colors"
                      >
                        View source
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Disclaimer */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 mb-12">
          <p className="text-xs text-zinc-500 leading-relaxed">
            <span className="font-semibold text-zinc-400">Disclaimer:</span>{' '}
            This investigation is based entirely on public government records.
            No editorial opinions are expressed. Data is sourced from
            Senate LDA filings, USASpending.gov, SEC EDGAR, Federal Register,
            and other publicly available government databases. For methodology
            details, visit{' '}
            <a
              href="https://wethepeopleforus.com/methodology"
              className="text-amber-400/70 hover:text-amber-400 transition-colors"
            >
              our methodology page
            </a>.
          </p>
        </div>

        {/* Related stories */}
        {related.length > 0 && (
          <section>
            <h2
              className="text-xl font-bold text-white mb-5"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              More Investigations
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {related.map((s) => (
                <StoryCard key={s.slug} story={s} />
              ))}
            </div>
          </section>
        )}
      </article>
    </main>
  );
}
