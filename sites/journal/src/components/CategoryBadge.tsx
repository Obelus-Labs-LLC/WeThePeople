import { CATEGORY_META, type StoryCategory } from '../types';

interface CategoryBadgeProps {
  category: StoryCategory;
  size?: 'sm' | 'md';
}

export function CategoryBadge({ category, size = 'sm' }: CategoryBadgeProps) {
  const meta = CATEGORY_META[category] ?? {
    label: category,
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-400/15',
  };

  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-sm px-3 py-1';

  return (
    <span
      className={`inline-block rounded-full font-medium uppercase tracking-wider ${meta.color} ${meta.bgColor} ${sizeClasses}`}
    >
      {meta.label}
    </span>
  );
}
