import { Link } from 'react-router-dom';
import { Clock, FileText } from 'lucide-react';
import { CategoryBadge } from './CategoryBadge';
import { SectorTag } from './SectorTag';
import type { Story } from '../types';

interface StoryCardProps {
  story: Story;
  featured?: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function StoryCard({ story, featured = false }: StoryCardProps) {
  if (featured) {
    return (
      <Link to={`/story/${story.slug}`} className="group block no-underline">
        <article className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden hover:border-zinc-700 transition-colors">
          {/* Hero placeholder with gradient overlay */}
          <div className="relative h-64 sm:h-80 bg-gradient-to-br from-amber-900/30 via-zinc-900 to-zinc-950">
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
            {/* Pattern overlay for visual interest */}
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(251,191,36,0.4) 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }} />
            <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
              <div className="flex items-center gap-2 mb-3">
                <CategoryBadge category={story.category} size="md" />
                <SectorTag sector={story.sector} />
              </div>
              <h2
                className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 group-hover:text-amber-400 transition-colors leading-tight"
                style={{ fontFamily: 'Oswald, sans-serif' }}
              >
                {story.title}
              </h2>
              <p className="text-zinc-400 text-base leading-relaxed line-clamp-2 max-w-3xl">
                {story.summary}
              </p>
              <div className="flex items-center gap-4 mt-4 text-sm text-zinc-500">
                <span>{formatDate(story.published_at)}</span>
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {story.read_time_minutes || Math.max(1, Math.ceil(((story.body || story.content || '').split(/\s+/).length) / 200))} min
                </span>
                <span className="flex items-center gap-1">
                  <FileText size={14} />
                  {story.data_sources?.length ?? story.citations?.length ?? 0} sources
                </span>
              </div>
            </div>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link to={`/story/${story.slug}`} className="group block no-underline">
      <article className="flex flex-col h-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all">
        <div className="flex items-center gap-2 mb-3">
          <CategoryBadge category={story.category} />
          <SectorTag sector={story.sector} />
        </div>
        <h3
          className="text-lg font-bold text-white mb-2 group-hover:text-amber-400 transition-colors leading-snug"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          {story.title}
        </h3>
        <p className="text-sm text-zinc-400 leading-relaxed line-clamp-3 flex-1 mb-4">
          {story.summary}
        </p>
        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-auto">
          <span>{formatDate(story.published_at)}</span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {story.read_time_minutes} min
          </span>
          <span className="flex items-center gap-1">
            <FileText size={12} />
            {story.citations?.length ?? 0} sources
          </span>
        </div>
      </article>
    </Link>
  );
}
