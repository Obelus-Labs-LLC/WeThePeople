/**
 * Vercel Edge Middleware for dynamic OG tags on story pages.
 *
 * When a bot crawler (Reddit, Twitter, Facebook, Slack, Discord, etc.)
 * requests /story/{slug}, this middleware fetches the story data from the
 * WTP API and returns a minimal HTML page with correct OG meta tags.
 *
 * Regular browsers get the normal SPA (index.html).
 */

const BOT_PATTERNS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'Discordbot',
  'WhatsApp',
  'TelegramBot',
  'redditbot',
  'Embedly',
  'Quora Link Preview',
  'Showyoubot',
  'outbrain',
  'pinterest',
  'vkShare',
  'W3C_Validator',
  'Baiduspider',
  'Googlebot',
  'bingbot',
];

const API_BASE = 'https://api.wethepeopleforus.com';
const SITE_URL = 'https://journal.wethepeopleforus.com';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Only intercept /story/{slug} paths
  if (!path.startsWith('/story/')) {
    return;
  }

  // Check if this is a bot
  const ua = request.headers.get('user-agent') || '';
  const isBot = BOT_PATTERNS.some(pattern => ua.toLowerCase().includes(pattern.toLowerCase()));

  if (!isBot) {
    return; // Let the SPA handle it
  }

  // Extract slug
  const slug = path.replace('/story/', '').replace(/\/$/, '');
  if (!slug) {
    return;
  }

  try {
    // Fetch story data from the WTP API
    const res = await fetch(`${API_BASE}/stories/${slug}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      return; // Fall through to SPA on API error
    }

    const story = await res.json();
    const title = story.title || 'The Influence Journal';
    const description = (story.summary || '').slice(0, 200);
    const category = story.category || '';
    const storyUrl = `${SITE_URL}/story/${slug}`;

    // Build minimal HTML with OG tags
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | The Influence Journal</title>
  <meta name="description" content="${escapeHtml(description)}" />

  <meta property="og:type" content="article" />
  <meta property="og:url" content="${storyUrl}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${DEFAULT_IMAGE}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="The Influence Journal" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${DEFAULT_IMAGE}" />

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
  } catch (e) {
    return; // Fall through to SPA on error
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export const config = {
  matcher: '/story/:path*',
};
