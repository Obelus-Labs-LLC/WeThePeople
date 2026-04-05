/**
 * WTP Verify API Client
 *
 * In production: api.wethepeopleforus.com (via Vercel rewrite)
 * In dev: proxied through Vite at /api
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function getApiBase(): string {
  return API_BASE.replace(/\/$/, '');
}

export interface FetchOptions {
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

/**
 * Typed GET fetch wrapper. Builds URL with query params, returns parsed JSON.
 * Throws on non-2xx responses.
 */
export async function apiFetch<T>(path: string, opts?: FetchOptions): Promise<T> {
  const base = getApiBase();
  const url = new URL(`${base}${path}`, window.location.origin);

  if (opts?.params) {
    for (const [key, value] of Object.entries(opts.params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    signal: opts?.signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Typed POST fetch wrapper. Sends JSON body, returns parsed JSON.
 * Throws on non-2xx responses.
 */
export async function apiPost<T>(path: string, body: unknown, opts?: FetchOptions): Promise<T> {
  const base = getApiBase();
  const url = new URL(`${base}${path}`, window.location.origin);

  if (opts?.params) {
    for (const [key, value] of Object.entries(opts.params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    signal: opts?.signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Build a link to the main WTP site for a given path.
 */
export function mainSiteUrl(path: string): string {
  return `https://wethepeopleforus.com${path}`;
}
