import { useEffect } from 'react';

/**
 * Per-page <title>, <meta>, and <link rel="canonical"> management.
 *
 * Why a custom hook instead of react-helmet-async: helmet-async hasn't
 * been updated for React 19 (peer-deps mismatch), so we'd be pinning to
 * a version that doesn't actually support our concurrency mode. The
 * needs here are modest — set/clear a handful of head tags per route
 * — so a small useEffect that mutates document.head directly is the
 * cheapest correct option. Bots get the OG tags from middleware.js
 * (Vercel Edge), not from this hook; this is for human users and for
 * crawlers that *do* execute JavaScript (Googlebot, Bingbot).
 *
 * Behaviour:
 *   - Updates <title> on mount/update.
 *   - Upserts <meta name="description"> and OG/Twitter card tags.
 *   - Upserts <link rel="canonical"> with the current URL or a passed
 *     canonical override.
 *   - Optional structured-data JSON-LD via the `jsonLd` field.
 *   - On unmount, restores the previous <title>; meta tags are left
 *     stale because the next page's call will overwrite them, and a
 *     cleanup race could blank out the meta during a quick route swap.
 */
export interface PageMeta {
  title: string;
  description?: string;
  canonical?: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  publishedAt?: string;
  modifiedAt?: string;
  category?: string;
  /**
   * Optional structured-data object. Will be JSON-stringified into a
   * <script type="application/ld+json"> tag with id="page-jsonld" so a
   * subsequent page can replace it. Pass null to clear it.
   */
  jsonLd?: Record<string, unknown> | null;
}

const SITE_NAME = 'The Influence Journal';
const DEFAULT_OG_IMAGE = 'https://journal.wethepeopleforus.com/og-image.png';

function upsertMeta(
  selector: string,
  attrs: Record<string, string>,
  content: string,
) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertJsonLd(data: Record<string, unknown> | null) {
  const existing = document.head.querySelector('script#page-jsonld');
  if (data === null || data === undefined) {
    if (existing) existing.remove();
    return;
  }
  let el = existing as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.setAttribute('type', 'application/ld+json');
    el.id = 'page-jsonld';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    const fullTitle = meta.title.includes(SITE_NAME)
      ? meta.title
      : `${meta.title} | ${SITE_NAME}`;
    document.title = fullTitle;

    if (meta.description) {
      upsertMeta('meta[name="description"]', { name: 'description' }, meta.description);
      upsertMeta('meta[property="og:description"]', { property: 'og:description' }, meta.description);
      upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, meta.description);
    }

    upsertMeta('meta[property="og:title"]', { property: 'og:title' }, fullTitle);
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, fullTitle);
    upsertMeta('meta[property="og:type"]', { property: 'og:type' }, meta.ogType ?? 'website');
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name' }, SITE_NAME);
    upsertMeta(
      'meta[property="og:image"]',
      { property: 'og:image' },
      meta.ogImage ?? DEFAULT_OG_IMAGE,
    );
    upsertMeta(
      'meta[name="twitter:image"]',
      { name: 'twitter:image' },
      meta.ogImage ?? DEFAULT_OG_IMAGE,
    );
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image');

    const canonical = meta.canonical ?? window.location.href;
    upsertCanonical(canonical);
    upsertMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);

    if (meta.publishedAt) {
      upsertMeta(
        'meta[property="article:published_time"]',
        { property: 'article:published_time' },
        meta.publishedAt,
      );
    }
    if (meta.modifiedAt) {
      upsertMeta(
        'meta[property="article:modified_time"]',
        { property: 'article:modified_time' },
        meta.modifiedAt,
      );
    }
    if (meta.category) {
      upsertMeta(
        'meta[property="article:section"]',
        { property: 'article:section' },
        meta.category,
      );
    }

    if (meta.jsonLd !== undefined) {
      upsertJsonLd(meta.jsonLd);
    }

    return () => {
      document.title = previousTitle;
    };
  }, [
    meta.title,
    meta.description,
    meta.canonical,
    meta.ogType,
    meta.ogImage,
    meta.publishedAt,
    meta.modifiedAt,
    meta.category,
    meta.jsonLd,
  ]);
}
