/**
 * Shared formatting utilities used across all sector pages.
 */

/** Format a number as a compact dollar amount ($1.2T, $3.4B, $5.6M, $7.8K) */
export function fmtDollar(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/** Format a number with locale-aware thousand separators */
export function fmtNum(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return n.toLocaleString();
}

/** Format an ISO date string as "Mar 16, 2026" */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '\u2014';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '\u2014';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Format a number as a compact dollar amount ($1.2T, $1.1B, $5.6M, $123K, $1,234) — for charts/cards */
export function fmtMoney(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

/**
 * Some USAspending/FPDS rows arrive with the raw pipe/bang-delimited
 * record dumped into `description` instead of a human title — e.g.
 *   "200204!008532!1700!AF600 !NAVAL AIR SYSTEMS COMMAND !N0001902C3002 !A!N!…"
 * Render that verbatim and you get an unreadable wall of !!!. This
 * detector returns the fallback when the description looks like raw
 * FPDS structure rather than prose.
 *
 * Heuristic: 8+ exclamation OR pipe separators in the first 300 chars
 * AND the string is long enough to plausibly be a record dump. Errs on
 * the side of false positives — if the title is bad we'd rather show
 * "Contract Award" than the wall.
 */
export function sanitizeContractTitle(
  raw: string | null | undefined,
  fallback: string = 'Contract Award',
): string {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return fallback;
  const head = trimmed.slice(0, 300);
  const bangs = (head.match(/!/g) || []).length;
  const pipes = (head.match(/\|/g) || []).length;
  const separators = bangs + pipes;
  if (separators >= 8 && trimmed.length >= 80) return fallback;
  return trimmed;
}
