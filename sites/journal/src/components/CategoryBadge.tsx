import { CATEGORY_META, type StoryCategory, type CategoryMeta } from '../types';

interface CategoryBadgeProps {
  category: StoryCategory;
  size?: 'sm' | 'md';
}

const FALLBACK: CategoryMeta = {
  label: 'Story',
  color: 'var(--color-text-2)',
  bg: 'rgba(235,229,213,0.08)',
};

export function CategoryBadge({ category, size = 'sm' }: CategoryBadgeProps) {
  const meta = CATEGORY_META[category] ?? { ...FALLBACK, label: category };
  const isMd = size === 'md';

  return (
    <span
      className="inline-block"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: isMd ? '11px' : '10px',
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        padding: isMd ? '4px 10px' : '3px 8px',
        borderRadius: '999px',
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.color}33`,
      }}
    >
      {meta.label}
    </span>
  );
}
