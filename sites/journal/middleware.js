/**
 * Vercel Edge Middleware for the Influence Journal.
 *
 * Two responsibilities:
 *
 *   1. /story/{slug} for crawlers — when a bot (Reddit, Twitter,
 *      Facebook, Slack, Discord, the major search-engine spiders, …)
 *      requests a story page, fetch the story from the WTP API and
 *      return a minimal HTML body with correct OG/Twitter tags and
 *      schema.org JSON-LD. Regular browsers fall through to the SPA.
 *
 *   2. /sitemap.xml — assemble a sitemap on demand from the API list of
 *      published stories so search engines see fresh slugs without
 *      having to ship a build-time sitemap that goes stale.
 */

// Bot user-agent fragments. Lower-cased; matched as case-insensitive
// substrings against the request UA. Keep this list expansive — under-
// matching means the page ships the SPA shell to a crawler, which means
// blank OG cards on every social platform that didn't land here.
const BOT_PATTERNS = [
  // Social-media link previews
  'facebookexternalhit',
  'facebot',
  'facebookcatalog',
  'twitterbot',
  'linkedinbot',
  'slackbot',
  'discordbot',
  'whatsapp',
  'telegrambot',
  'redditbot',
  'embedly',
  'quora link preview',
  'showyoubot',
  'outbrain',
  'pinterest',
  'pinterestbot',
  'vkshare',
  'tumblr',
  'flipboard',
  'nuzzel',
  'skypeuripreview',
  'mastodon',
  'gigablast',
  // Search-engine crawlers
  'googlebot',
  'googlebot-image',
  'googlebot-news',
  'googlebot-video',
  'googlebot-mobile',
  'adsbot-google',
  'mediapartners-google',
  'bingbot',
  'msnbot',
  'bingpreview',
  'yandexbot',
  'duckduckbot',
  'duckduckgo-favicons-bot',
  'applebot',
  'baiduspider',
  'sogou',
  'exabot',
  'ia_archiver',
  'archive.org_bot',
  'seznambot',
  'mj12bot',
  'ahrefsbot',
  'semrushbot',
  'dotbot',
  'rogerbot',
  // Tooling
  'w3c_validator',
  'lighthouse',
  'chrome-lighthouse',
];

const API_BASE = 'https://api.wethepeopleforus.com';
const SITE_URL = 'https://journal.wethepeopleforus.com';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

// Static sitemap entries that don't depend on the API.
const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/about', changefreq: 'monthly', priority: '0.6' },
  { path: '/coverage', changefreq: 'weekly', priority: '0.7' },
  { path: '/corrections', changefreq: 'weekly', priority: '0.6' },
  { path: '/verify-our-data', changefreq: 'monthly', priority: '0.6' },
  { path: '/subscribe', changefreq: 'monthly', priority: '0.5' },
];

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/sitemap.xml') {
    return handleSitemap();
  }

  if (path.startsWith('/story/')) {
    const ua = request.headers.get('user-agent') || '';
    const lcUa = ua.toLowerCase();
    const isBot = BOT_PATTERNS.some(pattern => lcUa.includes(pattern));
    if (!isBot) {
      return; // Browser → SPA
    }

    const slug = path.replace('/story/', '').replace(/\/$/, '');
    if (!slug) return;
    return handleStoryForBot(slug);
  }

  // Anything else — let Vercel handle it.
  return;
}

async function handleStoryForBot(slug) {
  try {
    const res = await fetch(`${API_BASE}/stories/${slug}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const story = await res.json();

    const title = story.title || 'The Influence Journal';
    const description = truncateAtWord(story.summary || '', 200);
    const storyUrl = `${SITE_URL}/story/${slug}`;
    const image = story.hero_image_url || DEFAULT_IMAGE;
    const published = story.published_at || story.created_at || '';
    const modified = story.updated_at || published;
    const category = story.category || '';

    // schema.org NewsArticle JSON-LD. Helps Google surface the story in
    // Top-Stories carousels and lets other crawlers extract structured
    // metadata without needing to parse HTML.
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: title,
      description,
      url: storyUrl,
      datePublished: published,
      dateModified: modified,
      articleSection: category,
      author: {
        '@type': 'Organization',
        name: 'WeThePeople Research',
        url: 'https://wethepeopleforus.com',
      },
      publisher: {
        '@type': 'Organization',
        name: 'The Influence Journal',
        logo: {
          '@type': 'ImageObject',
          url: DEFAULT_IMAGE,
        },
      },
      image: [image],
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': storyUrl,
      },
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | The Influence Journal</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${storyUrl}" />

  <meta property="og:type" content="article" />
  <meta property="og:url" content="${storyUrl}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="The Influence Journal" />
  ${published ? `<meta property="article:published_time" content="${escapeHtml(published)}" />` : ''}
  ${modified ? `<meta property="article:modified_time" content="${escapeHtml(modified)}" />` : ''}
  ${category ? `<meta property="article:section" content="${escapeHtml(category)}" />` : ''}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />

  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

  <meta http-equiv="refresh" content="0;url=${storyUrl}" />
</head>
<body>
  <p>Redirecting to <a href="${storyUrl}">${escapeHtml(title)}</a></p>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch {
    return; // Fall through to SPA on any error.
  }
}

async function handleSitemap() {
  // Cap the response. The API list endpoint is expected to return
  // recent stories first; very deep history doesn't need to be in the
  // primary sitemap (and we'd want a paginated index for that).
  let stories = [];
  try {
    const res = await fetch(`${API_BASE}/stories/latest?limit=500`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      stories = Array.isArray(data) ? data : (data?.stories ?? []);
    }
  } catch {
    // Falls through with `stories = []`. Even an empty sitemap is
    // better than a 500 — search engines will recrawl later.
  }

  const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  for (const page of STATIC_PAGES) {
    lines.push(
      `<url><loc>${SITE_URL}${page.path}</loc>` +
      `<changefreq>${page.changefreq}</changefreq>` +
      `<priority>${page.priority}</priority></url>`,
    );
  }

  for (const s of stories) {
    if (!s?.slug) continue;
    if (s.status && s.status !== 'published') continue;
    const lastmod = s.updated_at || s.published_at || s.created_at || '';
    lines.push(
      `<url>` +
      `<loc>${SITE_URL}/story/${encodeURIComponent(s.slug)}</loc>` +
      (lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '') +
      `<changefreq>weekly</changefreq>` +
      `<priority>0.8</priority>` +
      `</url>`,
    );
  }

  lines.push('</urlset>');

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=600',
    },
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Trim a description to ~`max` chars without splitting a word in half.
 * If the string already fits, return it unchanged. Otherwise back up to
 * the last space at-or-before `max` and append an ellipsis.
 */
function truncateAtWord(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  const slice = str.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > max * 0.6 ? lastSpace : max;
  return slice.slice(0, cut).trimEnd() + '…';
}

export const config = {
  matcher: ['/story/:path*', '/sitemap.xml'],
};
