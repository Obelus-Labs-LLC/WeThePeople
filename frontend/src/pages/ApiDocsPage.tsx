/**
 * ApiDocsPage — concrete how-to docs for using a WeThePeople API key.
 *
 * The /api page sells the API; this page tells someone with a key
 * exactly how to call the endpoints. curl + JS examples for the
 * most-asked questions.
 *
 * Routes: /docs and /api/docs.
 */

import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import Footer from '../components/Footer';

const FONT_MONO = "'JetBrains Mono', 'Fira Code', monospace";
const FONT_BODY = "'Inter', sans-serif";

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: '14px 16px',
        fontFamily: FONT_MONO,
        fontSize: 12,
        lineHeight: 1.55,
        color: 'var(--color-text-1)',
        overflowX: 'auto',
        margin: '12px 0',
      }}
    >
      {children}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2
        style={{
          fontFamily: FONT_BODY,
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--color-text-1)',
          margin: '0 0 12px',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ApiDocsPage() {
  return (
    <>
      <main
        id="main-content"
        className="flex-1 px-6 py-12"
        style={{ maxWidth: 880, margin: '0 auto', color: 'var(--color-text-1)' }}
      >
        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-text)',
              marginBottom: 8,
            }}
          >
            API documentation
          </div>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontStyle: 'italic',
              fontWeight: 800,
              fontSize: 'clamp(28px, 4vw, 44px)',
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            How to use your API key
          </h1>
          <p
            style={{
              fontFamily: FONT_BODY,
              fontSize: 15,
              color: 'var(--color-text-2)',
              margin: '8px 0 0',
            }}
          >
            Read-only access to every dataset on WeThePeople. Lobbying,
            contracts, enforcement, congressional trades, stories — all of it.
          </p>
        </header>

        <Section title="1. Get a key">
          <p style={{ fontFamily: FONT_BODY, fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-2)' }}>
            Sign in, then mint one from your{' '}
            <Link to="/account?tab=apikeys" style={{ color: 'var(--color-accent-text)' }}>
              account page → API keys tab
            </Link>
            . The raw key is shown <strong>once</strong> — copy it somewhere safe.
            We only store a hash, so we cannot recover it later.
          </p>
        </Section>

        <Section title="2. Authenticate every request">
          <p style={{ fontFamily: FONT_BODY, fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-2)' }}>
            Send the key in the <code style={{ fontFamily: FONT_MONO, color: 'var(--color-accent-text)' }}>X-WTP-API-Key</code>{' '}
            header. The base URL is{' '}
            <code style={{ fontFamily: FONT_MONO, color: 'var(--color-accent-text)' }}>
              https://api.wethepeopleforus.com
            </code>
            .
          </p>
          <CodeBlock>{`curl -H "X-WTP-API-Key: wtp_YOUR_KEY_HERE" \\
  https://api.wethepeopleforus.com/health`}</CodeBlock>
          <p style={{ fontFamily: FONT_BODY, fontSize: 13, color: 'var(--color-text-3)', lineHeight: 1.55 }}>
            Read-only public endpoints (politicians, stories, sector lists)
            don't strictly require a key — but sending one bumps your rate
            limit from 60 req/min to your plan's tier.
          </p>
        </Section>

        <Section title="3. Common queries">
          <h3 style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, marginTop: 16 }}>
            Search across everything
          </h3>
          <CodeBlock>{`curl "https://api.wethepeopleforus.com/search/fast?q=lockheed&limit=10"`}</CodeBlock>

          <h3 style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, marginTop: 16 }}>
            Get a politician's full profile
          </h3>
          <CodeBlock>{`curl "https://api.wethepeopleforus.com/people/mitch_mcconnell/full"`}</CodeBlock>

          <h3 style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, marginTop: 16 }}>
            List recent stories
          </h3>
          <CodeBlock>{`curl "https://api.wethepeopleforus.com/stories/?limit=10&offset=0"`}</CodeBlock>

          <h3 style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, marginTop: 16 }}>
            Filter lobbying by sector
          </h3>
          <CodeBlock>{`curl "https://api.wethepeopleforus.com/finance/companies?limit=20"`}</CodeBlock>

          <h3 style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, marginTop: 16 }}>
            Look up a bill
          </h3>
          <CodeBlock>{`curl "https://api.wethepeopleforus.com/politics/bill/hr1234-118"`}</CodeBlock>
        </Section>

        <Section title="4. Rate limits">
          <p style={{ fontFamily: FONT_BODY, fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-2)' }}>
            Every JSON response carries{' '}
            <code style={{ fontFamily: FONT_MONO, color: 'var(--color-accent-text)' }}>
              RateLimit-Limit
            </code>
            ,{' '}
            <code style={{ fontFamily: FONT_MONO, color: 'var(--color-accent-text)' }}>
              RateLimit-Remaining
            </code>
            , and{' '}
            <code style={{ fontFamily: FONT_MONO, color: 'var(--color-accent-text)' }}>
              RateLimit-Reset
            </code>{' '}
            headers so you can self-pace. A 429 means back off and retry
            after the reset window.
          </p>
        </Section>

        <Section title="5. JavaScript example">
          <CodeBlock>{`const apiKey = 'wtp_YOUR_KEY_HERE';
const base = 'https://api.wethepeopleforus.com';

async function search(q) {
  const r = await fetch(\`\${base}/search/fast?q=\${encodeURIComponent(q)}\`, {
    headers: { 'X-WTP-API-Key': apiKey },
  });
  if (!r.ok) throw new Error(\`HTTP \${r.status}\`);
  return r.json();
}

const hits = await search('lockheed');
console.log(hits.results);`}</CodeBlock>
        </Section>

        <Section title="6. Bulk download">
          <p style={{ fontFamily: FONT_BODY, fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-2)' }}>
            For analytical workloads, skip the API entirely and pull the
            nightly bulk dump (CSV + SQLite). See{' '}
            <Link to="/api" style={{ color: 'var(--color-accent-text)' }}>
              /api
            </Link>{' '}
            for the download URL and schema.
          </p>
        </Section>

        <Section title="7. Endpoint index">
          <ul style={{ fontFamily: FONT_BODY, fontSize: 14, lineHeight: 1.85, color: 'var(--color-text-2)', paddingLeft: 20 }}>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /health</code> — service health check</li>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /search/fast</code> — cross-entity FTS search</li>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /politics/people</code> — list members of Congress</li>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /people/{`{id}`}/full</code> — combined profile + activity</li>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /politics/bill/{`{id}`}</code> — bill detail + timeline</li>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /stories/</code> — published Journal stories</li>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /stories/{`{slug}`}</code> — single story</li>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /{`{sector}`}/companies</code> — sector company list</li>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /civic/state/{`{state}`}</code> — per-state legislators + bills</li>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /research/toxic-releases</code> — EPA TRI data</li>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /research/campaign-finance</code> — FEC data</li>
            <li><code style={{ fontFamily: FONT_MONO }}>GET /anomalies/entity/{`{type}`}/{`{id}`}</code> — detected patterns</li>
          </ul>
          <p style={{ fontFamily: FONT_BODY, fontSize: 13, color: 'var(--color-text-3)', marginTop: 12 }}>
            Full OpenAPI spec at{' '}
            <a
              href="https://api.wethepeopleforus.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--color-accent-text)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              api.wethepeopleforus.com/docs <ExternalLink size={12} />
            </a>{' '}
            (Swagger UI).
          </p>
        </Section>

        <Section title="Questions?">
          <p style={{ fontFamily: FONT_BODY, fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-2)' }}>
            Email{' '}
            <a
              href="mailto:wethepeopleforus@gmail.com"
              style={{ color: 'var(--color-accent-text)' }}
            >
              wethepeopleforus@gmail.com
            </a>{' '}
            or open an issue on{' '}
            <a
              href="https://github.com/Obelus-Labs-LLC/WeThePeople"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-accent-text)' }}
            >
              GitHub
            </a>
            .
          </p>
        </Section>
      </main>
      <Footer />
    </>
  );
}
