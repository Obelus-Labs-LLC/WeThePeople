/**
 * WTP Research API Client
 *
 * Simple fetch wrapper pointing at the shared WTP backend.
 * In production: api.wethepeopleforus.com:8006
 * In dev: proxied through Vite at /api
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export function getApiBase(): string {
  return API_BASE.replace(/\/$/, '');
}

export interface FetchOptions {
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

/**
 * Typed fetch wrapper. Builds URL with query params, returns parsed JSON.
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
 * Build a link to the main WTP site for a given path.
 */
export function mainSiteUrl(path: string): string {
  return `https://wethepeopleforus.com${path}`;
}
