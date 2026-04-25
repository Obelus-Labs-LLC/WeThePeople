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
      .finally(() => {
        // Avoid setting state after unmount/abort.
        if (!controller.signal.aborted) setLoading(false);
      });

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
    // Single async path so the fallback fetch is awaited inside the
    // catch — previously .finally fired BEFORE the fallback completed,
    // showing "Story not found" briefly on slow networks before the
    // fallback resolved with a real story.
    (async () => {
      try {
        const data = await apiFetch<Story>(`/stories/${slug}`, { signal: controller.signal });
        setStory(data);
        try {
          const relData = await apiFetch<StoriesResponse | Story[]>(
            '/stories/latest',
            { params: { limit: 4 }, signal: controller.signal },
          );
          const items = Array.isArray(relData) ? relData : (relData as StoriesResponse).stories ?? [];
          setRelated(items.filter((s) => s.slug !== slug).slice(0, 3));
        } catch (relErr: unknown) {
          if ((relErr as { name?: string })?.name !== 'AbortError') {
            // Related-stories failure is non-fatal; just leave the list empty.
            console.warn('[useStory] related fetch failed:', relErr);
          }
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        // Primary endpoint failed — try the fallback before showing
        // "not found", and only flip loading off after it settles.
        try {
          const data = await apiFetch<StoriesResponse | Story[]>(
            '/stories/latest',
            { params: { limit: 20 }, signal: controller.signal },
          );
          const items = Array.isArray(data) ? data : data.stories ?? [];
          const found = items.find((s) => s.slug === slug);
          if (found) {
            setStory(found);
            setRelated(items.filter((s) => s.slug !== slug).slice(0, 3));
          } else {
            setError('Story not found');
          }
        } catch (fallbackErr: unknown) {
          if ((fallbackErr as { name?: string })?.name !== 'AbortError') {
            setError((fallbackErr as Error)?.message || 'Failed to load story');
          }
        }
      } finally {
        // Only flip loading off if the request hasn't been aborted; the
        // unmount cleanup also flips it implicitly because the component
        // is gone.
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [slug]);

  return { story, related, loading, error };
}
