import { useState, useEffect } from 'react';
import { apiFetch } from '../api/client';
import type { Story, StoriesResponse, StoryCategory } from '../types';

interface UseStoriesOptions {
  limit?: number;
  category?: StoryCategory;
}

interface UseStoriesResult {
  stories: Story[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetch stories from the API. Handles loading/error states.
 */
export function useStories(opts?: UseStoriesOptions): UseStoriesResult {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = opts?.limit ?? (opts?.category ? 50 : 10);
  const category = opts?.category;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params: Record<string, string | number> = { limit };
    if (category) params.category = category;

    apiFetch<StoriesResponse | Story[]>('/stories/latest', {
      params,
      signal: controller.signal,
    })
      .then((data) => {
        // Handle both { stories: [...] } and plain array responses
        const items = Array.isArray(data) ? data : data.stories ?? [];
        setStories(items);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load stories');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [limit, category]);

  return { stories, loading, error };
}

/**
 * Fetch a single story by slug. First tries /stories/{slug}, falls back
 * to loading all and filtering client-side.
 */
export function useStory(slug: string | undefined) {
  const [story, setStory] = useState<Story | null>(null);
  const [related, setRelated] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    // Try the slug endpoint first
    apiFetch<Story>(`/stories/${slug}`, { signal: controller.signal })
      .then((data) => {
        setStory(data);
        // Try to get related stories
        return apiFetch<StoriesResponse | Story[]>('/stories/latest', {
          params: { limit: 4 },
          signal: controller.signal,
        }).catch(() => []);
      })
      .then((relData) => {
        const items = Array.isArray(relData) ? relData : (relData as StoriesResponse).stories ?? [];
        setRelated(items.filter((s) => s.slug !== slug).slice(0, 3));
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        // Fallback: load all stories and filter client-side
        apiFetch<StoriesResponse | Story[]>('/stories/latest', {
          params: { limit: 20 },
          signal: controller.signal,
        })
          .then((data) => {
            const items = Array.isArray(data) ? data : data.stories ?? [];
            const found = items.find((s) => s.slug === slug);
            if (found) {
              setStory(found);
              setRelated(items.filter((s) => s.slug !== slug).slice(0, 3));
            } else {
              setError('Story not found');
            }
          })
          .catch((fallbackErr) => {
            if (fallbackErr.name !== 'AbortError') {
              setError(fallbackErr.message || 'Failed to load story');
            }
          });
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [slug]);

  return { story, related, loading, error };
}
