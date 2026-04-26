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
 * Friendly user-facing version of an API error. Keeps the raw message
 * out of the UI so visitors don't see "API error 502: Bad Gateway".
 */
function friendlyError(raw: unknown): string {
  if ((raw as { name?: string })?.name === 'AbortError') return '';
  return "We couldn't load stories right now. Please refresh the page.";
}

function friendlyStoryError(raw: unknown): string {
  if ((raw as { name?: string })?.name === 'AbortError') return '';
  return "We couldn't load this story right now. Please refresh the page.";
}

/**
 * Fetch stories from the API. Handles loading/error/abort states.
 *
 * The `limit` parameter is taken straight from `opts` so the caller's
 * choice is what drives the request — earlier code derived a default
 * inside the hook which made the dependency-array semantics confusing
 * when only `category` changed.
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
        if (controller.signal.aborted) return;
        const items = Array.isArray(data) ? data : data.stories ?? [];
        setStories(items);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const msg = friendlyError(err);
        if (msg) setError(msg);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });

    return () => controller.abort();
  }, [limit, category]);

  return { stories, loading, error };
}

/**
 * In-memory single-story cache, keyed by slug. Prevents duplicate
 * fetches when a user clicks rapidly between related stories or hits
 * Back/Forward — the second mount resolves from cache instantly while
 * a background revalidation request keeps the data fresh.
 *
 * Lives at module scope so it survives re-renders but resets on full
 * reloads, which is the right tradeoff for a public site (don't pin
 * stale data, but don't refetch on intra-session navigation either).
 */
const storyCache = new Map<string, Story>();

interface UseStoryResult {
  story: Story | null;
  related: Story[];
  loading: boolean;
  /** True while related-stories is in flight, even if `loading` is false. */
  relatedLoading: boolean;
  error: string | null;
}

/**
 * Fetch a single story by slug. First tries /stories/{slug}, falls
 * back to /stories/latest and filtering client-side.
 */
export function useStory(slug: string | undefined): UseStoryResult {
  const [story, setStory] = useState<Story | null>(slug ? storyCache.get(slug) ?? null : null);
  const [related, setRelated] = useState<Story[]>([]);
  const [loading, setLoading] = useState(!slug || !storyCache.has(slug));
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setRelatedLoading(false);
      return;
    }

    const cached = storyCache.get(slug);
    if (cached) {
      setStory(cached);
      // Cached: don't show the spinner, but kick off a background
      // refresh so any updates land within a few hundred ms.
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    setRelatedLoading(true);

    const controller = new AbortController();

    (async () => {
      try {
        const data = await apiFetch<Story>(`/stories/${slug}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        storyCache.set(slug, data);
        setStory(data);

        try {
          const relData = await apiFetch<StoriesResponse | Story[]>(
            '/stories/latest',
            { params: { limit: 4 }, signal: controller.signal, retries: 1 },
          );
          if (controller.signal.aborted) return;
          const items = Array.isArray(relData) ? relData : (relData as StoriesResponse).stories ?? [];
          setRelated(items.filter((s) => s.slug !== slug).slice(0, 3));
        } catch (relErr: unknown) {
          if ((relErr as { name?: string })?.name !== 'AbortError') {
            // Related-stories failure is non-fatal — empty list is fine.
            console.warn('[useStory] related fetch failed:', relErr);
          }
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        // Primary endpoint failed: try /stories/latest as a fallback so
        // a transient 4xx on the slug endpoint doesn't dead-end the
        // user when the story is fine and just one route is down.
        try {
          const data = await apiFetch<StoriesResponse | Story[]>(
            '/stories/latest',
            { params: { limit: 50 }, signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          const items = Array.isArray(data) ? data : data.stories ?? [];
          const found = items.find((s) => s.slug === slug);
          if (found) {
            storyCache.set(slug, found);
            setStory(found);
            setRelated(items.filter((s) => s.slug !== slug).slice(0, 3));
          } else {
            setError('Story not found');
          }
        } catch (fallbackErr: unknown) {
          if (controller.signal.aborted) return;
          const msg = friendlyStoryError(fallbackErr);
          if (msg) setError(msg);
        }
      } finally {
        if (controller.signal.aborted) return;
        setLoading(false);
        setRelatedLoading(false);
      }
    })();

    return () => controller.abort();
  }, [slug]);

  return { story, related, loading, relatedLoading, error };
}
