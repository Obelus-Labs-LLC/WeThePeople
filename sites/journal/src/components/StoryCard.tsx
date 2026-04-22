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
  const readMinutes =
    story.read_time_minutes ||
    Math.max(1, Math.ceil(((story.body || story.content || '').split(/\s+/).length) / 200));
  const sourceCount = story.data_sources?.length ?? story.citations?.length ?? 0;

  if (featured) {
    return (
      <Link to={`/story/${story.slug}`} className="group block no-underline">
        <article
          className="relative overflow-hidden"
          style={{
            borderRadius: '16px',
            border: '1px solid rgba(235,229,213,0.08)',
            background: 'var(--color-surface)',
            transition: 'border-color 0.25s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(197,160,40,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(235,229,213,0.08)';
          }}
        >
          {/* Hero panel */}
          <div
            className="relative h-64 sm:h-80"
            style={{
              background:
                'radial-gradient(ellipse at 20% 10%, rgba(197,160,40,0.18) 0%, transparent 55%), linear-gradient(160deg, #141C25, #07090C)',
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, rgba(197,160,40,0.18) 1px, transparent 0)',
                backgroundSize: '24px 24px',
                opacity: 0.5,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, #07090C 0%, rgba(7,9,12,0.6) 60%, transparent 100%)',
              }}
            />
            <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
              <div className="flex items-center gap-2 mb-3">
                <CategoryBadge category={story.category} size="md" />
                <SectorTag sector={story.sector} />
              </div>
              <h2
                className="mb-3 leading-[1.08]"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  fontWeight: 900,
                  fontSize: 'clamp(28px, 4vw, 44px)',
                  letterSpacing: '-0.02em',
                  color: 'var(--color-text-1)',
                  transition: 'color 0.2s',
                }}
              >
                {story.title}
              </h2>
              <p
                className="line-clamp-2 max-w-3xl"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '16px',
                  lineHeight: 1.6,
                  color: 'var(--color-text-2)',
                }}
              >
                {story.summary}
              </p>
              <div
                className="flex items-center gap-4 mt-4"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-3)',
                }}
              >
                <span>{formatDate(story.published_at)}</span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {readMinutes} min
                </span>
                <span className="flex items-center gap-1">
                  <FileText size={12} />
                  {sourceCount} sources
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
      <article
        className="flex flex-col h-full"
        style={{
          padding: '20px',
          borderRadius: '14px',
          border: '1px solid rgba(235,229,213,0.08)',
          background: 'var(--color-surface)',
          transition: 'border-color 0.25s, background 0.25s',
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
        <div className="flex items-center gap-2 mb-3">
          <CategoryBadge category={story.category} />
          <SectorTag sector={story.sector} />
        </div>
        <h3
          className="mb-2 leading-snug"
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: '22px',
            letterSpacing: '-0.01em',
            color: 'var(--color-text-1)',
          }}
        >
          {story.title}
        </h3>
        <p
          className="line-clamp-3 flex-1 mb-4"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            lineHeight: 1.6,
            color: 'var(--color-text-2)',
          }}
        >
          {story.summary}
        </p>
        <div
          className="flex items-center gap-3 mt-auto"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--color-text-3)',
          }}
        >
          <span>{formatDate(story.published_at)}</span>
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {readMinutes} min
          </span>
          <span className="flex items-center gap-1">
            <FileText size={11} />
            {sourceCount} sources
          </span>
        </div>
      </article>
    </Link>
  );
}
