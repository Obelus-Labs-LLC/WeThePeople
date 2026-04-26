/**
 * WTP Journal API Client
 *
 * In production: api.wethepeopleforus.com
 * In dev: proxied through Vite at /api
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export function getApiBase(): string {
  return API_BASE.replace(/\/$/, '');
}

export interface FetchOptions {
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /**
   * Retry transient server errors (network failure or 5xx). Defaults
   * to 2 retries (so up to 3 total attempts) with exponential backoff
   * starting at 200ms. Pass 0 to disable retries entirely (e.g. when a
   * request must be one-shot, or the caller wraps it in its own retry).
   */
  retries?: number;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const DEFAULT_RETRIES = 2;
const BASE_BACKOFF_MS = 200;

function isTransient(status: number): boolean {
  // 408 Request Timeout, 425 Too Early, 429 Too Many, 5xx server-side.
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Typed fetch wrapper. Builds URL with query params, returns parsed
 * JSON. Throws ApiError on non-2xx, retries transient failures.
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

  const maxAttempts = (opts?.retries ?? DEFAULT_RETRIES) + 1;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const res = await fetch(url.toString(), {
        signal: opts?.signal,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        if (isTransient(res.status) && attempt < maxAttempts) {
          await delay(BASE_BACKOFF_MS * 2 ** (attempt - 1), opts?.signal);
          continue;
        }
        throw new ApiError(`API error ${res.status}: ${res.statusText}`, res.status);
      }

      return (await res.json()) as T;
    } catch (err) {
      lastError = err as Error;
      // AbortError must propagate immediately — caller is unmounting.
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      // ApiError already chose to throw vs retry above.
      if (err instanceof ApiError) throw err;
      // Network failure (TypeError on fetch). Retry within budget.
      if (attempt < maxAttempts) {
        await delay(BASE_BACKOFF_MS * 2 ** (attempt - 1), opts?.signal);
        continue;
      }
      throw err;
    }
  }

  // Defensive — should be unreachable because the loop always either
  // returns the JSON or throws. The compiler doesn't know that.
  throw lastError ?? new Error('apiFetch: exhausted retries');
}

/**
 * Build a link to the main WTP site for a given path.
 */
export function mainSiteUrl(path: string): string {
  return `https://wethepeopleforus.com${path}`;
}

/**
 * Build a link to the research site for a given path.
 */
export function researchSiteUrl(path: string): string {
  return `https://research.wethepeopleforus.com${path}`;
}
