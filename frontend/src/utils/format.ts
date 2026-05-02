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
