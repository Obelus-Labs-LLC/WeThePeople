import { useEffect, useState } from 'react';
import { apiFetch, isAuthenticated, loginRedirectUrl } from '../api/client';

/**
 * "X of N today" tier-aware quota badge for the Veritas home page.
 *
 * Why this lives in its own component: keeps the auth-state and quota-
 * fetch logic away from the verification handler, which would otherwise
 * grow another async path on every render. Polls /auth/quota once on
 * mount and again whenever a verification completes (re-rendered via
 * a `refreshKey` prop bumped by the parent).
 *
 * Anonymous users see the auth-wall pill instead — clicking it kicks
 * them to /login on the main site with a `next=` back to verify.
 */

interface QuotaBadgeProps {
  /** Increment this from the parent after a verification completes
   *  to force a re-fetch of the quota number. */
  refreshKey?: number;
}

interface QuotaResponse {
  tier: string;
  tier_label: string;
  daily_limit: number;
  used_today: number;
  remaining_today: number;
  reset_seconds: number;
}

const FONT_MONO = "'JetBrains Mono', 'Fira Code', monospace";

export default function QuotaBadge({ refreshKey = 0 }: QuotaBadgeProps) {
  const authed = isAuthenticated();
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!authed) return;
    const controller = new AbortController();
    apiFetch<QuotaResponse>('/auth/quota', { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setQuota(data); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [authed, refreshKey]);

  if (!authed) {
    return (
      <a
        href={loginRedirectUrl()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 999,
          border: '1px solid rgba(16,185,129,0.45)',
          background: 'rgba(16,185,129,0.08)',
          fontFamily: FONT_MONO,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--color-accent-text)',
          textDecoration: 'none',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />
        Sign in to verify
      </a>
    );
  }

  if (error || !quota) {
    return null;  // failed to load — don't render an error in the chrome.
  }

  const isUnlimited = quota.daily_limit === 0;
  const isExhausted = !isUnlimited && quota.remaining_today <= 0;
  const color = isExhausted ? 'var(--color-red)' : 'var(--color-accent-text)';
  const bg = isExhausted ? 'rgba(230,57,70,0.08)' : 'rgba(16,185,129,0.08)';
  const border = isExhausted ? 'rgba(230,57,70,0.45)' : 'rgba(16,185,129,0.45)';

  const label = isUnlimited
    ? `${quota.tier_label} · Unlimited`
    : `${quota.used_today} of ${quota.daily_limit} today`;

  return (
    <span
      title={`Tier: ${quota.tier_label}${isUnlimited ? '' : ` · resets in ${Math.round(quota.reset_seconds / 3600)}h`}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
        fontFamily: FONT_MONO,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
      {isExhausted && (
        <a
          href="https://wethepeopleforus.com/pricing"
          style={{ color, textDecoration: 'underline', marginLeft: 4 }}
        >
          Upgrade
        </a>
      )}
    </span>
  );
}
