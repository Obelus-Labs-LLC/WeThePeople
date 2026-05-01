/**
 * Journal search page.
 *
 * Backed by the platform-wide FTS5 index at /search/fast. We pass
 * types=story to scope the results to journal stories so the user
 * sees only what's relevant on this site (politicians, companies,
 * bills are findable elsewhere on the core site).
 *
 * URL: /search?q=foo
 *   - Empty q renders the prompt.
 *   - Non-empty q hits the API on every keystroke (debounced 200ms).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { getApiBase } from '../api/client';

const API_BASE = getApiBase();

interface Hit {
  entity_type: string;
  entity_id: string;
  title: string;
  snippet: string;
  sector: string | null;
  url: string;
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  usePageMeta({
    title: q ? `“${q}” — Journal search` : 'Search the Journal',
    description: 'Search every published Journal story.',
    canonical: 'https://journal.wethepeopleforus.com/search',
  });

  // Debounce: refresh the URL + fetch 200ms after the last keystroke.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const trimmed = q.trim();
      // Push the q into the URL so the search is shareable + the
      // back button works.
      if (trimmed) setParams({ q: trimmed }, { replace: true });
      else setParams({}, { replace: true });

      if (!trimmed || trimmed.length < 2) {
        setHits([]);
        setError(null);
        return;
      }
      const ctrl = new AbortController();
      setLoading(true);
      setError(null);
      fetch(
        `${API_BASE}/search/fast?types=story&limit=30&q=${encodeURIComponent(trimmed)}`,
        { signal: ctrl.signal },
      )
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => {
          setHits(Array.isArray(d.results) ? d.results : []);
          if (d.warning) setError(d.warning);
        })
        .catch((e) => {
          if (e?.name === 'AbortError') return;
          setError(e?.message ?? 'Search failed');
          setHits([]);
        })
        .finally(() => setLoading(false));
      return () => ctrl.abort();
    }, 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const placeholder = useMemo(
    () => 'Search by company, politician, sector, or keyword…',
    [],
  );

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-12"
      style={{ color: 'var(--color-text-1)' }}
    >
      <div className="max-w-[820px] mx-auto">
        <header style={{ marginBottom: 24 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-text)',
              marginBottom: 8,
            }}
          >
            Search the Journal
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(28px, 4vw, 40px)',
              margin: 0,
            }}
          >
            Find a story
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              color: 'var(--color-text-2)',
              margin: '8px 0 0',
            }}
          >
            Type a company, politician, or keyword. Results match across
            every published story.
          </p>
        </header>

        <div style={{ position: 'relative', marginBottom: 18 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-3)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            style={{
              width: '100%',
              padding: '12px 14px 12px 38px',
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              background: 'var(--color-surface)',
              color: 'var(--color-text-1)',
              outline: 'none',
            }}
          />
        </div>

        {loading && (
          <div style={{ color: 'var(--color-text-3)', fontSize: 13 }}>
            Searching…
          </div>
        )}
        {error && !loading && (
          <div
            style={{
              padding: '10px 12px',
              border: '1px solid rgba(239,68,68,0.25)',
              background: 'rgba(239,68,68,0.06)',
              color: '#fca5a5',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {!loading && !error && q.trim().length >= 2 && hits.length === 0 && (
          <div style={{ color: 'var(--color-text-3)', fontSize: 14 }}>
            No published stories match “{q.trim()}” yet.
          </div>
        )}

        {hits.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {hits.map((h) => (
              <li
                key={`${h.entity_type}:${h.entity_id}`}
                style={{
                  padding: '14px 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <Link
                  to={h.url.startsWith('http') ? h.url.replace(/^https?:\/\/[^/]+/, '') : h.url}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 18,
                    color: 'var(--color-text-1)',
                    textDecoration: 'none',
                    display: 'block',
                    lineHeight: 1.3,
                  }}
                >
                  {h.title}
                </Link>
                {h.sector && (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-3)',
                      marginTop: 4,
                    }}
                  >
                    {h.sector}
                  </div>
                )}
                {h.snippet && (
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 14,
                      color: 'var(--color-text-2)',
                      margin: '6px 0 0',
                      lineHeight: 1.5,
                    }}
                  >
                    {h.snippet}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
